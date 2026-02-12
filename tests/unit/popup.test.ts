// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackerEntry } from "../../src/core/models";

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("popup", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = `<div id="list"></div>`;
    (globalThis as any).chrome = {
      tabs: { create: vi.fn() },
    };
    (globalThis as any).confirm = vi.fn();
  });

  it("shows empty state when there are no entries", async () => {
    const loadEntries = vi.fn().mockResolvedValue([]);
    const saveEntries = vi.fn();
    vi.doMock("../../src/core/storage", () => ({ loadEntries, saveEntries }));

    await import("../../src/popup");
    await tick();

    expect(document.getElementById("list")?.textContent).toContain(
      "No tracked entries yet",
    );
  });

  it("renders entries and opens tabs from title/cover clicks", async () => {
    const entries: TrackerEntry[] = [
      {
        id: "id-1",
        title: "Series One",
        mediaType: "novel",
        progress: 12,
        unit: "chapter",
        sourceMap: { fenrirealm: "https://fenrirealm.com/series/a/12" },
        lastUpdated: 10,
        seriesUrl: "https://fenrirealm.com/series/a",
        coverUrl: "https://img.example/a.jpg",
      },
    ];
    const loadEntries = vi.fn().mockResolvedValue(entries);
    const saveEntries = vi.fn();
    vi.doMock("../../src/core/storage", () => ({ loadEntries, saveEntries }));

    await import("../../src/popup");
    await tick();

    (document.querySelector(".title") as HTMLElement).click();
    (document.querySelector(".cover-img") as HTMLElement).click();

    expect((globalThis as any).chrome.tabs.create).toHaveBeenCalledWith({
      url: "https://fenrirealm.com/series/a/12",
    });
    expect((globalThis as any).chrome.tabs.create).toHaveBeenCalledWith({
      url: "https://fenrirealm.com/series/a",
    });
  });

  it("increments progress and saves updated entries on + click", async () => {
    const entries: TrackerEntry[] = [
      {
        id: "id-1",
        title: "Series One",
        mediaType: "novel",
        progress: 5,
        unit: "chapter",
        sourceMap: { fenrirealm: "https://fenrirealm.com/series/a/5" },
        lastUpdated: 100,
      },
    ];
    const loadEntries = vi.fn().mockImplementation(async () => entries);
    const saveEntries = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../../src/core/storage", () => ({ loadEntries, saveEntries }));

    await import("../../src/popup");
    await tick();
    (document.querySelector(".btn-inc") as HTMLButtonElement).click();
    await tick();

    expect(entries[0].progress).toBe(6);
    expect(saveEntries).toHaveBeenCalledWith(entries);
  });

  it("decrements progress with - click and clamps at chapter 1", async () => {
    const entries: TrackerEntry[] = [
      {
        id: "id-1",
        title: "Series One",
        mediaType: "novel",
        progress: 1,
        unit: "chapter",
        sourceMap: { fenrirealm: "https://fenrirealm.com/series/a/1" },
        lastUpdated: 100,
      },
    ];
    const loadEntries = vi.fn().mockImplementation(async () => entries);
    const saveEntries = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../../src/core/storage", () => ({ loadEntries, saveEntries }));

    await import("../../src/popup");
    await tick();
    (document.querySelector(".btn-dec") as HTMLButtonElement).click();
    await tick();

    expect(entries[0].progress).toBe(1);
    expect(entries[0].sourceMap.fenrirealm).toBe("https://fenrirealm.com/series/a/1");
    expect(saveEntries).toHaveBeenCalledWith(entries);
  });

  it("opens the updated chapter URL after progress change", async () => {
    const entries: TrackerEntry[] = [
      {
        id: "id-1",
        title: "Series One",
        mediaType: "novel",
        progress: 5,
        unit: "chapter",
        sourceMap: { fenrirealm: "https://fenrirealm.com/series/a/5" },
        lastUpdated: 100,
      },
    ];
    const loadEntries = vi.fn().mockImplementation(async () => entries);
    const saveEntries = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../../src/core/storage", () => ({ loadEntries, saveEntries }));

    await import("../../src/popup");
    await tick();
    (document.querySelector(".btn-inc") as HTMLButtonElement).click();
    await tick();
    (document.querySelector(".title") as HTMLElement).click();

    expect(entries[0].sourceMap.fenrirealm).toBe("https://fenrirealm.com/series/a/6");
    expect((globalThis as any).chrome.tabs.create).toHaveBeenCalledWith({
      url: "https://fenrirealm.com/series/a/6",
    });
  });

  it("deletes entry when confirmed", async () => {
    const entries: TrackerEntry[] = [
      {
        id: "id-1",
        title: "Series One",
        mediaType: "novel",
        progress: 5,
        unit: "chapter",
        sourceMap: { fenrirealm: "https://fenrirealm.com/series/a/5" },
        lastUpdated: 100,
      },
    ];
    const loadEntries = vi.fn().mockResolvedValue(entries);
    const saveEntries = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../../src/core/storage", () => ({ loadEntries, saveEntries }));
    (globalThis as any).confirm = vi.fn().mockReturnValue(true);

    await import("../../src/popup");
    await tick();
    (document.querySelector(".btn-del") as HTMLButtonElement).click();
    await tick();

    expect(saveEntries).toHaveBeenCalledWith([]);
  });
});
