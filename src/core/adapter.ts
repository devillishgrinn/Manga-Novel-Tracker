import { ProgressSnapshot, SeriesSnapshot, SourceSeriesIdentity, TrackerPayload } from "./models"

/**
 * Source adapters are statically compiled and intentionally parsing-only.
 * Fetching, scheduling, rate limiting, and notification policy belong to the
 * background worker so no adapter can bypass the extension's safety boundary.
 */
export interface SourceAdapter {
  readonly id: string
  readonly displayName: string
  /** Stable public series page used for adapter health probes. */
  readonly healthProbeUrl?: string
  matchesChapter(url: URL): boolean
  extractProgress(doc: Document, url: URL): ProgressSnapshot | null
  identifySeries(doc: Document, url: URL): SourceSeriesIdentity | null
  parseSeriesPage(html: string, url: URL): SeriesSnapshot | null
  buildChapterUrl?(identity: SourceSeriesIdentity, chapter: number): string | null
}

/** Transitional extractor shape used by the original source modules. */
export interface SiteAdapter {
  siteId: string
  match(url: string): boolean
  extract(): TrackerPayload | null
}

/**
 * Keeps existing selector implementations usable while presenting the
 * production adapter contract to the registry. Source modules can be
 * migrated individually without altering the background safety boundary.
 */
export function adaptLegacyAdapter(
  legacy: SiteAdapter,
  displayName: string,
  healthProbeUrl?: string,
): SourceAdapter {
  return {
    id: legacy.siteId,
    displayName,
    healthProbeUrl,
    matchesChapter(url) {
      return legacy.match(url.href)
    },
    extractProgress() {
      const payload = legacy.extract()
      return payload ? payloadToSnapshot(payload) : null
    },
    identifySeries() {
      const payload = legacy.extract()
      return payload ? payloadToSnapshot(payload).identity : null
    },
    parseSeriesPage(html, url) {
      const identity = createSourceSeriesIdentity(legacy.siteId, url.href)
      return parseGenericSeriesPage(identity, html, url)
    },
  }
}

export function canonicalizeSeriesUrl(rawUrl: string): string {
  const url = new URL(rawUrl)
  url.hash = ""
  url.search = ""
  url.hostname = url.hostname.replace(/^www\./i, "").toLowerCase()
  url.pathname = url.pathname.replace(/\/+$/, "") || "/"
  return url.href
}

export function createSourceSeriesIdentity(
  sourceId: string,
  seriesUrl: string,
  externalId?: string,
): SourceSeriesIdentity {
  const canonicalUrl = canonicalizeSeriesUrl(seriesUrl)
  const parsed = new URL(canonicalUrl)
  const key = (externalId || `${parsed.hostname}${parsed.pathname}`).toLowerCase().replace(/^\/+|\/+$/g, "")

  return {
    id: `${sourceId}:${encodeURIComponent(key)}`,
    sourceId,
    externalId: key,
    seriesUrl: canonicalUrl,
  }
}

/** Converts the pre-production adapter payload while preserving source identity. */
export function payloadToSnapshot(payload: TrackerPayload): ProgressSnapshot {
  const seriesUrl = payload.seriesUrl || payload.sourceUrl
  const identity = createSourceSeriesIdentity(payload.siteId, seriesUrl)
  return {
    identity,
    title: payload.title.trim(),
    mediaType: payload.mediaType,
    progress: payload.progress,
    unit: "chapter",
    chapterUrl: payload.sourceUrl,
    coverUrl: payload.coverUrl,
  }
}

export function parseLatestChapterFromHtml(html: string): number | undefined {
  const matches = html.matchAll(/\b(?:chapter|chap|ch)\.?\s*(\d+(?:[._-]\d+)?)/gi)
  let latest: number | undefined
  for (const match of matches) {
    const value = Number(match[1].replace(/[_-]/g, "."))
    if (Number.isFinite(value) && (latest === undefined || value > latest)) {
      latest = value
    }
  }
  return latest
}

export function parseMetadataFromHtml(html: string): { title?: string; coverUrl?: string } {
  const title =
    html.match(/<meta[^>]+(?:property|name)=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
  const coverUrl =
    html.match(/<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image["']/i)?.[1]
  return {
    title: title?.trim(),
    coverUrl: coverUrl?.trim(),
  }
}

export function parseGenericSeriesPage(
  identity: SourceSeriesIdentity,
  html: string,
  pageUrl: URL,
): SeriesSnapshot | null {
  const latestChapter = parseLatestChapterFromHtml(html)
  const metadata = parseMetadataFromHtml(html)
  const coverUrl = metadata.coverUrl
    ? (() => {
        try {
          return new URL(metadata.coverUrl!, pageUrl).href
        } catch {
          return undefined
        }
      })()
    : undefined
  if (!latestChapter && !metadata.title && !coverUrl) return null
  return {
    identity,
    title: metadata.title,
    coverUrl,
    latestChapter,
  }
}
