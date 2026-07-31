import { adapters } from "./registry"
import { ProgressSnapshot } from "./models"

export function routePage(url: string, doc: Document = document): ProgressSnapshot | null {
    let parsed: URL
    try {
        parsed = new URL(url)
    } catch {
        return null
    }
    for (const adapter of adapters) {
        if (adapter.matchesChapter(parsed)) {
        return adapter.extractProgress(doc, parsed)
        }
    }
    return null
}
