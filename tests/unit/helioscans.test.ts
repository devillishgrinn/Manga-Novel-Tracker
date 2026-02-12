import { beforeEach, describe, expect, it, vi } from "vitest";
import { helioScansAdapter } from "../../src/adapters/helioscans";

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

describe("helioScansAdapter", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("match handles chapter-like helioscans URLs", () => {
    expect(helioScansAdapter.match("https://helioscans.com/chapter/abc-123/")).toBe(
      true,
    );
    expect(helioScansAdapter.match("https://helioscans.com/series/abc/12")).toBe(
      true,
    );
    expect(helioScansAdapter.match("https://example.com/chapter/abc-123/")).toBe(
      false,
    );
  });

  it("extract parses title/chapter and uses series link when present", () => {
    setLocation("https://helioscans.com/chapter/264e71b1b29-639aefdfd30/");
    vi.stubGlobal("document", {
      title: "My Story - Chapter 37",
      querySelector: vi
        .fn()
        .mockReturnValueOnce({ href: "https://helioscans.com/series/264e71b1b29/" })
        .mockReturnValueOnce({
          getAttribute: () => "https://img.example/story.jpg",
        }),
    });

    const payload = helioScansAdapter.extract();
    expect(payload).toEqual({
      title: "My Story",
      mediaType: "novel",
      progress: 37,
      unit: "chapter",
      sourceUrl: "https://helioscans.com/chapter/264e71b1b29-639aefdfd30/",
      siteId: "helioscans",
      seriesUrl: "https://helioscans.com/series/264e71b1b29/",
      coverUrl: "https://img.example/story.jpg",
    });
  });

  it("extract builds fallback series URL when h1 series link is missing", () => {
    setLocation("https://helioscans.com/chapter/264e71b1b29-639aefdfd30/");
    vi.stubGlobal("document", {
      title: "My Story Chapter 5",
      querySelector: vi.fn().mockReturnValue(null),
    });

    const payload = helioScansAdapter.extract();
    expect(payload?.seriesUrl).toBe("https://helioscans.com/series/264e71b1b29/");
  });

  it("extract returns null when title does not include chapter format", () => {
    setLocation("https://helioscans.com/chapter/abc/");
    vi.stubGlobal("document", {
      title: "Home",
      querySelector: vi.fn().mockReturnValue(null),
    });

    expect(helioScansAdapter.extract()).toBeNull();
  });
});
