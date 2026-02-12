import { beforeEach, describe, expect, it, vi } from "vitest";

describe("background message handling", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("ignores unsupported message types", async () => {
    const loadEntries = vi.fn();
    const saveEntries = vi.fn();
    const upsertEntry = vi.fn();
    const addListener = vi.fn();

    vi.doMock("../../src/core/storage.js", () => ({
      loadEntries,
      saveEntries,
      upsertEntry,
    }));

    (globalThis as any).chrome = {
      runtime: { onMessage: { addListener } },
    };

    await import("../../src/background");
    const listener = addListener.mock.calls[0][0];
    listener({ type: "UNKNOWN" });

    expect(loadEntries).not.toHaveBeenCalled();
    expect(saveEntries).not.toHaveBeenCalled();
    expect(upsertEntry).not.toHaveBeenCalled();
  });

  it("tracks progress and fetches missing cover when seriesUrl exists", async () => {
    const entries = [{ id: "1" }];
    const updated = [{ id: "1" }, { id: "2" }];
    const loadEntries = vi.fn().mockResolvedValue(entries);
    const saveEntries = vi.fn().mockResolvedValue(undefined);
    const upsertEntry = vi.fn().mockReturnValue(updated);
    const addListener = vi.fn();

    vi.doMock("../../src/core/storage.js", () => ({
      loadEntries,
      saveEntries,
      upsertEntry,
    }));

    (globalThis as any).chrome = {
      runtime: { onMessage: { addListener } },
    };

    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      text: () =>
        Promise.resolve(
          `<meta property="og:image" content="/cover.jpg" />`,
        ),
    });

    await import("../../src/background");
    const listener = addListener.mock.calls[0][0];
    const payload = {
      title: "A",
      mediaType: "novel",
      progress: 2,
      unit: "chapter",
      sourceUrl: "https://fenrirealm.com/series/a/2",
      siteId: "fenrirealm",
      seriesUrl: "https://fenrirealm.com/series/a",
      coverUrl: undefined,
    };

    listener({ type: "TRACK_PROGRESS", payload });

    await vi.waitFor(() => {
      expect(upsertEntry).toHaveBeenCalledWith(entries, payload, payload.siteId);
      expect(saveEntries).toHaveBeenCalledWith(updated);
    });

    expect((globalThis as any).fetch).toHaveBeenCalledWith(payload.seriesUrl);
    expect(payload.coverUrl).toBe("https://fenrirealm.com/cover.jpg");
  });
});
