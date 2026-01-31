export type MediaType = "manga" | "novel" | "anime"
export type ProgressUnit = "chapter" | "episode"

export interface TrackerPayload {
  title: string
  mediaType: MediaType
  progress: number
  unit: ProgressUnit
  sourceUrl: string
  siteId: string   
}

export interface TrackerEntry {
  id: string
  title: string
  mediaType: MediaType
  progress: number
  unit: ProgressUnit
  sourceMap: Record<string, string>
  lastUpdated: number
}
