import { listLibraryEntries } from "./core/libraryDb"

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character,
  )
}

async function render(): Promise<void> {
  const entries = await listLibraryEntries()
  const list = document.getElementById("list") as HTMLElement | null
  if (!list) return
  const unread = entries.reduce((sum, entry) => sum + entry.unreadCount, 0)
  const unreadElement = document.getElementById("unread") as HTMLElement | null
  if (unreadElement) unreadElement.textContent = unread ? `${unread} unread` : "Up to date"
  if (entries.length === 0) {
    list.innerHTML =
      '<p class="empty">No tracked series yet. Enable tracking in Settings, then read a supported chapter.</p>'
    return
  }
  list.innerHTML = entries
    .slice(0, 6)
    .map(
      (entry) => `
    <article class="entry">
      <div><div class="title">${escapeHtml(entry.series.title)}</div><div class="meta">Ch. ${entry.series.progress}${entry.unreadCount ? ` · ${entry.unreadCount} new` : ""}</div></div>
      <button data-open="${escapeHtml(entry.preferredSource.lastReadUrl)}">Resume</button>
    </article>`,
    )
    .join("")
  list.querySelectorAll<HTMLButtonElement>("[data-open]").forEach((button) => {
    button.addEventListener("click", () => chrome.tabs.create({ url: button.dataset.open! }))
  })
}

document
  .getElementById("refresh")
  ?.addEventListener("click", () =>
    chrome.runtime.sendMessage({ type: "REFRESH_LIBRARY" }, () => void render()),
  )
document
  .getElementById("dashboard")
  ?.addEventListener("click", () => chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" }))
document.getElementById("settings")?.addEventListener("click", () => chrome.runtime.openOptionsPage())
void render()
