import {
  ExtensionSettings,
  LegacyTrackerEntry,
  LibraryEntry,
  LibrarySeries,
  ProgressSnapshot,
  ReleaseCheck,
  SeriesSnapshot,
  SeriesSourceLink,
  SourceSeries,
  SourceSeriesIdentity,
} from "./models"

const DB_NAME = "manga-novel-tracker"
const DB_VERSION = 1
const LEGACY_STORAGE_KEY = "trackerEntries"
const MIGRATION_KEY = "legacy-v1-to-indexeddb"

type StoreName = "librarySeries" | "sourceSeries" | "seriesSourceLinks" | "releaseChecks" | "migrationMetadata"

const memoryStores: Record<StoreName, Map<string, unknown>> = {
  librarySeries: new Map(),
  sourceSeries: new Map(),
  seriesSourceLinks: new Map(),
  releaseChecks: new Map(),
  migrationMetadata: new Map(),
}

function supportsIndexedDb(): boolean {
  return typeof indexedDB !== "undefined"
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"))
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"))
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"))
  })
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains("librarySeries")) db.createObjectStore("librarySeries", { keyPath: "id" })
      if (!db.objectStoreNames.contains("sourceSeries")) db.createObjectStore("sourceSeries", { keyPath: "id" })
      if (!db.objectStoreNames.contains("seriesSourceLinks")) {
        const store = db.createObjectStore("seriesSourceLinks", { keyPath: "id" })
        store.createIndex("byLibrary", "librarySeriesId", { unique: false })
        store.createIndex("bySource", "sourceSeriesId", { unique: true })
      }
      if (!db.objectStoreNames.contains("releaseChecks")) {
        const store = db.createObjectStore("releaseChecks", { keyPath: "id" })
        store.createIndex("bySource", "sourceSeriesId", { unique: false })
      }
      if (!db.objectStoreNames.contains("migrationMetadata")) db.createObjectStore("migrationMetadata", { keyPath: "id" })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error("Unable to open IndexedDB"))
  })
}

async function getRecord<T>(store: StoreName, id: string): Promise<T | undefined> {
  if (!supportsIndexedDb()) return memoryStores[store].get(id) as T | undefined
  const db = await openDatabase()
  try {
    const transaction = db.transaction(store, "readonly")
    const result = await requestValue(transaction.objectStore(store).get(id))
    await transactionComplete(transaction)
    return result as T | undefined
  } finally {
    db.close()
  }
}

async function getAllRecords<T>(store: StoreName): Promise<T[]> {
  if (!supportsIndexedDb()) return [...memoryStores[store].values()] as T[]
  const db = await openDatabase()
  try {
    const transaction = db.transaction(store, "readonly")
    const result = await requestValue(transaction.objectStore(store).getAll())
    await transactionComplete(transaction)
    return result as T[]
  } finally {
    db.close()
  }
}

async function putRecord<T extends { id: string }>(store: StoreName, value: T): Promise<void> {
  if (!supportsIndexedDb()) {
    memoryStores[store].set(value.id, value)
    return
  }
  const db = await openDatabase()
  try {
    const transaction = db.transaction(store, "readwrite")
    transaction.objectStore(store).put(value)
    await transactionComplete(transaction)
  } finally {
    db.close()
  }
}

async function deleteRecord(store: StoreName, id: string): Promise<void> {
  if (!supportsIndexedDb()) {
    memoryStores[store].delete(id)
    return
  }
  const db = await openDatabase()
  try {
    const transaction = db.transaction(store, "readwrite")
    transaction.objectStore(store).delete(id)
    await transactionComplete(transaction)
  } finally {
    db.close()
  }
}

function sourceLinkId(librarySeriesId: string, sourceSeriesId: string): string {
  return `${librarySeriesId}:${sourceSeriesId}`
}

function sourceFromSnapshot(snapshot: ProgressSnapshot, now: number): SourceSeries {
  return {
    id: snapshot.identity.id,
    sourceId: snapshot.identity.sourceId,
    externalId: snapshot.identity.externalId,
    seriesUrl: snapshot.identity.seriesUrl,
    title: snapshot.title,
    mediaType: snapshot.mediaType,
    coverUrl: snapshot.coverUrl,
    lastReadUrl: snapshot.chapterUrl,
    updatedAt: now,
  }
}

function libraryFromSnapshot(snapshot: ProgressSnapshot, now: number): LibrarySeries {
  return {
    id: newId(),
    title: snapshot.title,
    mediaType: snapshot.mediaType,
    progress: snapshot.progress,
    unit: snapshot.unit,
    preferredSourceSeriesId: snapshot.identity.id,
    coverUrl: snapshot.coverUrl,
    createdAt: now,
    updatedAt: now,
  }
}

function stripLegacyChapterUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    url.hash = ""
    url.search = ""
    url.pathname = url.pathname
      .replace(/\/(?:chapter[-_/]?\d+(?:[._-]\d+)?|\d+(?:\.\d+)?)\/?$/i, "")
      .replace(/\/+$/, "") || "/"
    return url.href
  } catch {
    return rawUrl
  }
}

function legacyToSnapshots(entry: LegacyTrackerEntry): ProgressSnapshot[] {
  const sourceEntries = Object.entries(entry.sourceMap || {})
  if (sourceEntries.length === 0) {
    sourceEntries.push(["unknown", entry.seriesUrl || "https://invalid.local/"])
  }
  return sourceEntries.map(([sourceId, chapterUrl]) => {
    const seriesUrl = stripLegacyChapterUrl(chapterUrl || entry.seriesUrl || "https://invalid.local/")
    const externalId = new URL(seriesUrl).hostname + new URL(seriesUrl).pathname
    const identity: SourceSeriesIdentity = {
      id: `${sourceId}:${encodeURIComponent(externalId.toLowerCase())}`,
      sourceId,
      externalId: externalId.toLowerCase(),
      seriesUrl,
    }
    return {
      identity,
      title: entry.title,
      mediaType: entry.mediaType,
      progress: entry.progress,
      unit: "chapter",
      chapterUrl: chapterUrl || seriesUrl,
      coverUrl: entry.coverUrl,
    }
  })
}

export async function saveProgress(snapshot: ProgressSnapshot): Promise<LibrarySeries> {
  const now = Date.now()
  let source = await getRecord<SourceSeries>("sourceSeries", snapshot.identity.id)
  const links = await getAllRecords<SeriesSourceLink>("seriesSourceLinks")
  const link = links.find((candidate) => candidate.sourceSeriesId === snapshot.identity.id)
  let series = link ? await getRecord<LibrarySeries>("librarySeries", link.librarySeriesId) : undefined

  if (!source) {
    source = sourceFromSnapshot(snapshot, now)
    await putRecord("sourceSeries", source)
  } else {
    source = {
      ...source,
      title: snapshot.title || source.title,
      mediaType: snapshot.mediaType,
      seriesUrl: snapshot.identity.seriesUrl,
      lastReadUrl: snapshot.chapterUrl,
      coverUrl: snapshot.coverUrl || source.coverUrl,
      updatedAt: now,
    }
    await putRecord("sourceSeries", source)
  }

  if (!series) {
    series = libraryFromSnapshot(snapshot, now)
    await putRecord("librarySeries", series)
    await putRecord("seriesSourceLinks", {
      id: sourceLinkId(series.id, source.id),
      librarySeriesId: series.id,
      sourceSeriesId: source.id,
      linkedAt: now,
    } satisfies SeriesSourceLink)
    return series
  }

  series = {
    ...series,
    progress: Math.max(series.progress, snapshot.progress),
    title: series.title || snapshot.title,
    coverUrl: series.coverUrl || snapshot.coverUrl,
    updatedAt: now,
  }
  await putRecord("librarySeries", series)
  return series
}

export async function listLibraryEntries(): Promise<LibraryEntry[]> {
  const [seriesRecords, sourceRecords, links] = await Promise.all([
    getAllRecords<LibrarySeries>("librarySeries"),
    getAllRecords<SourceSeries>("sourceSeries"),
    getAllRecords<SeriesSourceLink>("seriesSourceLinks"),
  ])
  const sourcesById = new Map(sourceRecords.map((source) => [source.id, source]))
  return seriesRecords
    .map((series) => {
      const sources = links
        .filter((link) => link.librarySeriesId === series.id)
        .map((link) => sourcesById.get(link.sourceSeriesId))
        .filter((source): source is SourceSeries => Boolean(source))
      const preferredSource = sources.find((source) => source.id === series.preferredSourceSeriesId) || sources[0]
      if (!preferredSource) return null
      return {
        series,
        preferredSource,
        sources,
        unreadCount: Math.max(0, ...(sources.map((source) => (source.latestChapter || 0) - series.progress))),
      }
    })
    .filter((entry): entry is LibraryEntry => Boolean(entry))
    .sort((a, b) => b.series.updatedAt - a.series.updatedAt)
}

export async function listSourceSeries(): Promise<SourceSeries[]> {
  return getAllRecords<SourceSeries>("sourceSeries")
}

export async function setLibraryProgress(librarySeriesId: string, progress: number): Promise<void> {
  const series = await getRecord<LibrarySeries>("librarySeries", librarySeriesId)
  if (!series || !Number.isFinite(progress) || progress < 1) return
  await putRecord("librarySeries", { ...series, progress, updatedAt: Date.now() })
}

