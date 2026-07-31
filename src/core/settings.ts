import { DEFAULT_SETTINGS } from "./libraryDb"
import { ExtensionSettings } from "./models"

const SETTINGS_KEY = "extensionSettings"

export async function loadSettings(): Promise<ExtensionSettings> {
  if (typeof chrome === "undefined" || !chrome.storage?.local?.get) return { ...DEFAULT_SETTINGS }
  const result = await chrome.storage.local.get(SETTINGS_KEY)
  return { ...DEFAULT_SETTINGS, ...(result[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined) }
}

export async function saveSettings(settings: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const next = { ...(await loadSettings()), ...settings }
  if (typeof chrome !== "undefined" && chrome.storage?.local?.set) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: next })
  }
  return next
}

export { SETTINGS_KEY }
