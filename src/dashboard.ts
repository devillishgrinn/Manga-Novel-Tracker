import {
  deleteLibrarySeries,
  exportLibraryBackup,
  importLibraryBackup,
  linkSourceSeries,
  listLibraryEntries,
  setLibraryProgress,
  setPreferredSource,
  unlinkSourceSeries,
} from "./core/libraryDb"
import { LibraryEntry } from "./core/models"

let cachedEntries: LibraryEntry[] = []

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character)
}

function cover(entry: LibraryEntry): string {
  return entry.series.coverUrl || entry.preferredSource.coverUrl || "assets/icon.svg"
}

function filteredEntries(): LibraryEntry[] {
  const search = (document.getElementById("search") as HTMLInputElement).value.trim().toLowerCase()
  const media = (document.getElementById("media") as HTMLSelectElement).value
  return cachedEntries.filter((entry) =>
    (media === "all" || entry.series.mediaType === media) && (!search || entry.series.title.toLowerCase().includes(search)),
  )
}

async function render(): Promise<void> {
  cachedEntries = await listLibraryEntries()
  const list = document.getElementById("list") as HTMLElement
  const entries = filteredEntries()
  if (!entries.length) {
    list.innerHTML = '<p class="empty">Your library is empty, or no entries match this filter.</p>'
    return
  }
  list.innerHTML = entries.map((entry) => `
    <article class="card" data-series-id="${entry.series.id}">
      <img class="cover" src="${escapeHtml(cover(entry))}" alt="" />
      <div>
        <h2 class="title">${escapeHtml(entry.series.title)}</h2>
        <p class="meta">${entry.series.mediaType} · Progress <input class="progress" type="number" min="1" step="0.1" value="${entry.series.progress}" aria-label="Progress for ${escapeHtml(entry.series.title)}" /></p>
        <p class="meta">${entry.unreadCount ? `${entry.unreadCount} unread` : "Up to date"} · ${entry.sources.length} source${entry.sources.length === 1 ? "" : "s"}</p>
        <p class="meta">Preferred: <select class="preferred">${entry.sources.map((source) => `<option value="${escapeHtml(source.id)}"${source.id === entry.series.preferredSourceSeriesId ? " selected" : ""}>${escapeHtml(source.sourceId)}</option>`).join("")}</select></p>
      </div>
      <div class="card-actions"><button class="resume">Resume</button><button class="link">Link source</button>${entry.sources.length > 1 ? '<button class="unlink">Unlink preferred</button>' : ""}<button class="delete">Delete</button></div>
    </article>`).join("")
  list.querySelectorAll<HTMLElement>(".card").forEach(bindCard)
}

function entryForCard(card: HTMLElement): LibraryEntry | undefined {
  return cachedEntries.find((entry) => entry.series.id === card.dataset.seriesId)
}

function bindCard(card: HTMLElement): void {
  const entry = entryForCard(card)
  if (!entry) return
  card.querySelector<HTMLImageElement>(".cover")?.addEventListener("error", (event) => { (event.currentTarget as HTMLImageElement).src = "assets/icon.svg" })
  card.querySelector<HTMLButtonElement>(".resume")?.addEventListener("click", () => chrome.tabs.create({ url: entry.preferredSource.lastReadUrl }))
  card.querySelector<HTMLInputElement>(".progress")?.addEventListener("change", async (event) => {
    const value = Number((event.currentTarget as HTMLInputElement).value)
    await setLibraryProgress(entry.series.id, value)
    await render()
  })
  card.querySelector<HTMLSelectElement>(".preferred")?.addEventListener("change", async (event) => {
    await setPreferredSource(entry.series.id, (event.currentTarget as HTMLSelectElement).value)
    await render()
  })
  card.querySelector<HTMLButtonElement>(".delete")?.addEventListener("click", async () => {
    if (!confirm(`Delete ${entry.series.title} and its source records?`)) return
    await deleteLibrarySeries(entry.series.id)
    await render()
  })
  card.querySelector<HTMLButtonElement>(".unlink")?.addEventListener("click", async () => {
    await unlinkSourceSeries(entry.series.id, entry.series.preferredSource.id)
    await render()
  })
  card.querySelector<HTMLButtonElement>(".link")?.addEventListener("click", () => openLinkDialog(entry))
}

function openLinkDialog(target: LibraryEntry): void {
  const dialog = document.getElementById("linkDialog") as HTMLDialogElement
  const select = document.getElementById("sourceChoice") as HTMLSelectElement
  const candidates = cachedEntries
    .filter((entry) => entry.series.id !== target.series.id && entry.series.mediaType === target.series.mediaType)
    .flatMap((entry) => entry.sources.map((source) => ({ entry, source })))
  if (!candidates.length) {
    alert("No compatible unlinked source is available.")
    return
  }
  select.innerHTML = candidates.map(({ entry, source }) => `<option value="${escapeHtml(source.id)}">${escapeHtml(entry.series.title)} — ${escapeHtml(source.sourceId)}</option>`).join("")
  ;(document.getElementById("linkCopy") as HTMLElement).textContent = `This moves the chosen source into “${target.series.title}”. Progress is preserved using the higher value.`
  const confirmButton = document.getElementById("confirmLink") as HTMLButtonElement
  confirmButton.onclick = async (event) => {
    event.preventDefault()
    await linkSourceSeries(target.series.id, select.value)
    dialog.close()
    await render()
  }
  dialog.showModal()
}

document.getElementById("search")?.addEventListener("input", () => void render())
document.getElementById("media")?.addEventListener("change", () => void render())
document.getElementById("refresh")?.addEventListener("click", () => chrome.runtime.sendMessage({ type: "REFRESH_LIBRARY" }, () => void render()))
document.getElementById("export")?.addEventListener("click", async () => {
  const blob = new Blob([await exportLibraryBackup()], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `manga-novel-tracker-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
})
document.getElementById("import")?.addEventListener("click", () => (document.getElementById("backup") as HTMLInputElement).click())
document.getElementById("backup")?.addEventListener("change", async (event) => {
  const file = (event.currentTarget as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const result = await importLibraryBackup(await file.text())
    alert(`Imported ${result.imported} source record(s); skipped ${result.skipped} existing source record(s).`)
    await render()
  } catch (error) {
    alert(error instanceof Error ? error.message : "Import failed")
  }
})
void render()