export async function setPreferredSource(librarySeriesId: string, sourceSeriesId: string): Promise<void> {
  const [series, links] = await Promise.all([
    getRecord<LibrarySeries>("librarySeries", librarySeriesId),
    getAllRecords<SeriesSourceLink>("seriesSourceLinks"),
  ])
  if (!series || !links.some((link) => link.librarySeriesId === librarySeriesId && link.sourceSeriesId === sourceSeriesId)) return
  await putRecord("librarySeries", { ...series, preferredSourceSeriesId: sourceSeriesId, updatedAt: Date.now() })
}

export async function linkSourceSeries(targetLibrarySeriesId: string, sourceSeriesId: string): Promise<void> {
  const [target, source, links] = await Promise.all([
    getRecord<LibrarySeries>("librarySeries", targetLibrarySeriesId),
    getRecord<SourceSeries>("sourceSeries", sourceSeriesId),
    getAllRecords<SeriesSourceLink>("seriesSourceLinks"),
  ])
  if (!target || !source || target.mediaType !== source.mediaType) return
  const existing = links.find((link) => link.sourceSeriesId === sourceSeriesId)
  if (existing?.librarySeriesId === targetLibrarySeriesId) return
  const previous = existing ? await getRecord<LibrarySeries>("librarySeries", existing.librarySeriesId) : undefined
  if (existing) await deleteRecord("seriesSourceLinks", existing.id)
  await putRecord("seriesSourceLinks", {
    id: sourceLinkId(targetLibrarySeriesId, sourceSeriesId),
    librarySeriesId: targetLibrarySeriesId,
    sourceSeriesId,
    linkedAt: Date.now(),
  } satisfies SeriesSourceLink)
  await putRecord("librarySeries", {
    ...target,
    progress: Math.max(target.progress, previous?.progress || 0),
    updatedAt: Date.now(),
  })
  if (previous) {
    const remaining = (await getAllRecords<SeriesSourceLink>("seriesSourceLinks")).filter(
      (link) => link.librarySeriesId === previous.id,
    )
    if (remaining.length === 0) await deleteRecord("librarySeries", previous.id)
  }
}

export async function unlinkSourceSeries(librarySeriesId: string, sourceSeriesId: string): Promise<void> {
  const link = await getRecord<SeriesSourceLink>("seriesSourceLinks", sourceLinkId(librarySeriesId, sourceSeriesId))
  if (!link) return
  const [series, source] = await Promise.all([
    getRecord<LibrarySeries>("librarySeries", librarySeriesId),
    getRecord<SourceSeries>("sourceSeries", sourceSeriesId),
  ])
  if (!series || !source) return
  const links = await getAllRecords<SeriesSourceLink>("seriesSourceLinks")
  if (links.filter((candidate) => candidate.librarySeriesId === librarySeriesId).length <= 1) return
  await deleteRecord("seriesSourceLinks", link.id)
  const separate = {
    id: newId(),
    title: source.title,
    mediaType: source.mediaType,
    progress: series.progress,
    unit: "chapter" as const,
    preferredSourceSeriesId: source.id,
    coverUrl: source.coverUrl,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await putRecord("librarySeries", separate)
  await putRecord("seriesSourceLinks", {
    id: sourceLinkId(separate.id, source.id),
    librarySeriesId: separate.id,
    sourceSeriesId: source.id,
    linkedAt: Date.now(),
  } satisfies SeriesSourceLink)
  if (series.preferredSourceSeriesId === sourceSeriesId) {
    const replacement = links.find((candidate) => candidate.librarySeriesId === librarySeriesId && candidate.sourceSeriesId !== sourceSeriesId)
    if (replacement) await setPreferredSource(librarySeriesId, replacement.sourceSeriesId)
  }
}

export async function deleteLibrarySeries(librarySeriesId: string): Promise<void> {
  const links = (await getAllRecords<SeriesSourceLink>("seriesSourceLinks")).filter(
    (link) => link.librarySeriesId === librarySeriesId,
  )
  await Promise.all(links.map((link) => deleteRecord("seriesSourceLinks", link.id)))
  await Promise.all(links.map((link) => deleteRecord("sourceSeries", link.sourceSeriesId)))
  await deleteRecord("librarySeries", librarySeriesId)
}

export interface RefreshResult {
  source: SourceSeries
  status: ReleaseCheck["status"]
  hasNewRelease: boolean
}

export async function recordSeriesRefresh(snapshot: SeriesSnapshot | null, sourceSeriesId: string, error?: string): Promise<RefreshResult | null> {
  const source = await getRecord<SourceSeries>("sourceSeries", sourceSeriesId)
  if (!source) return null
  const now = Date.now()
  const previousLatest = source.latestChapter
  const nextLatest = snapshot?.latestChapter
  const failed = Boolean(error || !snapshot)
  const hasNewRelease = !failed && previousLatest !== undefined && nextLatest !== undefined && nextLatest > previousLatest
  const status: ReleaseCheck["status"] = failed
    ? "failed"
    : previousLatest === undefined
      ? "baseline"
      : hasNewRelease
        ? "new-release"
        : "unchanged"
  const updated: SourceSeries = {
    ...source,
    title: snapshot?.title || source.title,
    coverUrl: snapshot?.coverUrl || source.coverUrl,
    latestChapter: nextLatest ?? previousLatest,
    latestChapterUrl: snapshot?.latestChapterUrl || source.latestChapterUrl,
    lastCheckedAt: now,
    lastNotifiedChapter: hasNewRelease ? nextLatest : source.lastNotifiedChapter,
    refreshError: error,
    updatedAt: now,
  }
  await putRecord("sourceSeries", updated)
  await putRecord("releaseChecks", {
    id: newId(),
    sourceSeriesId,
    checkedAt: now,
    latestChapter: updated.latestChapter,
    status,
    message: error,
  } satisfies ReleaseCheck)
  return { source: updated, status, hasNewRelease }
}

export async function exportLibraryBackup(): Promise<string> {
  const [librarySeries, sourceSeries, seriesSourceLinks, releaseChecks] = await Promise.all([
    getAllRecords<LibrarySeries>("librarySeries"),
    getAllRecords<SourceSeries>("sourceSeries"),
    getAllRecords<SeriesSourceLink>("seriesSourceLinks"),
    getAllRecords<ReleaseCheck>("releaseChecks"),
  ])
  return JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), librarySeries, sourceSeries, seriesSourceLinks, releaseChecks }, null, 2)
}

