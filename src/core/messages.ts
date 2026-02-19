import { TrackerPayload } from "./models"

export interface TrackProgressMessage {
    type: "TRACK_PROGRESS"
    payload: TrackerPayload
}

export interface AnalyzeCurrentPageMessage {
    type: "ANALYZE_CURRENT_PAGE"
}

export interface PageAnalysis {
    payload: TrackerPayload
    confidence: number
    reasons: string[]
    detectedBy: "adapter" | "fallback"
}

export interface AnalyzeCurrentPageResponse {
    detected: boolean
    analysis?: PageAnalysis
    hostname?: string
    siteKey?: string
}

export type ExtensionMessage =
    |TrackProgressMessage
    |AnalyzeCurrentPageMessage
