import { TrackerEntry, TrackerPayload } from "./models"

const STORAGE_KEY = "trackerEntries"
const CHAPTER_TOKEN_REGEX = /\b(?:chapter|chap|ch)\b/i
const SITE_ID_ALIASES: Record<string, string> = {
    asuracomic: "asurascans",
    asurascans: "asurascans",
    mangakakalot: "manganato",
    manganato: "manganato",
    fenrirealm: "fenrirealm",
    helioscans: "helioscans",
    novelbin: "novelbin",
    rapid: "rapid",
    manhuaus: "manhuaus",
}

function normalizeSiteToken(value: string): string {
    return value
        .toLowerCase()
        .replace(/^https?:\/\//i, "")
        .replace(/^www\./i, "")
        .split(/[/?#]/)[0]
        .split(".")[0]
        .replace(/[^a-z0-9]+/g, "")
}

function normalizeSiteId(siteId: string, sourceUrl?: string): string {
    const normalizedFromSite = normalizeSiteToken(siteId)
    const aliasFromSite = SITE_ID_ALIASES[normalizedFromSite]
    if (aliasFromSite) {
        return aliasFromSite
    }

    if (sourceUrl) {
        try {
            const hostToken = normalizeSiteToken(new URL(sourceUrl).hostname)
            const aliasFromHost = SITE_ID_ALIASES[hostToken]
            if (aliasFromHost) {
                return aliasFromHost
            }
        } catch {
            // Ignore URL parse errors and fall back to provided siteId.
        }
    }

    const cleaned = siteId.replace(/^www\./i, "").toLowerCase()
    return cleaned || "unknown"
}

function normalizeTitleForMatch(title: string): string {
    return title
        .toLowerCase()
        .replace(/\s*[-|:]\s*(chapter|chap|ch)\.?\s*\d+(?:[._-]\d+)?\b.*$/i, "")
        .replace(/^(chapter|chap|ch)\.?\s*\d+(?:[._-]\d+)?\s*[-|:]\s*/i, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
}

function looksLikeHostname(value: string): boolean {
    return value.includes(".")
}

function normalizeSeriesKey(rawUrl: string | undefined): string | null {
    if (!rawUrl) {
        return null
    }

    try {
        const parsed = new URL(rawUrl)
        const host = parsed.hostname.replace(/^www\./i, "").toLowerCase()
        const parts = parsed.pathname.split("/").filter(Boolean)
        if (parts.length === 0) {
            return `${host}/`
        }

        if (parts.length >= 2 && /^(series|manga|novel|book|comic|b)$/i.test(parts[0])) {
            return `${host}/${parts[0].toLowerCase()}/${parts[1].toLowerCase()}`
        }

        const chapterIndex = parts.findIndex((segment, index) => {
            if (CHAPTER_TOKEN_REGEX.test(segment)) {
                return true
            }
            if (index > 0 && CHAPTER_TOKEN_REGEX.test(parts[index - 1]) && /\d/.test(segment)) {
                return true
            }
            return false
        })
        if (chapterIndex > 0) {
            return `${host}/${parts.slice(0, chapterIndex).join("/").toLowerCase()}`
        }

        if (parts.length > 1 && /\d/.test(parts[parts.length - 1])) {
            return `${host}/${parts.slice(0, -1).join("/").toLowerCase()}`
        }

        return `${host}/${parts.join("/").toLowerCase()}`
    } catch {
        return null
    }
}

function findExistingEntry(entries: TrackerEntry[], payload: TrackerPayload): TrackerEntry | undefined {
    const payloadSeriesKey = normalizeSeriesKey(payload.seriesUrl || payload.sourceUrl)
    const payloadTitleKey = normalizeTitleForMatch(payload.title)

    return entries.find((entry) => {
        if (entry.mediaType !== payload.mediaType) {
            return false
        }

        const entrySeriesKey = normalizeSeriesKey(
            entry.seriesUrl || Object.values(entry.sourceMap)[0]
        )
        if (payloadSeriesKey && entrySeriesKey && payloadSeriesKey === entrySeriesKey) {
            return true
        }

        return normalizeTitleForMatch(entry.title) === payloadTitleKey
    })
}

function findDuplicateEntry(entries: TrackerEntry[], candidate: TrackerEntry): TrackerEntry | undefined {
    const candidateSeriesKey = normalizeSeriesKey(
        candidate.seriesUrl || Object.values(candidate.sourceMap)[0]
    )
    const candidateTitleKey = normalizeTitleForMatch(candidate.title)

    return entries.find((entry) => {
        if (entry.mediaType !== candidate.mediaType) {
            return false
        }

        const entrySeriesKey = normalizeSeriesKey(
            entry.seriesUrl || Object.values(entry.sourceMap)[0]
        )
        if (candidateSeriesKey && entrySeriesKey && candidateSeriesKey === entrySeriesKey) {
            return true
        }

        return normalizeTitleForMatch(entry.title) === candidateTitleKey
    })
}

function mergeDuplicateEntries(entries: TrackerEntry[]): TrackerEntry[] {
    const merged: TrackerEntry[] = []

    entries.forEach((entry) => {
        const existing = findDuplicateEntry(merged, entry)
        if (!existing) {
            merged.push({
                ...entry,
                sourceMap: { ...entry.sourceMap },
            })
            return
        }

        existing.progress = Math.max(existing.progress, entry.progress)
        existing.latestKnownChapter = Math.max(
            existing.latestKnownChapter ?? 0,
            entry.latestKnownChapter ?? entry.progress
        )
        existing.lastUpdated = Math.max(existing.lastUpdated, entry.lastUpdated)
        existing.lastCheckedAt = Math.max(existing.lastCheckedAt ?? 0, entry.lastCheckedAt ?? 0) || undefined
        existing.coverUrl = existing.coverUrl || entry.coverUrl
        existing.seriesUrl = existing.seriesUrl || entry.seriesUrl

        Object.entries(entry.sourceMap).forEach(([rawSiteId, sourceUrl]) => {
            const normalizedSiteId = normalizeSiteId(rawSiteId, sourceUrl)
            existing.sourceMap[normalizedSiteId] = sourceUrl
        })
    })

    return merged
}

export async function loadEntries(): Promise<TrackerEntry[]> {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const entries = result[STORAGE_KEY]

    if (!Array.isArray(entries)) {
    return []
    }

    return mergeDuplicateEntries(entries as TrackerEntry[])
}

export async function saveEntries(entries: TrackerEntry[]): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: entries })
}

export function upsertEntry(
    entries: TrackerEntry[],
    payload: TrackerPayload,
    siteId: string
): TrackerEntry[] {
    const now = Date.now()
    const normalizedSiteId = normalizeSiteId(siteId, payload.sourceUrl)
    const existing = findExistingEntry(entries, payload)

    if (!existing) {
    return [
    ...entries,
        {
            id: crypto.randomUUID(),
            title: payload.title,
            mediaType: payload.mediaType,
            progress: payload.progress,
            latestKnownChapter: payload.progress,
            unit: payload.unit,
            sourceMap: { [normalizedSiteId]: payload.sourceUrl },
            lastUpdated: now,
            coverUrl: payload.coverUrl,
            seriesUrl: payload.seriesUrl
        }
    ]
}

if (payload.progress > existing.progress) {
    existing.progress = payload.progress
    existing.lastUpdated = now
}

existing.latestKnownChapter = Math.max(existing.latestKnownChapter ?? 0, payload.progress)

if (payload.coverUrl) existing.coverUrl = payload.coverUrl;
if (payload.seriesUrl) existing.seriesUrl = payload.seriesUrl;

let targetSiteId = normalizedSiteId
if (looksLikeHostname(normalizedSiteId)) {
    const canonicalExisting = Object.keys(existing.sourceMap).find((existingKey) => {
        const existingUrl = existing.sourceMap[existingKey]
        return !looksLikeHostname(normalizeSiteId(existingKey, existingUrl))
    })
    if (canonicalExisting) {
        targetSiteId = normalizeSiteId(canonicalExisting, existing.sourceMap[canonicalExisting])
    }
}

const existingSiteKey = Object.keys(existing.sourceMap).find((existingKey) => {
    const existingUrl = existing.sourceMap[existingKey]
    return normalizeSiteId(existingKey, existingUrl) === targetSiteId
})

if (existingSiteKey && existingSiteKey !== targetSiteId) {
    delete existing.sourceMap[existingSiteKey]
}

existing.sourceMap[targetSiteId] = payload.sourceUrl

return [...entries]
}
