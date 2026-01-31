//Fenrir Realm site:

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

//HelioScans Site: 

function handleHelioScans() {
  if (!location.hostname.includes("helioscans.com")) return
  if (!location.pathname.startsWith("/chapter/")) return

  console.log("🌀 Helios detected, waiting for title...")

  setTimeout(() => {
    const titleText = document.title
    console.log("📝 Helios title:", titleText)

    const match = titleText.match(/^(.*?)\s+-?\s*Chapter\s+(\d+)/i)
    if (!match) {
      console.warn("❌ Helios title not ready yet")
      return
    }

    const title = match[1].trim()
    const chapter = Number(match[2])

    const payload = {
      siteId: "helioscans",
      title,
      mediaType: "novel",
      progress: chapter,
      unit: "chapter",
      sourceMap: {
        helioscans: location.href
      }
    }

    console.log("🚀 Helios payload:", payload)

    chrome.runtime.sendMessage({
      type: "TRACK_PROGRESS",
      payload
    })
  }, 1200)
}

extractFenrirealmPayload()
handleHelioScans()

