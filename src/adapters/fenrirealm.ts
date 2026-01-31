import { SiteAdapter } from "../core/adapter"
import { TrackerPayload } from "../core/models"

function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

function extractChapterFromText(): number | null {
  const match = document.body.innerText.match(/Chapter\s+(\d+(\.\d+)?)/i)
  return match ? parseFloat(match[1]) : null
}

export const fenrirealmAdapter: SiteAdapter = {
  siteId: "fenrirealm",

  match(url: string): boolean {
    return /fenrirealm\.com\/series\/[^/]+\/\d+/.test(url)
  },

  extract(): TrackerPayload | null {
    const url = new URL(window.location.href)
    const parts = url.pathname.split("/").filter(Boolean)

    // /series/{slug}/{chapter}
    if (parts.length < 3) return null

    const seriesSlug = parts[1]
    const chapterFromUrl = Number(parts[2])

    const chapter =
      !Number.isNaN(chapterFromUrl)
        ? chapterFromUrl
        : extractChapterFromText()

    if (!chapter) return null

    return {
      title: slugToTitle(seriesSlug),
      mediaType: "novel",
      progress: chapter,
      unit: "chapter",
      sourceUrl: window.location.href,
      siteId: "fenrirealm"
    }
  }
}
