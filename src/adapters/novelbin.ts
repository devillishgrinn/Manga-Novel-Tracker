import { SiteAdapter } from "../core/adapter"
import { TrackerPayload } from "../core/models"

const HOST_REGEX = /(^|\.)novelarrow\.com$/i
const CHAPTER_PATH_REGEX = /^\/chapter\/([^/]+)\/chapter-([^/]+)\/?$/i
const SITE_SUFFIX_REGEX = /\s*[-|:]\s*novel\s*bin\b.*$/i
const SITE_NAME_REGEX = /^novel\s*bin$/i

function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ")
}

function parseChapterToken(token: string): number {
  return Number(token.replace(/_/g, "."))
}

function extractChapterParts(pathname: string): { seriesSlug: string; chapter: number } | null {
  const match = pathname.match(CHAPTER_PATH_REGEX)
  if (!match) {
    return null
  }

  const chapter = parseChapterToken(match[2])
  if (Number.isNaN(chapter)) {
    return null
  }

  return {
    seriesSlug: match[1],
    chapter,
  }
}

function extractTitle(): string | null {
  const novelName =
    document.querySelector('meta[property="og:novel:novel_name"]')?.getAttribute("content")?.trim() ||
    null

  const chapterName =
    document.querySelector('meta[property="og:novel:chapter_name"]')?.getAttribute("content")?.trim() ||
    null

  if (novelName && chapterName) {
    return novelName
  }

  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim()
  if (ogTitle) {
    const cleaned = ogTitle.replace(/\s*\|\s*Read on NovelArrow\s*$/i, "").trim()
    const split = cleaned.split(" / ")
    if (split[0]) return split[0].trim()
    return cleaned || null
  }

  const titleTag = document.title?.trim()
  return titleTag || null
}

function extractTitleFromMeta(chapter: number): string | null {
  const rawTitle =
    document.querySelector('meta[property="og:title"]')?.getAttribute("content") || document.title || ""

  const normalized = rawTitle
    .replace(SITE_SUFFIX_REGEX, "")
    .replace(/^read\s+/i, "")
    .trim()

  if (!normalized || SITE_NAME_REGEX.test(normalized)) {
    return null
  }

  const titleBeforeChapter = normalized.match(/^(.*?)\s*[-|:]?\s*Chapter\s+\d+(?:\.\d+)?\b/i)
  if (titleBeforeChapter?.[1]?.trim()) {
    return titleBeforeChapter[1].trim()
  }

  const titleAfterChapter = normalized.match(/^Chapter\s+\d+(?:\.\d+)?\s*[-|:]\s*(.*)$/i)
  if (titleAfterChapter?.[1]?.trim()) {
    return titleAfterChapter[1].trim()
  }

  const exactChapterToken = new RegExp(`\\bChapter\\s+${chapter}(?:\\.0+)?\\b`, "i")
  return (
    normalized
      .replace(exactChapterToken, "")
      .replace(/[\s\-|:]+$/, "")
      .trim() || null
  )
}

function extractCoverUrl(origin: string): string | undefined {
  const rawCover =
    document.querySelector('meta[property="og:image"]')?.getAttribute("content") ||
    document.querySelector('meta[name="twitter:image"]')?.getAttribute("content") ||
    undefined

  if (!rawCover) return undefined

  try {
    return new URL(rawCover, origin).href
  } catch {
    return undefined
  }
}

function extractChapterNumber(pathname: string): number | null {
  const match = pathname.match(/\/chapter\/[^/]+\/chapter-(\d+(?:\.\d+)?)/i)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

export const novelbinAdapter: SiteAdapter = {
  siteId: "novelarrow",

  match(url: string): boolean {
    try {
      const parsed = new URL(url)
      return /(^|\.)novelarrow\.com$/i.test(parsed.hostname) && /^\/chapter\/[^/]+\/chapter-[^/]+\/?$/i.test(parsed.pathname)
    } catch {
      return false
    }
  },

  extract(): TrackerPayload | null {
    const currentUrl = new URL(window.location.href)

    if (!CHAPTER_PATH_REGEX.test(currentUrl.pathname)) {
      return null
    }

    const chapterNumber = extractChapterNumber(currentUrl.pathname)
    if (chapterNumber === null) return null

    const slugMatch = currentUrl.pathname.match(/^\/chapter\/([^/]+)\//i)
    const novelSlug = slugMatch?.[1]
    if (!novelSlug) return null

    const title =
      extractTitle() ||
      novelSlug.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())

    return {
      title,
      mediaType: "novel",
      progress: chapterNumber,
      unit: "chapter",
      sourceUrl: window.location.href,
      siteId: "novelarrow",
      seriesUrl: `${currentUrl.origin}/novel/${novelSlug}`,
      coverUrl: extractCoverUrl(currentUrl.origin),
    }
  },
}
