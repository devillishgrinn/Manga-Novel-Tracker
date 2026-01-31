import { adapters } from "./registry"
import { TrackerPayload } from "./models"

export function routePage(url: string): TrackerPayload | null {
    for (const adapter of adapters) {
        if (adapter.match(url)) {
        return adapter.extract()
        }
    }
    return null
}
