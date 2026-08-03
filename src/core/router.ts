import { adapters } from "./registry"
import { ProgressSnapshot } from "./models"

export function routePage(url: string, doc?: Document): ProgressSnapshot | null {
  const pageDocument = doc || (typeof document !== "undefined" ? document : undefined)
  if (!pageDocument) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  for (const adapter of adapters) {
    if (adapter.matchesChapter(parsed)) {
      return adapter.extractProgress(pageDocument, parsed)
    }
  }
  return null
}
