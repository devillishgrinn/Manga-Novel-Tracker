
import { loadEntries, saveEntries, upsertEntry } from "./core/storage.js"
import { TrackerPayload } from "./core/models"

console.log("🔥 Fenrir background service worker started")

chrome.runtime.onMessage.addListener((message) => {
  console.log("📨 Message received:", message)

  if (message.type === "TRACK_PROGRESS") {
    handleTrack(message.payload)
  }
})

async function handleTrack(payload: TrackerPayload) {
  const entries = await loadEntries()
  const updated = upsertEntry(entries, payload, payload.siteId)
  await saveEntries(updated)
}
