import { describe, expect, it, vi } from "vitest";

describe("routePage", () => {
  it("returns extracted payload from first matching adapter", async () => {
    vi.resetModules();
    const extract = vi.fn().mockReturnValue({ title: "x" });

    vi.doMock("../../src/core/registry", () => ({
      adapters: [
        { match: () => false, extract: vi.fn() },
        { match: () => true, extract },
      ],
    }));

    const { routePage } = await import("../../src/core/router");
    const result = routePage("https://example.com");

    expect(extract).toHaveBeenCalled();
    expect(result).toEqual({ title: "x" });
  });

  it("returns null when no adapter matches", async () => {
    vi.resetModules();
    vi.doMock("../../src/core/registry", () => ({
      adapters: [{ match: () => false, extract: vi.fn() }],
    }));

    const { routePage } = await import("../../src/core/router");
    expect(routePage("https://example.com")).toBeNull();
  });
});
