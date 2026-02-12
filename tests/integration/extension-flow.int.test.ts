import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackerPayload } from "../../src/core/models";

type MessageListener = (message: { type: string; payload?: TrackerPayload }) => void;

function createChromeMock() {
  const listeners: MessageListener[] = [];
  const storageState: Record<string, unknown> = {};

  (globalThis as any).chrome = {
    runtime: {
      onMessage: {
        addListener: vi.fn((listener: MessageListener) => listeners.push(listener)),
      },
      sendMessage: vi.fn((message: { type: string; payload?: TrackerPayload }) => {
        listeners.forEach((listener) => listener(message));
      }),
    },
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: storageState[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(storageState, items);
        }),
      },
    },
  };

  return { storageState };
}

function stubFenrirPage(url: string) {
  const parsed = new URL(url);
  vi.stubGlobal("window", {
    location: {
      href: parsed.href,
      origin: parsed.origin,
      pathname: parsed.pathname,
    },
  });

  vi.stubGlobal("document", {
    body: { innerText: "Chapter 12" },
    querySelector: (selector: string) => {
      if (selector === 'meta[property="og:image"]') {
        return { getAttribute: () => "/covers/alpha.jpg" };
      }
      return null;
    },
  });
}

describe("integration: extension flow", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("tracks a Fenrir page end-to-end through contentScript -> background -> storage", async () => {
    createChromeMock();
    stubFenrirPage("https://fenrirealm.com/series/alpha-story/12");
    (globalThis as any).fetch = vi.fn();

    await import("../../src/background");
    await import("../../src/contentScript");

    const { loadEntries } = await import("../../src/core/storage");

    await vi.waitFor(async () => {
      const entries = await loadEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].title).toBe("Alpha Story");
      expect(entries[0].progress).toBe(12);
      expect(entries[0].sourceMap.fenrirealm).toBe(
        "https://fenrirealm.com/series/alpha-story/12",
      );
      expect(entries[0].coverUrl).toBe("https://fenrirealm.com/covers/alpha.jpg");
    });

    expect((globalThis as any).fetch).not.toHaveBeenCalled();
  });

  it("merges cross-site payloads and fills missing cover via background fetch", async () => {
    createChromeMock();
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      text: () =>
        Promise.resolve(`<meta property="og:image" content="/cover-from-fetch.jpg" />`),
    });

    await import("../../src/background");
    const { loadEntries } = await import("../../src/core/storage");

    const firstPayload: TrackerPayload = {
      title: "Shared Story",
      mediaType: "novel",
      progress: 5,
      unit: "chapter",
      sourceUrl: "https://fenrirealm.com/series/shared-story/5",
      siteId: "fenrirealm",
      seriesUrl: "https://fenrirealm.com/series/shared-story",
      coverUrl: "https://fenrirealm.com/covers/shared.jpg",
    };

    const secondPayload: TrackerPayload = {
      title: "Shared Story",
      mediaType: "novel",
      progress: 8,
      unit: "chapter",
      sourceUrl: "https://helioscans.com/chapter/shared-8",
      siteId: "helioscans",
      seriesUrl: "https://helioscans.com/series/shared-story/",
      coverUrl: undefined,
    };

    (globalThis as any).chrome.runtime.sendMessage({
      type: "TRACK_PROGRESS",
      payload: firstPayload,
    });

    await vi.waitFor(async () => {
      const entries = await loadEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].progress).toBe(5);
    });

    (globalThis as any).chrome.runtime.sendMessage({
      type: "TRACK_PROGRESS",
      payload: secondPayload,
    });

    await vi.waitFor(async () => {
      const entries = await loadEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].progress).toBe(8);
      expect(entries[0].sourceMap.fenrirealm).toBe(firstPayload.sourceUrl);
      expect(entries[0].sourceMap.helioscans).toBe(secondPayload.sourceUrl);
      expect(entries[0].coverUrl).toBe("https://helioscans.com/cover-from-fetch.jpg");
    });
  });
});
