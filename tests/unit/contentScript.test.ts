import { beforeEach, describe, expect, it, vi } from "vitest";

describe("contentScript", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("sends TRACK_PROGRESS when routePage returns payload", async () => {
    const payload = { title: "A" };
    const routePage = vi.fn().mockReturnValue(payload);
    const sendMessage = vi.fn();
    const addListener = vi.fn();
    const get = vi.fn().mockResolvedValue({});

    vi.doMock("../../src/core/router", () => ({ routePage }));
    (globalThis as any).window = { location: { href: "https://example.com" } };
    (globalThis as any).chrome = {
      runtime: { sendMessage, onMessage: { addListener } },
      storage: { local: { get } },
    };

    await import("../../src/contentScript");

    expect(routePage).toHaveBeenCalledWith("https://example.com");
    expect(sendMessage).toHaveBeenCalledWith({
      type: "TRACK_PROGRESS",
      payload,
    });
    expect(addListener).toHaveBeenCalledTimes(1);
  });

  it("does not send message when no payload is returned", async () => {
    const routePage = vi.fn().mockReturnValue(null);
    const sendMessage = vi.fn();
    const addListener = vi.fn();
    const get = vi.fn().mockResolvedValue({});

    vi.doMock("../../src/core/router", () => ({ routePage }));
    (globalThis as any).window = {
      location: { href: "https://example.com", hostname: "example.com" },
    };
    (globalThis as any).document = {
      title: "Example",
      body: { innerText: "" },
      querySelector: vi.fn().mockReturnValue(null),
    };
    (globalThis as any).chrome = {
      runtime: { sendMessage, onMessage: { addListener } },
      storage: { local: { get } },
    };

    await import("../../src/contentScript");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("auto-tracks unsupported page when domain rule is enabled and confidence threshold is met", async () => {
    const routePage = vi.fn().mockReturnValue(null);
    const sendMessage = vi.fn();
    const addListener = vi.fn();
    const get = vi.fn().mockResolvedValue({
      domainAutoTrackRules: {
        "example.com": { autoTrack: true, minConfidence: 75 },
      },
    });

    vi.doMock("../../src/core/router", () => ({ routePage }));
    (globalThis as any).window = {
      location: {
        href: "https://example.com/series/alpha/chapter-12",
        hostname: "example.com",
      },
    };
    (globalThis as any).document = {
      title: "Alpha - Chapter 12",
      body: { innerText: "Chapter 12" },
      querySelector: vi.fn((selector: string) => {
        if (selector === "h1") return { textContent: "Alpha" };
        return null;
      }),
    };
    (globalThis as any).chrome = {
      runtime: { sendMessage, onMessage: { addListener } },
      storage: { local: { get } },
    };

    await import("../../src/contentScript");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendMessage).toHaveBeenCalledWith({
      type: "TRACK_PROGRESS",
      payload: expect.objectContaining({
        title: "Alpha",
        progress: 12,
        siteId: "example.com",
      }),
    });
  });
});
