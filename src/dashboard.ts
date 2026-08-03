import {
  deleteLibrarySeries,
  exportLibraryBackup,
  importLibraryBackup,
  linkSourceSeries,
  listLibraryEntries,
  listSourceHealth,
  setLibraryProgress,
  setPreferredSource,
  unlinkSourceSeries,
} from "./core/libraryDb"
import { LibraryEntry } from "./core/models"
import { adapters } from "./core/registry"
import { formatRelativeTime, mergeAdapterHealth } from "./core/sourceHealth"

let cachedEntries: LibraryEntry[] = []
type DashboardView = "series" | "health"
let activeView: DashboardView = "series"

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character,
  )
}

function cover(entry: LibraryEntry): string {
  return entry.series.coverUrl || entry.preferredSource.coverUrl || "assets/icon.svg"
}

function filteredEntries(): LibraryEntry[] {
  const search = (document.getElementById("search") as HTMLInputElement).value.trim().toLowerCase()
  const media = (document.getElementById("media") as HTMLSelectElement).value
  return cachedEntries.filter(
    (entry) =>
      (media === "all" || entry.series.mediaType === media) &&
      (!search || entry.series.title.toLowerCase().includes(search)),
  )
}

function setActiveView(view: DashboardView): void {
  activeView = view
  const libraryPanel = document.getElementById("libraryPanel") as HTMLElement
  const healthPanel = document.getElementById("healthPanel") as HTMLElement
  const tabSeries = document.getElementById("tabSeries") as HTMLButtonElement
  const tabHealth = document.getElementById("tabHealth") as HTMLButtonElement

  libraryPanel.hidden = view !== "series"
  healthPanel.hidden = view !== "health"
  tabSeries.setAttribute("aria-selected", String(view === "series"))
  tabHealth.setAttribute("aria-selected", String(view === "health"))

  if (view === "health") void renderHealth()
}

async function render(): Promise<void> {
  cachedEntries = await listLibraryEntries()
  const list = document.getElementById("list") as HTMLElement
  const entries = filteredEntries()
  if (!entries.length) {
    list.innerHTML = '<p class="empty">Your library is empty, or no entries match this filter.</p>'
    return
  }
  list.innerHTML = entries
    .map(
      (entry) => `
    <article class="card" data-series-id="${entry.series.id}">
      <img class="cover" src="${escapeHtml(cover(entry))}" alt="" />
      <div>
        <h2 class="title">${escapeHtml(entry.series.title)}</h2>
        <p class="meta">${entry.series.mediaType} · Progress <input class="progress" type="number" min="1" step="0.1" value="${entry.series.progress}" aria-label="Progress for ${escapeHtml(entry.series.title)}" /></p>
        <p class="meta">${entry.unreadCount ? `${entry.unreadCount} unread` : "Up to date"} · ${entry.sources.length} source${entry.sources.length === 1 ? "" : "s"}</p>
        <p class="meta">Preferred: <select class="preferred">${entry.sources.map((source) => `<option value="${escapeHtml(source.id)}"${source.id === entry.series.preferredSourceSeriesId ? " selected" : ""}>${escapeHtml(source.sourceId)}</option>`).join("")}</select></p>
      </div>
      <div class="card-actions"><button class="resume">Resume</button><button class="link">Link source</button>${entry.sources.length > 1 ? '<button class="unlink">Unlink preferred</button>' : ""}<button class="delete">Delete</button></div>
    </article>`,
    )
    .join("")
  list.querySelectorAll<HTMLElement>(".card").forEach(bindCard)
}

async function renderHealth(): Promise<void> {
  const healthList = document.getElementById("healthList") as HTMLElement
  const records = await listSourceHealth()
  const rows = mergeAdapterHealth(adapters, records)

  healthList.innerHTML = `
    <table class="health-table">
      <thead>
        <tr>
          <th scope="col">Source</th>
          <th scope="col">Status</th>
          <th scope="col">Response time</th>
          <th scope="col">Last checked</th>
          <th scope="col">Error</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((row) => {
            const status = row.health?.status ?? "unknown"
            const statusLabel = status === "unknown" ? "Not checked" : status
            const responseTime =
              row.health && row.health.responseTime > 0 ? `${Math.round(row.health.responseTime)} ms` : "—"
            const lastChecked = row.health
              ? formatRelativeTime(row.health.lastChecked)
              : "Never checked"
            const error = row.health?.lastError ?? ""
            return `
          <tr>
            <td>${escapeHtml(row.displayName)}</td>
            <td><span class="status-badge ${escapeHtml(status)}">${escapeHtml(statusLabel)}</span></td>
            <td>${escapeHtml(responseTime)}</td>
            <td>${escapeHtml(lastChecked)}</td>
            <td class="health-error"${error ? ` title="${escapeHtml(error)}"` : ""}>${escapeHtml(error || "—")}</td>
          </tr>`
          })
          .join("")}
      </tbody>
    </table>`
}

