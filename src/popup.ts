console.log("🟢 Popup script loaded")

interface TrackerEntry {
  id: string
  title: string
  mediaType: string
  progress: number
  unit: string
  sourceMap: Record<string, string>
  lastUpdated: number
}

const list = document.getElementById("list")!

chrome.storage.local.get("trackerEntries", (result) => {
  const raw = result.trackerEntries

  const entries: TrackerEntry[] = Array.isArray(raw)
    ? raw
    : []

  if (entries.length === 0) {
    list.innerHTML = `<div class="empty">No tracked entries yet</div>`
    return
  }

  list.innerHTML = ""

  for (const entry of entries) {
    const div = document.createElement("div")
    div.className = "entry"

    div.innerHTML = `
      <div class="title">${entry.title}</div>
      <div class="progress">
        ${entry.progress} ${entry.unit}
      </div>
    `

    list.appendChild(div)
  }
})
