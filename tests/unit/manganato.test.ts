import { beforeEach, describe, expect, it, vi } from "vitest"
import { manganatoAdapter } from "../../src/adapters/manganato"

function setLocation(url: string) {
  const parsed = new URL(url)
  vi.stubGlobal("window", {
    location: {
      href: parsed.href,
      origin: parsed.origin,
      pathname: parsed.pathname,
    },
  })
}

describe("manganatoAdapter", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it("match detects chapter URLs on both supported domains", () => {
    expect(manganatoAdapter.match("https://www.manganato.gg/manga/nano-machine/chapter-299")).toBe(true)
    expect(manganatoAdapter.match("https://www.mangakakalot.gg/manga/nano-machine/chapter_299")).toBe(true)
    expect(manganatoAdapter.match("https://www.manganato.gg/manga/nano-machine")).toBe(false)
  })

  it("extract returns payload with heading title and absolute cover URL", () => {
    setLocation("https://www.manganato.gg/manga/solo-leveling/chapter-12")

    const querySelector = vi.fn((selector: string) => {
      if (selector.startsWith("h1")) {
        return { textContent: "Solo Leveling" }
      }
      if (selector === ".panel-story-info img") {
        return { getAttribute: () => "/images/solo.jpg" }
      }
      return null
    })

    vi.stubGlobal("document", {
      title: "Solo Leveling Chapter 12 - MangaNato",
      querySelector,
    })

    const payload = manganatoAdapter.extract()
    expect(payload).toEqual({
      title: "Solo Leveling",
      mediaType: "manga",
      progress: 12,
      unit: "chapter",
      sourceUrl: "https://www.manganato.gg/manga/solo-leveling/chapter-12",
      siteId: "manganato",
      seriesUrl: "https://www.manganato.gg/manga/solo-leveling",
      coverUrl: "https://www.manganato.gg/images/solo.jpg",
    })
  })

  it("extract keeps CDN cover URLs so popup can load them with request-header rules", () => {
    setLocation("https://www.manganato.gg/manga/solo-leveling/chapter-12")

    const querySelector = vi.fn((selector: string) => {
      if (selector.startsWith("h1")) {
        return { textContent: "Solo Leveling" }
      }
      if (selector === ".panel-story-info img") {
        return { getAttribute: () => "https://img-r1.2xstorage.com/thumb/solo-leveling.webp" }
      }
      return null
    })

    vi.stubGlobal("document", {
      title: "Solo Leveling Chapter 12 - MangaNato",
      querySelector,
    })

    const payload = manganatoAdapter.extract()
    expect(payload?.coverUrl).toBe("https://img-r1.2xstorage.com/thumb/solo-leveling.webp")
  })

  it("extract falls back to slug-based title when heading and meta are unavailable", () => {
    setLocation("https://www.mangakakalot.gg/manga/the-great-story/chapter-1")

    vi.stubGlobal("document", {
      title: "",
      querySelector: vi.fn().mockReturnValue(null),
    })

    const payload = manganatoAdapter.extract()
    expect(payload?.title).toBe("The Great Story")
    expect(payload?.coverUrl).toBeUndefined()
  })

  it("extract returns null when URL does not point to chapter page", () => {
    setLocation("https://www.mangakakalot.gg/manga/the-great-story")

    vi.stubGlobal("document", {
      title: "The Great Story - MangaKakalot",
      querySelector: vi.fn().mockReturnValue(null),
    })

    expect(manganatoAdapter.extract()).toBeNull()
  })
})
