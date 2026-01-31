import { TrackerPayload } from "./models"

export interface TrackProgressMessage {
    type: "TRACK_PROGRESS"
    payload: TrackerPayload
}

export type ExtensionMessage =
    |TrackProgressMessage
