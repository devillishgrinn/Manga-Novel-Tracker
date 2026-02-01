
import { loadEntries, saveEntries, upsertEntry } from "./core/storage.js"
import { TrackerPayload } from "./core/models"

console.log("🔥 Manga/Novel Tracker background...")

chrome.runtime.onMessage.addListener((message) => {
  console.log("📨 Message received:", message)

  if (message.type === "TRACK_PROGRESS") {
    handleTrack(message.payload)
  }
})

async function handleTrack(payload: TrackerPayload) {
  
  // ✨ SMART FETCH: If we have a Series URL but NO cover (like on Fenrir), fetch it!
  if (!payload.coverUrl && payload.seriesUrl) {
    try {
      console.log("🔍 Fetching missing cover from:", payload.seriesUrl);
      const response = await fetch(payload.seriesUrl);
      const html = await response.text();

      // Find og:image in the fetched HTML
      const match = html.match(/meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i);
      
      if (match && match[1]) {
        let foundCover = match[1];
        // Ensure absolute URL
        if (!foundCover.startsWith('http')) {
            const origin = new URL(payload.seriesUrl).origin;
            foundCover = new URL(foundCover, origin).href;
        }
        console.log("📸 Background fetch success:", foundCover);
        payload.coverUrl = foundCover;
      }
    } catch (err) {
      console.error("❌ Background fetch failed:", err);
    }
  }
  const entries = await loadEntries()
  const updated = upsertEntry(entries, payload, payload.siteId)
  await saveEntries(updated)
}
