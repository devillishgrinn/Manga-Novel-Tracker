export type MediaType = "manga" | "novel"
export type ProgressUnit = "chapter"

/** A stable identity supplied by a source adapter. */
export interface SourceSeriesIdentity {
  /** `${sourceId}:${externalId}`. This is never derived from the display title. */
  id: string
  sourceId: string
  /** Native series id when available; otherwise the adapter's normalized URL path. */
  externalId: string
  seriesUrl: string
}

export interface ProgressSnapshot {
  identity: SourceSeriesIdentity
  title: string
  mediaType: MediaType
  progress: number
  unit: ProgressUnit
  chapterUrl: string
  coverUrl?: string
}

export interface SeriesSnapshot {
  identity: SourceSeriesIdentity
  title?: string
  coverUrl?: string
  latestChapter?: number
  latestChapterUrl?: string
}

export interface LibrarySeries {
  id: string
  title: string
  mediaType: MediaType
  progress: number
  unit: ProgressUnit
  preferredSourceSeriesId: string
  coverUrl?: string
  createdAt: number
  updatedAt: number
}

export interface SourceSeries {
  id: string
  sourceId: string
  externalId: string
  seriesUrl: string
  title: string
  mediaType: MediaType
  coverUrl?: string
  lastReadUrl: string
  latestChapter?: number
  latestChapterUrl?: string
  lastCheckedAt?: number
  lastNotifiedChapter?: number
  refreshError?: string
  updatedAt: number
}

export interface SeriesSourceLink {
  id: string
  librarySeriesId: string
  sourceSeriesId: string
  linkedAt: number
}

export interface ReleaseCheck {
  id: string
  sourceSeriesId: string
  checkedAt: number
  latestChapter?: number
  status: "baseline" | "unchanged" | "new-release" | "failed"
  message?: string
}

export interface LibraryEntry {
  series: LibrarySeries
  preferredSource: SourceSeries
  sources: SourceSeries[]
  unreadCount: number
}

/** Stored only in chrome.storage.local, not IndexedDB. */
export interface ExtensionSettings {
  onboardingComplete: boolean
  trackingEnabled: boolean
  notificationsEnabled: boolean
  refreshEnabled: boolean
  refreshHourLocal: number
}

/** Legacy payload retained only to migrate the previous local-storage schema. */
export interface LegacyTrackerEntry {
  id: string
  title: string
  mediaType: MediaType
  progress: number
  latestKnownChapter?: number
  lastCheckedAt?: number
  unit: ProgressUnit
  sourceMap: Record<string, string>
  lastUpdated: number
  coverUrl?: string
  seriesUrl?: string
}

/** @deprecated The pre-production storage record, retained only for migration/tests. */
export type TrackerEntry = LegacyTrackerEntry

/** Compatibility shape accepted from existing content scripts during migration. */
export interface TrackerPayload {
  title: string
  mediaType: MediaType
  progress: number
  unit: ProgressUnit
  sourceUrl: string
  siteId: string
  coverUrl?: string
  seriesUrl?: string
}
