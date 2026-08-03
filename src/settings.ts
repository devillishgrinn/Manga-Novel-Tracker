import { loadSettings, saveSettings } from "./core/settings"

async function render(): Promise<void> {
  const settings = await loadSettings()
  ;(document.getElementById("consent") as HTMLInputElement).checked = settings.onboardingComplete
  ;(document.getElementById("tracking") as HTMLInputElement).checked = settings.trackingEnabled
  ;(document.getElementById("refresh") as HTMLInputElement).checked = settings.refreshEnabled
  ;(document.getElementById("notifications") as HTMLInputElement).checked = settings.notificationsEnabled
  ;(document.getElementById("hour") as HTMLInputElement).value = String(settings.refreshHourLocal)
}

document.getElementById("save")?.addEventListener("click", async () => {
  const consent = (document.getElementById("consent") as HTMLInputElement).checked
  const notifications = (document.getElementById("notifications") as HTMLInputElement).checked
  if (notifications && !(await chrome.permissions.contains({ permissions: ["notifications"] }))) {
    const granted = await chrome.permissions.request({ permissions: ["notifications"] })
    if (!granted) {
      ;(document.getElementById("notifications") as HTMLInputElement).checked = false
    }
  }
  await saveSettings({
    onboardingComplete: consent,
    trackingEnabled: consent && (document.getElementById("tracking") as HTMLInputElement).checked,
    refreshEnabled: (document.getElementById("refresh") as HTMLInputElement).checked,
    notificationsEnabled: (document.getElementById("notifications") as HTMLInputElement).checked,
    refreshHourLocal: Math.max(
      0,
      Math.min(23, Number((document.getElementById("hour") as HTMLInputElement).value) || 9),
    ),
  })
  chrome.runtime.sendMessage({ type: "REFRESH_LIBRARY" })
  ;(document.getElementById("status") as HTMLElement).textContent = " Saved."
})
void render()
