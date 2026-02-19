import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadEntries, saveEntries, upsertEntry } from "../../src/core/storage";
import type { TrackerEntry, TrackerPayload } from "../../src/core/models";

declare global {
  // eslint-disable-next-line no-var
  var chrome: any;
}

describe("storage", () => {
  const getMock = vi.fn();
  const setMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.chrome = {
      storage: {
        local: {
          get: getMock,
          set: setMock,
        },
      },
    };
  });

  it("loadEntries returns empty array when stored value is not an array", async () => {
    getMock.mockResolvedValue({ trackerEntries: null });
    const result = await loadEntries();
    expect(result).toEqual([]);
  });

  it("loadEntries returns stored entries array", async () => {
    const stored: TrackerEntry[] = [
      {
        id: "1",
        title: "A",
        mediaType: "novel",
        progress: 1,
        unit: "chapter",
        sourceMap: { fenrirealm: "https://x" },
        lastUpdated: 1,
      },
    ];
    getMock.mockResolvedValue({ trackerEntries: stored });
    const result = await loadEntries();
    expect(result).toEqual(stored);
  });

  it("loadEntries consolidates duplicates with matching series", async () => {
    const stored: TrackerEntry[] = [
      {
        id: "1",
        title: "Shared Story",
        mediaType: "novel",
        progress: 10,
        unit: "chapter",
        sourceMap: { asuracomic: "https://asuracomic.net/series/shared-story/chapter/10" },
        lastUpdated: 100,
        seriesUrl: "https://asuracomic.net/series/shared-story",
      },
      {
        id: "2",
        title: "Shared Story",
        mediaType: "novel",
        progress: 12,
        unit: "chapter",
        sourceMap: { asurascans: "https://asurascans.com/series/shared-story/chapter/12" },
        lastUpdated: 200,
        seriesUrl: "https://asurascans.com/series/shared-story",
      },
    ];
    getMock.mockResolvedValue({ trackerEntries: stored });

    const result = await loadEntries();
    expect(result).toHaveLength(1);
    expect(result[0].progress).toBe(12);
    expect(result[0].sourceMap.asurascans).toBe(
      "https://asurascans.com/series/shared-story/chapter/12",
    );
  });

  it("saveEntries writes to chrome storage with trackerEntries key", async () => {
    const entries: TrackerEntry[] = [];
    await saveEntries(entries);
    expect(setMock).toHaveBeenCalledWith({ trackerEntries: entries });
  });

  it("upsertEntry creates a new entry when title+mediaType does not exist", () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);
    vi.stubGlobal("crypto", { randomUUID: () => "uuid-1" });

    const payload: TrackerPayload = {
      title: "Solo Leveling",
      mediaType: "novel",
      progress: 12,
      unit: "chapter",
      sourceUrl: "https://fenrirealm.com/series/solo-leveling/12",
      siteId: "fenrirealm",
      coverUrl: "https://img.example/solo.jpg",
      seriesUrl: "https://fenrirealm.com/series/solo-leveling",
    };

    const result = upsertEntry([], payload, payload.siteId);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "uuid-1",
      title: payload.title,
      mediaType: payload.mediaType,
      progress: payload.progress,
      unit: payload.unit,
      sourceMap: { fenrirealm: payload.sourceUrl },
      lastUpdated: 1234,
      latestKnownChapter: payload.progress,
      coverUrl: payload.coverUrl,
      seriesUrl: payload.seriesUrl,
    });
  });

  it("upsertEntry updates existing entry only when progress increases", () => {
    vi.spyOn(Date, "now").mockReturnValue(2000);
    const existing: TrackerEntry = {
      id: "id-1",
      title: "Solo Leveling",
      mediaType: "novel",
      progress: 30,
      unit: "chapter",
      sourceMap: { fenrirealm: "https://old" },
      lastUpdated: 1000,
      coverUrl: "https://old-cover",
      seriesUrl: "https://old-series",
    };
    const payload: TrackerPayload = {
      title: "Solo Leveling",
      mediaType: "novel",
      progress: 20,
      unit: "chapter",
      sourceUrl: "https://new-source",
      siteId: "helioscans",
      coverUrl: "https://new-cover",
      seriesUrl: "https://new-series",
    };

    const result = upsertEntry([existing], payload, payload.siteId);
    expect(result[0].progress).toBe(30);
    expect(result[0].lastUpdated).toBe(1000);
    expect(result[0].coverUrl).toBe("https://new-cover");
    expect(result[0].seriesUrl).toBe("https://new-series");
    expect(result[0].sourceMap).toEqual({
      fenrirealm: "https://old",
      helioscans: "https://new-source",
    });
  });

  it("upsertEntry updates progress and timestamp when incoming progress is higher", () => {
    vi.spyOn(Date, "now").mockReturnValue(2222);
    const existing: TrackerEntry = {
      id: "id-1",
      title: "A",
      mediaType: "novel",
      progress: 2,
      unit: "chapter",
      sourceMap: {},
      lastUpdated: 1,
    };
    const payload: TrackerPayload = {
      title: "A",
      mediaType: "novel",
      progress: 9,
      unit: "chapter",
      sourceUrl: "https://x",
      siteId: "fenrirealm",
    };

    const result = upsertEntry([existing], payload, payload.siteId);
    expect(result[0].progress).toBe(9);
    expect(result[0].lastUpdated).toBe(2222);
  });

  it("upsertEntry merges by normalized series URL even when title formatting differs", () => {
    vi.spyOn(Date, "now").mockReturnValue(3333);
    const existing: TrackerEntry = {
      id: "id-1",
      title: "A Dragonslayer's Peerless Regression",
      mediaType: "novel",
      progress: 590,
      unit: "chapter",
      sourceMap: {
        rapid: "https://t87p34ahr7i09lm.live/series/dragonslayers-class-regression/aa11111",
      },
      seriesUrl: "https://t87p34ahr7i09lm.live/series/dragonslayers-class-regression",
      lastUpdated: 1000,
    };

    const payload: TrackerPayload = {
      title: "Dragonslayers Class Regression",
      mediaType: "novel",
      progress: 593,
      unit: "chapter",
      sourceUrl: "https://t87p34ahr7i09lm.live/series/dragonslayers-class-regression/bbgtwxv",
      siteId: "t87p34ahr7i09lm.live",
      seriesUrl: "https://t87p34ahr7i09lm.live/series/dragonslayers-class-regression",
    };

    const result = upsertEntry([existing], payload, payload.siteId);
    expect(result).toHaveLength(1);
    expect(result[0].progress).toBe(593);
    expect(result[0].sourceMap.rapid).toBe(payload.sourceUrl);
  });
});
