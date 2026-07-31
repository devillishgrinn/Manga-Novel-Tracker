import { routePage } from "./core/router"
import { loadSettings } from "./core/settings"

async function trackCurrentChapter(): Promise<void> {
  const settings = await loadSettings()
  if (!settings.onboardingComplete || !settings.trackingEnabled) return

  const snapshot = routePage(window.location.href, document)
  if (!snapshot) return

  chrome.runtime.sendMessage({
    type: "TRACK_PROGRESS",
    payload: snapshot,
  })
}

void trackCurrentChapter()