function entryForCard(card: HTMLElement): LibraryEntry | undefined {
  return cachedEntries.find((entry) => entry.series.id === card.dataset.seriesId)
}

function bindCard(card: HTMLElement): void {
  const entry = entryForCard(card)
  if (!entry) return
  card.querySelector<HTMLImageElement>(".cover")?.addEventListener("error", (event) => {
    ;(event.currentTarget as HTMLImageElement).src = "assets/icon.svg"
  })
  card
    .querySelector<HTMLButtonElement>(".resume")
    ?.addEventListener("click", () => chrome.tabs.create({ url: entry.preferredSource.lastReadUrl }))
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
    await unlinkSourceSeries(entry.series.id, entry.preferredSource.id)
    await render()
  })
  card.querySelector<HTMLButtonElement>(".link")?.addEventListener("click", () => openLinkDialog(entry))
}

function openLinkDialog(target: LibraryEntry): void {
  const dialog = document.getElementById("linkDialog") as HTMLDialogElement
  const select = document.getElementById("sourceChoice") as HTMLSelectElement
  const candidates = cachedEntries
    .filter(
      (entry) => entry.series.id !== target.series.id && entry.series.mediaType === target.series.mediaType,
    )
    .flatMap((entry) => entry.sources.map((source) => ({ entry, source })))
  if (!candidates.length) {
    alert("No compatible unlinked source is available.")
    return
  }
  select.innerHTML = candidates
    .map(
      ({ entry, source }) =>
        `<option value="${escapeHtml(source.id)}">${escapeHtml(entry.series.title)} — ${escapeHtml(source.sourceId)}</option>`,
    )
    .join("")
  ;(document.getElementById("linkCopy") as HTMLElement).textContent =
    `This moves the chosen source into “${target.series.title}”. Progress is preserved using the higher value.`
  const confirmButton = document.getElementById("confirmLink") as HTMLButtonElement
  confirmButton.onclick = async (event) => {
    event.preventDefault()
    await linkSourceSeries(target.series.id, select.value)
    dialog.close()
    await render()
  }
  dialog.showModal()
}

document.getElementById("tabSeries")?.addEventListener("click", () => setActiveView("series"))
document.getElementById("tabHealth")?.addEventListener("click", () => setActiveView("health"))
document.getElementById("search")?.addEventListener("input", () => void render())
document.getElementById("media")?.addEventListener("change", () => void render())
document
  .getElementById("refresh")
  ?.addEventListener("click", () =>
    chrome.runtime.sendMessage({ type: "REFRESH_LIBRARY" }, () => void render()),
  )
document.getElementById("checkHealth")?.addEventListener("click", () => {
  const button = document.getElementById("checkHealth") as HTMLButtonElement
  button.disabled = true
  chrome.runtime.sendMessage({ type: "CHECK_SOURCE_HEALTH" }, () => {
    button.disabled = false
    if (activeView === "health") void renderHealth()
  })
})
document.getElementById("export")?.addEventListener("click", async () => {
  const blob = new Blob([await exportLibraryBackup()], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `manga-novel-tracker-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
})
document
  .getElementById("import")
  ?.addEventListener("click", () => (document.getElementById("backup") as HTMLInputElement).click())
document.getElementById("backup")?.addEventListener("change", async (event) => {
  const file = (event.currentTarget as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const result = await importLibraryBackup(await file.text())
    alert(
      `Imported ${result.imported} source record(s); skipped ${result.skipped} existing source record(s).`,
    )
    await render()
  } catch (error) {
    alert(error instanceof Error ? error.message : "Import failed")
  }
})
void render()
