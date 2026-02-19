// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

function createChromeStorageMock(initialEntries: unknown[] = []) {
  const storageState: Record<string, unknown> = {
    trackerEntries: initialEntries,
  };

  (globalThis as any).chrome = {
    tabs: { create: vi.fn() },
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: storageState[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(storageState, items);
        }),
      },
    },
  };

  return storageState;
}

describe("integration: popup + storage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = `<div id="list"></div>`;
    (globalThis as any).confirm = vi.fn().mockReturnValue(true);
  });

  it("renders, increments progress, and deletes entries using real storage module", async () => {
    const storageState = createChromeStorageMock([
      {
        id: "entry-1",
        title: "Popup Story",
        mediaType: "manga",
        progress: 3,
        unit: "chapter",
        sourceMap: { fenrirealm: "https://fenrirealm.com/series/popup-story/3" },
        lastUpdated: 100,
        seriesUrl: "https://fenrirealm.com/series/popup-story",
        coverUrl: "https://fenrirealm.com/covers/popup.jpg",
      },
    ]);

    await import("../../src/popup");

    await vi.waitFor(() => {
      expect(document.querySelector(".entry")).not.toBeNull();
    });

    (document.querySelector(".btn-inc") as HTMLButtonElement).click();
    await vi.waitFor(() => {
      const entries = storageState.trackerEntries as Array<{ progress: number }>;
      expect(entries[0].progress).toBe(4);
    });

    (document.querySelector(".btn-del") as HTMLButtonElement).click();
    await vi.waitFor(() => {
      const entries = storageState.trackerEntries as unknown[];
      expect(entries).toHaveLength(0);
    });
  });
});

