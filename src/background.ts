import { loadEntries, saveEntries, upsertEntry } from "./core/storage.js"
import { TrackerPayload } from "./core/models"

console.log("Manga/Novel Tracker background loaded")

const GENERIC_COVER_PATH_REGEX =
  /\/(?:images\/(?:og-image|logo|svg\/logo|default_nato|404-avatar|no-avatar)|favicon|icon|logo|avatar|default|placeholder|no-cover)/i
const GENERIC_TITLE_REGEX =
  /^(report\s+a\s+bug|unlock\s+chapter|account|profile|home|library|roadmap|explore|sign\s*in|log\s*in|register|search|menu|notices?|chapter\s*\d+(?:[._-]\d+)?|ch\.?\s*\d+(?:[._-]\d+)?)$/i
const MANGA_CDN_REFERER_RULE_IDS = [91001, 91002, 91003]
const MANGA_REFERER = "https://www.manganato.gg/"

async function ensureMangaCdnRefererRules(): Promise<void> {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) {
    return
  }

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: MANGA_CDN_REFERER_RULE_IDS,
      addRules: [
        {
          id: 91001,
          priority: 1,
          action: {
            type: "modifyHeaders",
            requestHeaders: [{ header: "referer", operation: "set", value: MANGA_REFERER }],
          },
          condition: {
            regexFilter: "^https?://img-r1\\.2xstorage\\.com/.*",
            resourceTypes: ["image"],
            initiatorDomains: [chrome.runtime.id],
          },
        },
        {
          id: 91002,
          priority: 1,
          action: {
            type: "modifyHeaders",
            requestHeaders: [{ header: "referer", operation: "set", value: MANGA_REFERER }],
          },
          condition: {
            regexFilter: "^https?://storage\\.waitst\\.com/.*",
            resourceTypes: ["image"],
            initiatorDomains: [chrome.runtime.id],
          },
        },
        {
          id: 91003,
          priority: 1,
          action: {
            type: "modifyHeaders",
            requestHeaders: [{ header: "referer", operation: "set", value: MANGA_REFERER }],
          },
          condition: {
            regexFilter: "^https?://imgs-2\\.2xstorage\\.com/.*",
            resourceTypes: ["image"],
            initiatorDomains: [chrome.runtime.id],
          },
        },
      ],
    })
  } catch (err) {
    console.error("Failed to set manga CDN header rules:", err)
  }
}

function isUsableCoverUrl(url: string, seriesUrl: string): boolean {
  try {
    const resolved = new URL(url)
    const seriesOrigin = new URL(seriesUrl).origin
    if ((resolved.protocol !== "http:" && resolved.protocol !== "https:") || /\.(?:svg|ico)$/i.test(resolved.pathname)) {
      return false
    }
    if (!resolved.pathname || resolved.pathname === "/") {
      return false
    }
    if (resolved.origin === seriesOrigin && GENERIC_COVER_PATH_REGEX.test(resolved.pathname)) {
      return false
    }
    if (GENERIC_COVER_PATH_REGEX.test(resolved.pathname)) {
      return false
    }

    return true
  } catch {
    return false
  }
}

function resolveCoverUrl(rawUrl: string, seriesUrl: string): string | null {
  try {
    return new URL(rawUrl, seriesUrl).href
  } catch {
    return null
  }
}

