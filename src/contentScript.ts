function extractFenrirealmPayload() {
  const match = location.pathname.match(
    /\/series\/([^/]+)\/(\d+)/
  )

  if (!match) return null

  const slug = match[1]
  const chapter = Number(match[2])

  if (Number.isNaN(chapter)) return null

  const title = slug
    .split("-")
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(" ")

  return {
    siteId: "fenrirealm",
    title,
    mediaType: "novel",
    progress: chapter,
    unit: "chapter",
    sourceUrl: location.href
  }
}

const payload = extractFenrirealmPayload()

console.log("📦 Extracted payload:", payload)

if (payload) {
  chrome.runtime.sendMessage({
    type: "TRACK_PROGRESS",
    payload
  })
}


/*
import { routePage } from "./core/router"

console.log("📄 Content script running on:", location.href)

const payload = routePage(window.location.href)

console.log("📦 Extracted payload:", payload)

if (payload) {
    chrome.runtime.sendMessage({
    type: "TRACK_PROGRESS",
    payload
    })
}
    */
