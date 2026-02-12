import { beforeEach, describe, expect, it, vi } from "vitest";
import { asuraScansAdapter } from "../../src/adapters/asurascans";

function setLocation(url: string) {
  const parsed = new URL(url);
  vi.stubGlobal("window", {
    location: {
      href: parsed.href,
      origin: parsed.origin,
      pathname: parsed.pathname,
    },
  });
}

describe("asuraScansAdapter", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("match detects Asura chapter URLs across supported domains", () => {
    expect(
      asuraScansAdapter.match(
        "https://asuracomic.net/series/nano-machine-159d6f56/chapter/299",
      ),
    ).toBe(true);
    expect(
      asuraScansAdapter.match(
        "https://beta.asurascans.com/series/nano-machine-159d6f56/chapter/299",
      ),
    ).toBe(true);
    expect(asuraScansAdapter.match("https://asuracomic.net/series/nano-machine-159d6f56")).toBe(
      false,
    );
  });

  it("extract returns payload using heading title and absolute cover URL", () => {
    setLocation("https://asuracomic.net/series/nano-machine-159d6f56/chapter/299");

    vi.stubGlobal("document", {
      title: "Nano Machine Chapter 299 - Asura Scans",
      querySelector: vi
        .fn()
        .mockReturnValueOnce({ textContent: "Nano Machine" })
        .mockReturnValueOnce({ getAttribute: () => "https://gg.asuracomic.net/storage/media/103/cover.webp" })
        .mockReturnValueOnce(null),
    });

    const payload = asuraScansAdapter.extract();
    expect(payload).toEqual({
      title: "Nano Machine",
      mediaType: "manga",
      progress: 299,
      unit: "chapter",
      sourceUrl: "https://asuracomic.net/series/nano-machine-159d6f56/chapter/299",
      siteId: "asurascans",
      seriesUrl: "https://asuracomic.net/series/nano-machine-159d6f56",
      coverUrl: "https://gg.asuracomic.net/storage/media/103/cover.webp",
    });
  });

  it("extract falls back to slug-based title when heading and meta title are unavailable", () => {
    setLocation("https://asuracomic.net/series/nano-machine-159d6f56/chapter/299");

    vi.stubGlobal("document", {
      title: "Asura Scans",
      querySelector: vi.fn().mockReturnValue(null),
    });

    const payload = asuraScansAdapter.extract();
    expect(payload?.title).toBe("Nano Machine");
    expect(payload?.coverUrl).toBeUndefined();
  });

  it("extract returns null when URL does not point to a chapter page", () => {
    setLocation("https://asuracomic.net/series/nano-machine-159d6f56");
    vi.stubGlobal("document", {
      title: "Nano Machine - Asura Scans",
      querySelector: vi.fn().mockReturnValue(null),
    });

    expect(asuraScansAdapter.extract()).toBeNull();
  });
});
