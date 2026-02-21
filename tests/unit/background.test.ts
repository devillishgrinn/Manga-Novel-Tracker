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
    const addInstalledListener = vi.fn();
    const addStartupListener = vi.fn();
    const updateDynamicRules = vi.fn().mockResolvedValue(undefined);

    vi.doMock("../../src/core/storage.js", () => ({
      loadEntries,
      saveEntries,
      upsertEntry,
    }));

    (globalThis as any).chrome = {
      runtime: {
        id: "test-extension-id",
        onMessage: { addListener },
        onInstalled: { addListener: addInstalledListener },
        onStartup: { addListener: addStartupListener },
      },
      declarativeNetRequest: { updateDynamicRules },
    };

    await import("../../src/background");
    const listener = addListener.mock.calls[0][0];
    listener({ type: "UNKNOWN" });

    expect(loadEntries).not.toHaveBeenCalled();
    expect(saveEntries).not.toHaveBeenCalled();
    expect(upsertEntry).not.toHaveBeenCalled();
    expect(updateDynamicRules).toHaveBeenCalled();
  });

  it("tracks progress and fetches missing cover when seriesUrl exists", async () => {
    const entries = [{ id: "1" }];
    const updated = [{ id: "1" }, { id: "2" }];
    const loadEntries = vi.fn().mockResolvedValue(entries);
    const saveEntries = vi.fn().mockResolvedValue(undefined);
    const upsertEntry = vi.fn().mockReturnValue(updated);
    const addListener = vi.fn();
    const addInstalledListener = vi.fn();
    const addStartupListener = vi.fn();
    const updateDynamicRules = vi.fn().mockResolvedValue(undefined);

    vi.doMock("../../src/core/storage.js", () => ({
      loadEntries,
      saveEntries,
      upsertEntry,
    }));

    (globalThis as any).chrome = {
      runtime: {
        id: "test-extension-id",
        onMessage: { addListener },
        onInstalled: { addListener: addInstalledListener },
        onStartup: { addListener: addStartupListener },
      },
      declarativeNetRequest: { updateDynamicRules },
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

  it("refines weak title from fetched series page metadata", async () => {
    const entries = [{ id: "1" }];
    const updated = [{ id: "1" }];
    const loadEntries = vi.fn().mockResolvedValue(entries);
    const saveEntries = vi.fn().mockResolvedValue(undefined);
    const upsertEntry = vi.fn().mockReturnValue(updated);
    const addListener = vi.fn();
    const addInstalledListener = vi.fn();
    const addStartupListener = vi.fn();
    const updateDynamicRules = vi.fn().mockResolvedValue(undefined);

    vi.doMock("../../src/core/storage.js", () => ({
      loadEntries,
      saveEntries,
      upsertEntry,
    }));

    (globalThis as any).chrome = {
      runtime: {
        id: "test-extension-id",
        onMessage: { addListener },
        onInstalled: { addListener: addInstalledListener },
        onStartup: { addListener: addStartupListener },
      },
      declarativeNetRequest: { updateDynamicRules },
    };

    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      text: () =>
        Promise.resolve(
          `<script type="application/json">{"seriesNameFromAstro":"A Dragonslayer's Peerless Regression","seriesCoverUrlFromAstro":"/cover.jpg"}</script>`,
        ),
    });

    await import("../../src/background");
    const listener = addListener.mock.calls[0][0];
    const payload = {
      title: "Report a Bug",
      mediaType: "novel",
      progress: 593,
      unit: "chapter",
      sourceUrl: "https://rapid.example/series/dragonslayers-class-regression/bbgtwxv",
      siteId: "rapid",
      seriesUrl: "https://rapid.example/series/dragonslayers-class-regression",
      coverUrl: "https://rapid.example/favicon.svg",
    };

    listener({ type: "TRACK_PROGRESS", payload });

    await vi.waitFor(() => {
      expect(upsertEntry).toHaveBeenCalledWith(entries, payload, payload.siteId);
      expect(saveEntries).toHaveBeenCalledWith(updated);
    });

    expect((globalThis as any).fetch).toHaveBeenCalledWith(payload.seriesUrl);
    expect(payload.title).toBe("A Dragonslayer's Peerless Regression");
    expect(payload.coverUrl).toBe("https://rapid.example/cover.jpg");
  });
});
