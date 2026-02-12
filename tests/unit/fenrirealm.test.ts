import { beforeEach, describe, expect, it, vi } from "vitest";
import { fenrirealmAdapter } from "../../src/adapters/fenrirealm";

function setWindowLocation(url: string) {
  const parsed = new URL(url);
  vi.stubGlobal("window", {
    location: {
      href: parsed.href,
      origin: parsed.origin,
      pathname: parsed.pathname,
    },
  });
}

describe("fenrirealmAdapter", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("match detects fenrirealm chapter URLs", () => {
    expect(fenrirealmAdapter.match("https://fenrirealm.com/series/abc/10")).toBe(
      true,
    );
    expect(fenrirealmAdapter.match("https://fenrirealm.com/series/abc")).toBe(
      false,
    );
  });

  it("extract returns payload with absolute cover URL", () => {
    setWindowLocation("https://fenrirealm.com/series/solo-leveling/12");
    vi.stubGlobal("document", {
      body: { innerText: "Chapter 12" },
      querySelector: vi
        .fn()
        .mockReturnValueOnce({ getAttribute: () => "/images/solo.jpg" })
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(null),
    });

    const payload = fenrirealmAdapter.extract();
    expect(payload).toEqual({
      title: "Solo Leveling",
      mediaType: "novel",
      progress: 12,
      unit: "chapter",
      sourceUrl: "https://fenrirealm.com/series/solo-leveling/12",
      siteId: "fenrirealm",
      seriesUrl: "https://fenrirealm.com/series/solo-leveling",
      coverUrl: "https://fenrirealm.com/images/solo.jpg",
    });
  });

  it("extract falls back to chapter in body text when URL chapter is NaN", () => {
    setWindowLocation("https://fenrirealm.com/series/solo-leveling/invalid");
    vi.stubGlobal("document", {
      body: { innerText: "Read Chapter 44.5 now" },
      querySelector: vi.fn().mockReturnValue(null),
    });

    const payload = fenrirealmAdapter.extract();
    expect(payload?.progress).toBe(44.5);
  });

  it("extract returns null when chapter is missing", () => {
    setWindowLocation("https://fenrirealm.com/series/solo-leveling/invalid");
    vi.stubGlobal("document", {
      body: { innerText: "No chapter text" },
      querySelector: vi.fn().mockReturnValue(null),
    });

    expect(fenrirealmAdapter.extract()).toBeNull();
  });
});
