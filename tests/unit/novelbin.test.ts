import { beforeEach, describe, expect, it, vi } from "vitest";
import { novelbinAdapter } from "../../src/adapters/novelbin";

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

describe("novelbinAdapter", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("match detects NovelBin chapter URLs", () => {
    expect(
      novelbinAdapter.match(
        "https://novelbin.com/b/lord-of-the-mysteries/chapter-123-the-next-step",
      ),
    ).toBe(true);
    expect(
      novelbinAdapter.match(
        "https://www.novelbin.com/b/lord-of-the-mysteries/chapter-12_5",
      ),
    ).toBe(true);
    expect(novelbinAdapter.match("https://novelbin.com/b/lord-of-the-mysteries")).toBe(false);
  });

  it("extract returns payload using heading title and absolute cover URL", () => {
    setLocation("https://novelbin.com/b/lord-of-the-mysteries/chapter-123-the-next-step");

    vi.stubGlobal("document", {
      title: "Lord of the Mysteries - Chapter 123 - Novel Bin",
      querySelector: vi.fn((selector: string) => {
        if (selector.includes('/b/lord-of-the-mysteries') && !selector.includes("/chapter-")) {
          return { textContent: "Lord of the Mysteries" };
        }
        if (selector === 'meta[property="og:image"]') {
          return { getAttribute: () => "/images/novel/lord-of-the-mysteries.jpg" };
        }
        return null;
      }),
    });

    const payload = novelbinAdapter.extract();
    expect(payload).toEqual({
      title: "Lord of the Mysteries",
      mediaType: "novel",
      progress: 123,
      unit: "chapter",
      sourceUrl: "https://novelbin.com/b/lord-of-the-mysteries/chapter-123-the-next-step",
      siteId: "novelbin",
      seriesUrl: "https://novelbin.com/b/lord-of-the-mysteries",
      coverUrl: "https://novelbin.com/images/novel/lord-of-the-mysteries.jpg",
    });
  });

  it("extract parses decimal chapter tokens with underscore", () => {
    setLocation("https://www.novelbin.com/b/example-story/chapter-12_5-bonus");

    vi.stubGlobal("document", {
      title: "Example Story Chapter 12.5 - Novel Bin",
      querySelector: vi.fn().mockReturnValue(null),
    });

    const payload = novelbinAdapter.extract();
    expect(payload?.progress).toBe(12.5);
  });

  it("extract falls back to slug-based title when heading and meta are unavailable", () => {
    setLocation("https://novelbin.com/b/the-lone-wanderer/chapter-559-ten-affinities");

    vi.stubGlobal("document", {
      title: "Novel Bin",
      querySelector: vi.fn().mockReturnValue(null),
    });

    const payload = novelbinAdapter.extract();
    expect(payload?.title).toBe("The Lone Wanderer");
    expect(payload?.coverUrl).toBeUndefined();
  });
});