export async function importLibraryBackup(raw: string): Promise<{ imported: number; skipped: number }> {
  const parsed = JSON.parse(raw) as { schemaVersion?: number; librarySeries?: LibrarySeries[]; sourceSeries?: SourceSeries[]; seriesSourceLinks?: SeriesSourceLink[]; releaseChecks?: ReleaseCheck[] }
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.librarySeries) || !Array.isArray(parsed.sourceSeries) || !Array.isArray(parsed.seriesSourceLinks)) {
    throw new Error("Unsupported backup format")
  }
  let imported = 0
  let skipped = 0
  for (const source of parsed.sourceSeries) {
    if (await getRecord<SourceSeries>("sourceSeries", source.id)) skipped += 1
    else {
      await putRecord("sourceSeries", source)
      imported += 1
    }
  }
  for (const series of parsed.librarySeries) {
    if (!(await getRecord<LibrarySeries>("librarySeries", series.id))) await putRecord("librarySeries", series)
  }
  for (const link of parsed.seriesSourceLinks) {
    if (!(await getRecord<SeriesSourceLink>("seriesSourceLinks", link.id))) await putRecord("seriesSourceLinks", link)
  }
  for (const check of parsed.releaseChecks || []) {
    if (!(await getRecord<ReleaseCheck>("releaseChecks", check.id))) await putRecord("releaseChecks", check)
  }
  return { imported, skipped }
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  onboardingComplete: false,
  trackingEnabled: false,
  notificationsEnabled: false,
  refreshEnabled: true,
  refreshHourLocal: 9,
}

async function legacyEntries(): Promise<LegacyTrackerEntry[]> {
  if (typeof chrome === "undefined" || !chrome.storage?.local?.get) return []
  const value = await chrome.storage.local.get(LEGACY_STORAGE_KEY)
  return Array.isArray(value[LEGACY_STORAGE_KEY]) ? value[LEGACY_STORAGE_KEY] as LegacyTrackerEntry[] : []
}

/** Runs once and never uses titles to combine legacy records. */
export async function initializeLibrary(): Promise<void> {
  if (await getRecord<{ id: string }>("migrationMetadata", MIGRATION_KEY)) return
  const entries = await legacyEntries()
  let migrated = 0
  for (const entry of entries) {
    for (const snapshot of legacyToSnapshots(entry)) {
      await saveProgress(snapshot)
      migrated += 1
    }
  }
  const actual = (await listSourceSeries()).length
  if (actual < migrated) throw new Error("Legacy migration verification failed")
  await putRecord("migrationMetadata", { id: MIGRATION_KEY, migratedAt: Date.now(), migrated })
  if (typeof chrome !== "undefined" && chrome.storage?.local?.remove) {
    await chrome.storage.local.remove(LEGACY_STORAGE_KEY)
  }
}

/** Test helper; production never calls this. */
export function resetMemoryDatabaseForTests(): void {
  for (const store of Object.values(memoryStores)) store.clear()
}
