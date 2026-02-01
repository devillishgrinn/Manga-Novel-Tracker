import { TrackerEntry, TrackerPayload } from "./models"

const STORAGE_KEY = "trackerEntries"

export async function loadEntries(): Promise<TrackerEntry[]> {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const entries = result[STORAGE_KEY]

    if (!Array.isArray(entries)) {
    return []
    }

    return entries as TrackerEntry[]
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
    const existing = entries.find(
        e => e.title === payload.title && e.mediaType === payload.mediaType
    )

    if (!existing) {
    return [
    ...entries,
        {
            id: crypto.randomUUID(),
            title: payload.title,
            mediaType: payload.mediaType,
            progress: payload.progress,
            unit: payload.unit,
            sourceMap: { [siteId]: payload.sourceUrl },
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

if (payload.coverUrl) existing.coverUrl = payload.coverUrl;
if (payload.seriesUrl) existing.seriesUrl = payload.seriesUrl;

existing.sourceMap[siteId] = payload.sourceUrl

return [...entries]
}
