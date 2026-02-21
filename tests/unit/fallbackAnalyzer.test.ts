import { describe, expect, it, vi } from "vitest";
import { analyzeCurrentPage } from "../../src/core/fallbackAnalyzer";

type DocStub = {
  title: string;
  body: { innerText: string };
  querySelector: (selector: string) => { textContent?: string; getAttribute?: (name: string) => string | null } | null;
};

function createDoc(overrides?: Partial<DocStub>): Document {
  const base: DocStub = {
    title: "Alpha Story - Chapter 45",
    body: { innerText: "Read Alpha Story Chapter 45" },
    querySelector: (selector: string) => {
      if (selector === "h1") return { textContent: "Alpha Story" };
      if (selector === 'meta[property="og:image"]') {
        return { getAttribute: () => "/covers/alpha.jpg" };
      }
      return null;
    },
  };

  const next = { ...base, ...overrides };
  return next as unknown as Document;
}

describe("analyzeCurrentPage", () => {
  it("extracts payload for chapter page with strong signals", () => {
    const result = analyzeCurrentPage(
      "https://reader.example.com/series/alpha-story/chapter-45",
      createDoc(),
    );

    expect(result).not.toBeNull();
    expect(result?.payload.title).toBe("Alpha Story");
    expect(result?.payload.progress).toBe(45);
    expect(result?.payload.seriesUrl).toBe("https://reader.example.com/series/alpha-story");
    expect(result?.confidence).toBeGreaterThanOrEqual(80);
  });

  it("returns null when chapter cannot be inferred", () => {
    const result = analyzeCurrentPage(
      "https://reader.example.com/series/alpha-story",
      createDoc({
        title: "Alpha Story",
        body: { innerText: "Welcome to Alpha Story" },
      }),
    );

    expect(result).toBeNull();
  });

  it("infers novel media type from title keywords", () => {
    const result = analyzeCurrentPage(
      "https://novels.example.com/read/alpha-story/chapter-9",
      createDoc({
        title: "Alpha Story Light Novel Chapter 9",
        querySelector: vi.fn((selector: string) => {
          if (selector === "h1") return { textContent: "Alpha Story Light Novel" };
          return null;
        }) as DocStub["querySelector"],
      }),
    );

    expect(result?.payload.mediaType).toBe("novel");
  });

  it("falls back to cover image element selectors when og:image is missing", () => {
    const result = analyzeCurrentPage(
      "https://reader.example.com/series/alpha-story/chapter-46",
      createDoc({
        querySelector: vi.fn((selector: string) => {
          if (selector === "h1") return { textContent: "Alpha Story" };
          if (selector === 'img[class*="cover" i]') {
            return { getAttribute: () => "/assets/covers/alpha-46.webp" };
          }
          return null;
        }) as DocStub["querySelector"],
      }),
    );

    expect(result?.payload.coverUrl).toBe(
      "https://reader.example.com/assets/covers/alpha-46.webp",
    );
  });

  it("ignores generic modal headings and infers title/site/series from URL+site identity", () => {
    const result = analyzeCurrentPage(
      "https://t87p34ahr7i09lm.live/series/dragonslayers-class-regression/bbgtwxv",
      createDoc({
        title: "RAPID",
        body: { innerText: "Read chapter 593 now" },
        querySelector: vi.fn((selector: string) => {
          if (selector === "h1") return { textContent: "Report a Bug" };
          if (selector === "header .header-wordmark") return { textContent: "RAPID" };
          return null;
        }) as DocStub["querySelector"],
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.payload.title).toBe("Dragonslayers Class Regression");
    expect(result?.payload.siteId).toBe("rapid");
    expect(result?.payload.progress).toBe(593);
    expect(result?.payload.seriesUrl).toBe(
      "https://t87p34ahr7i09lm.live/series/dragonslayers-class-regression",
    );
  });

  it("ignores chapter-only headings and keeps series slug as title", () => {
    const result = analyzeCurrentPage(
      "https://reader.example.com/series/alpha-story/chapter-12",
      createDoc({
        title: "Chapter 12",
        body: { innerText: "Chapter 12 content" },
        querySelector: vi.fn((selector: string) => {
          if (selector === "h1") return { textContent: "Chapter 12" };
          return null;
        }) as DocStub["querySelector"],
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.payload.title).toBe("Alpha Story");
  });
});
