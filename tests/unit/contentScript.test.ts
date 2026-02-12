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

    vi.doMock("../../src/core/router", () => ({ routePage }));
    (globalThis as any).window = { location: { href: "https://example.com" } };
    (globalThis as any).chrome = { runtime: { sendMessage } };

    await import("../../src/contentScript");

    expect(routePage).toHaveBeenCalledWith("https://example.com");
    expect(sendMessage).toHaveBeenCalledWith({
      type: "TRACK_PROGRESS",
      payload,
    });
  });

  it("does not send message when no payload is returned", async () => {
    const routePage = vi.fn().mockReturnValue(null);
    const sendMessage = vi.fn();

    vi.doMock("../../src/core/router", () => ({ routePage }));
    (globalThis as any).window = { location: { href: "https://example.com" } };
    (globalThis as any).chrome = { runtime: { sendMessage } };

    await import("../../src/contentScript");
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
