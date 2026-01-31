import { TrackerPayload } from "./models"

export interface SiteAdapter {
    siteId: string
    match(url: string): boolean
    extract(): TrackerPayload | null
}
