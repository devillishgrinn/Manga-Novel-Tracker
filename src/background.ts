import { getAdapter } from "./core/registry"
import {
  initializeLibrary,
  listLibraryEntries,
  listSourceSeries,
  recordSeriesRefresh,
  saveProgress,
} from "./core/libraryDb"
import { ExtensionMessage } from "./core/messages"
import { loadSettings } from "./core/settings"

const DAILY_REFRESH_ALARM = "daily-release-refresh"
const REQUEST_TIMEOUT_MS = 10_000
const REQUEST_SPACING_MS = 2_000

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function nextRefreshTime(hour: number): number {
  const next = new Date()
  next.setHours(hour, 0, 0, 0)
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1)
  return next.getTime()
}

async function ensureRefreshAlarm(): Promise<void> {
  const settings = await loadSettings()
  if (!settings.refreshEnabled) {
    await chrome.alarms.clear(DAILY_REFRESH_ALARM)
    return
  }
  await chrome.alarms.create(DAILY_REFRESH_ALARM, {
    when: nextRefreshTime(settings.refreshHourLocal),
    periodInMinutes: 24 * 60,
  })
}

async function fetchPublicText(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      credentials: "omit",
      redirect: "follow",
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Request failed (${response.status})`)
    const contentType = response.headers.get("content-type") || ""
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new Error("Source did not return an HTML page")
    }
    return response.text()
  } finally {
    clearTimeout(timeout)
  }
}

async function updateBadge(): Promise<void> {
  const unread = (await listLibraryEntries()).reduce((total, entry) => total + entry.unreadCount, 0)
  await chrome.action.setBadgeText({ text: unread > 0 ? String(unread) : "" })
  if (unread > 0) await chrome.action.setBadgeBackgroundColor({ color: "#2f7d4a" })
}

async function notifyRelease(title: string, chapter: number): Promise<void> {
  const settings = await loadSettings()
  if (!settings.notificationsEnabled) return
  const permitted = await chrome.permissions.contains({ permissions: ["notifications"] })
  if (!permitted) return
  await chrome.notifications.create(`release-${Date.now()}`, {
    type: "basic",
    iconUrl: "assets/icon.svg",
    title: "New chapter available",
    message: `${title}: Chapter ${chapter}`,
    priority: 0,
  })
}

export async function refreshLibrary(): Promise<void> {
  const settings = await loadSettings()
  if (!settings.refreshEnabled) return
  const sources = await listSourceSeries()
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index]
    const adapter = getAdapter(source.sourceId)
    if (!adapter) {
      await recordSeriesRefresh(null, source.id, "No installed adapter is available for this source")
      continue
    }
    try {
      const pageUrl = new URL(source.seriesUrl)
      const html = await fetchPublicText(source.seriesUrl)
      const snapshot = adapter.parseSeriesPage(html, pageUrl)
      const result = await recordSeriesRefresh(snapshot, source.id, snapshot ? undefined : "No release metadata found")
      if (result?.hasNewRelease && result.source.latestChapter !== undefined) {
        await notifyRelease(result.source.title, result.source.latestChapter)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Refresh failed"
      await recordSeriesRefresh(null, source.id, message)
    }
    if (index < sources.length - 1) await wait(REQUEST_SPACING_MS)
  }
  await updateBadge()
}

async function startup(): Promise<void> {
  await initializeLibrary()
  await ensureRefreshAlarm()
  await updateBadge()
}

if (chrome.runtime?.onInstalled?.addListener) {
  chrome.runtime.onInstalled.addListener(() => void startup())
}
if (chrome.runtime?.onStartup?.addListener) {
  chrome.runtime.onStartup.addListener(() => void startup())
}
void startup()

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === DAILY_REFRESH_ALARM) void refreshLibrary()
})

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === "TRACK_PROGRESS") {
    void saveProgress(message.payload).then(updateBadge).then(() => sendResponse({ ok: true }))
    return true
  }
  if (message.type === "REFRESH_LIBRARY") {
    void refreshLibrary().then(() => sendResponse({ ok: true })).catch((error: Error) => sendResponse({ ok: false, error: error.message }))
    return true
  }
  if (message.type === "OPEN_DASHBOARD") {
    void chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") })
    return false
  }
  return false
})