function extractCoverFromHtml(html: string, seriesUrl: string): string | null {
  const patterns = [
    /<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image["'][^>]*>/i,
    /<meta[^>]+(?:property|name)=["']og:image:url["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+(?:property|name)=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']twitter:image["'][^>]*>/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["'][^>]*>/i,
    /<img[^>]+class=["'][^"']*(cover|poster|thumb|summary|series)[^"']*["'][^>]+src=["']([^"']+)["'][^>]*>/i,
    /<img[^>]+src=["']([^"']+)["'][^>]+class=["'][^"']*(cover|poster|thumb|summary|series)[^"']*["'][^>]*>/i,
    /<img[^>]+class=["'][^"']*(cover|poster|thumb|summary|series)[^"']*["'][^>]+(?:data-src|data-original|data-lazy-src)=["']([^"']+)["'][^>]*>/i,
    /<img[^>]+(?:data-src|data-original|data-lazy-src)=["']([^"']+)["'][^>]+class=["'][^"']*(cover|poster|thumb|summary|series)[^"']*["'][^>]*>/i,
    /seriesCoverUrlFromAstro":"([^"\\]+)"/i,
    /seriesCoverUrlFromAstro\\":\\"([^"\\]+)\\"/i,
    /"series_cover_url":"([^"\\]+)"/i,
    /series_cover_url\\":\\"([^"\\]+)\\"/i,
    /"cover_url":"([^"\\]+)"/i,
    /cover_url\\":\\"([^"\\]+)\\"/i,
    /"image"\s*:\s*"([^"]+)"/i,
    /image\\":\\"([^"\\]+)\\"/i,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (!match) {
      continue
    }

    const rawCover = match[2] || match[1]
    if (!rawCover) {
      continue
    }

    const resolvedCover = resolveCoverUrl(rawCover, seriesUrl)
    if (!resolvedCover) {
      continue
    }

    if (isUsableCoverUrl(resolvedCover, seriesUrl)) {
      return resolvedCover
    }
  }

  return null
}

function sanitizeTitleCandidate(raw: string): string | null {
  const title = raw
    .replace(/\s*[-|:]\s*(chapter|chap|ch)\.?\s*\d+(?:[._-]\d+)?\b.*$/i, "")
    .replace(/^(chapter|chap|ch)\.?\s*\d+(?:[._-]\d+)?\s*[-|:]\s*/i, "")
    .replace(/\s*[-|:]\s*(read|online|for free).*$/i, "")
    .replace(/^read\s+/i, "")
    .trim()

  if (!title || title.length < 2 || GENERIC_TITLE_REGEX.test(title)) {
    return null
  }

  return title
}

function extractTitleFromHtml(html: string): string | null {
  const patterns = [
    /seriesNameFromAstro":"([^"\\]+)"/i,
    /seriesNameFromAstro\\":\\"([^"\\]+)\\"/i,
    /"series_name":"([^"\\]+)"/i,
    /series_name\\":\\"([^"\\]+)\\"/i,
    /<meta[^>]+(?:property|name)=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:title["'][^>]*>/i,
    /<title>([^<]+)<\/title>/i,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    const candidate = match?.[1]?.trim()
    if (!candidate) {
      continue
    }

    const cleaned = candidate
      .replace(/\s*[-|:]\s*(rapid|asura\s*scans|manganato|mangakakalot|fenrir\s*realm|helioscans|novel\s*bin)\s*$/i, "")
      .replace(/\s*[-|:]\s*[a-z0-9-]+\.(com|net|org|gg|io)\s*$/i, "")
      .trim()

    const sanitized = sanitizeTitleCandidate(cleaned)
    if (sanitized) {
      return sanitized
    }
  }

  return null
}

function isWeakTitle(title: string): boolean {
  const normalized = title.trim()
  if (!normalized || normalized.length < 3) {
    return true
  }

  if (GENERIC_TITLE_REGEX.test(normalized)) {
    return true
  }

  return false
}

if (chrome.runtime?.onInstalled?.addListener) {
  chrome.runtime.onInstalled.addListener(() => {
    void ensureMangaCdnRefererRules()
  })
}

if (chrome.runtime?.onStartup?.addListener) {
  chrome.runtime.onStartup.addListener(() => {
    void ensureMangaCdnRefererRules()
  })
}

void ensureMangaCdnRefererRules()

chrome.runtime.onMessage.addListener((message) => {
  console.log("Message received:", message)

  if (message.type === "TRACK_PROGRESS") {
    handleTrack(message.payload)
  }
})

async function handleTrack(payload: TrackerPayload) {
  const shouldRefineTitle = isWeakTitle(payload.title)
  const shouldFetchCover =
    Boolean(payload.seriesUrl) &&
    (!payload.coverUrl || !isUsableCoverUrl(payload.coverUrl, payload.seriesUrl!))
  const shouldFetchMetadata = Boolean(payload.seriesUrl) && (shouldFetchCover || shouldRefineTitle)

  // Try series-page fetch when cover/title looks weak.
  if (shouldFetchMetadata && payload.seriesUrl) {
    try {
      console.log("Fetching missing cover from:", payload.seriesUrl)
      const response = await fetch(payload.seriesUrl)
      const html = await response.text()

      if (shouldFetchCover) {
        const foundCover = extractCoverFromHtml(html, payload.seriesUrl)
        if (foundCover) {
          console.log("Background fetch success:", foundCover)
          payload.coverUrl = foundCover
        }
      }

      if (shouldRefineTitle) {
        const foundTitle = extractTitleFromHtml(html)
        if (foundTitle) {
          payload.title = foundTitle
        }
      }
    } catch (err) {
      console.error("Background fetch failed:", err)
    }
  }

  const entries = await loadEntries()
  const updated = upsertEntry(entries, payload, payload.siteId)
  await saveEntries(updated)
}
