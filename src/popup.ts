import { listLibraryEntries } from "./core/libraryDb"
import type { LibraryEntry } from "./core/models"

type MediaFilter = "manga" | "novel"

const LOCAL_COVER_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='45' height='65' viewBox='0 0 45 65'%3E%3Crect width='45' height='65' fill='%23161616'/%3E%3Crect x='1' y='1' width='43' height='63' fill='none' stroke='%23364663'/%3E%3Ctext x='22.5' y='35' fill='%2397abcf' font-size='7' text-anchor='middle' font-family='Segoe UI,sans-serif'%3ENo Cover%3C/text%3E%3C/svg%3E"

let activeMediaFilter: MediaFilter = "manga"
let cachedEntries: LibraryEntry[] = []

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character,
  )
}

function isMediaFilter(value: string): value is MediaFilter {
  return value === "manga" || value === "novel"
}

function cover(entry: LibraryEntry): string {
  return entry.series.coverUrl || entry.preferredSource.coverUrl || LOCAL_COVER_FALLBACK
}

function syncMediaToggleState(): void {
  const pill = document.querySelector<HTMLElement>(".media-toggle-pill")
  const buttons = document.querySelectorAll<HTMLButtonElement>(".media-toggle-btn[data-media]")

  buttons.forEach((button) => {
    const isActive = button.dataset.media === activeMediaFilter
    button.classList.toggle("active", isActive)
    button.setAttribute("aria-selected", String(isActive))
  })

  pill?.setAttribute("data-active", activeMediaFilter)
}

function renderUnreadCount(): void {
  const unread = cachedEntries
    .filter((entry) => entry.series.mediaType === activeMediaFilter)
    .reduce((sum, entry) => sum + entry.unreadCount, 0)

  const unreadElement = document.getElementById("unreadCount")
  if (!unreadElement) return
  unreadElement.textContent = unread ? `${unread} unread` : "Up to date"
}

function render(): void {
  const list = document.getElementById("list")
  if (!list) return

  const entries = cachedEntries.filter((entry) => entry.series.mediaType === activeMediaFilter)

  renderUnreadCount()

  if (!entries.length) {
    list.innerHTML =
      '<p class="empty">No tracked series yet. Enable tracking in Settings, then read a supported chapter.</p>'
    return
  }

  const grouped = entries.reduce<Record<string, LibraryEntry[]>>((groups, entry) => {
    const siteKey = entry.preferredSource.sourceId
    ;(groups[siteKey] ||= []).push(entry)
    return groups
  }, {})

  const sortedSiteNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b))

  list.innerHTML = sortedSiteNames
    .map((siteKey) => {
      const siteEntries = grouped[siteKey]
      return `
        <section class="site-section">
          <div class="site-banner">
            <div class="site-logo">
              <div class="site-logo-fallback">${escapeHtml(siteKey.slice(0, 2).toUpperCase())}</div>
            </div>
            <div class="site-banner-copy">
              <span class="site-banner-name">${escapeHtml(siteKey)}</span>
              <span class="site-banner-count">${siteEntries.length} item${siteEntries.length === 1 ? "" : "s"}</span>
            </div>
          </div>

          <div class="site-items">
            ${siteEntries
              .map(
                (entry) => `
                  <article class="entry entry-${escapeHtml(entry.series.mediaType)}">
                    <div class="cover-wrapper">
                      <img class="cover-img" src="${escapeHtml(cover(entry))}" alt="" />
                    </div>

                    <div class="info">
                      <div class="title" data-open="${escapeHtml(entry.preferredSource.lastReadUrl)}">
                        ${escapeHtml(entry.series.title)}
                      </div>

                      <div class="meta">
                        <span class="badge">${escapeHtml(entry.series.mediaType)}</span>
                        <span>Ch. ${escapeHtml(String(entry.series.progress))}</span>
                        ${entry.unreadCount ? `<span>${entry.unreadCount} new</span>` : "<span>Up to date</span>"}
                        <span class="linked-tag">${escapeHtml(entry.preferredSource.sourceId)}</span>
                      </div>
                    </div>

                    <div class="actions">
                      <button data-resume="${escapeHtml(entry.preferredSource.lastReadUrl)}">Resume</button>
                    </div>
                  </article>
                `,
              )
              .join("")}
          </div>
        </section>
      `
    })
    .join("")

  list.querySelectorAll<HTMLButtonElement>("[data-resume]").forEach((button) => {
    button.addEventListener("click", () => chrome.tabs.create({ url: button.dataset.resume! }))
  })

  list.querySelectorAll<HTMLElement>("[data-open]").forEach((title) => {
    title.addEventListener("click", () => chrome.tabs.create({ url: title.dataset.open! }))
  })

  list.querySelectorAll<HTMLImageElement>(".cover-img").forEach((img) => {
    img.addEventListener("error", () => {
      img.src = LOCAL_COVER_FALLBACK
    })
  })
}

async function refresh(): Promise<void> {
  cachedEntries = await listLibraryEntries()
  render()
}

function setupMediaToggle(): void {
  const mediaToggle = document.getElementById("mediaToggle")
  if (!mediaToggle) return

  mediaToggle.querySelectorAll<HTMLButtonElement>(".media-toggle-btn[data-media]").forEach((button) => {
    button.addEventListener("click", () => {
      const media = button.dataset.media
      if (!media || !isMediaFilter(media) || media === activeMediaFilter) return
      activeMediaFilter = media
      syncMediaToggleState()
      render()
    })
  })

  syncMediaToggleState()
}

document.getElementById("refresh")?.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "REFRESH_LIBRARY" }, () => void refresh())
})

document.getElementById("dashboard")?.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" })
})

document.getElementById("settings")?.addEventListener("click", () => {
  chrome.runtime.openOptionsPage()
})

document
  .getElementById("refresh")
  ?.addEventListener("click", () =>
    chrome.runtime.sendMessage(
      { type: "REFRESH_LIBRARY" },
      () => void refresh(),
    ),
  )

document
  .getElementById("dashboard")
  ?.addEventListener("click", () =>
    chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" }),
  )

document
  .getElementById("settings")
  ?.addEventListener("click", () =>
    chrome.runtime.openOptionsPage(),
  )

setupMediaToggle()
void refresh()