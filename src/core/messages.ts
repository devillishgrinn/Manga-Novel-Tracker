import { ProgressSnapshot } from "./models"

export interface TrackProgressMessage {
  type: "TRACK_PROGRESS"
  payload: ProgressSnapshot
}

export interface RefreshLibraryMessage {
  type: "REFRESH_LIBRARY"
}

export interface OpenDashboardMessage {
  type: "OPEN_DASHBOARD"
}

export type ExtensionMessage = TrackProgressMessage | RefreshLibraryMessage | OpenDashboardMessage
