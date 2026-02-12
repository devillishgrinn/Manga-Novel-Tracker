
import { loadEntries, saveEntries, upsertEntry } from "./core/storage.js"
import { TrackerPayload } from "./core/models"

console.log("🔥 Manga/Novel Tracker background...")
const GENERIC_COVER_PATH_REGEX =
  /\/images\/(?:og-image|logo|svg\/logo|default_nato|404-avatar|no-avatar)/i;
const MANGA_CDN_REFERER_RULE_IDS = [91001, 91002, 91003];
const MANGA_REFERER = "https://www.manganato.gg/";

async function ensureMangaCdnRefererRules(): Promise<void> {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) {
    return;
  }

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: MANGA_CDN_REFERER_RULE_IDS,
      addRules: [
        {
          id: 91001,
          priority: 1,
          action: {
            type: "modifyHeaders",
            requestHeaders: [{ header: "referer", operation: "set", value: MANGA_REFERER }],
          },
          condition: {
            regexFilter: "^https?://img-r1\\.2xstorage\\.com/.*",
            resourceTypes: ["image"],
            initiatorDomains: [chrome.runtime.id],
          },
        },
        {
          id: 91002,
          priority: 1,
          action: {
            type: "modifyHeaders",
            requestHeaders: [{ header: "referer", operation: "set", value: MANGA_REFERER }],
          },
          condition: {
            regexFilter: "^https?://storage\\.waitst\\.com/.*",
            resourceTypes: ["image"],
            initiatorDomains: [chrome.runtime.id],
          },
        },
        {
          id: 91003,
          priority: 1,
          action: {
            type: "modifyHeaders",
            requestHeaders: [{ header: "referer", operation: "set", value: MANGA_REFERER }],
          },
          condition: {
            regexFilter: "^https?://imgs-2\\.2xstorage\\.com/.*",
            resourceTypes: ["image"],
            initiatorDomains: [chrome.runtime.id],
          },
        },
      ],
    });
  } catch (err) {
    console.error("❌ Failed to set manga CDN header rules:", err);
  }
}

function isUsableCoverUrl(url: string, seriesUrl: string): boolean {
  try {
    const resolved = new URL(url);
    const seriesOrigin = new URL(seriesUrl).origin;
    if (resolved.origin === seriesOrigin && GENERIC_COVER_PATH_REGEX.test(resolved.pathname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

if (chrome.runtime?.onInstalled?.addListener) {
  chrome.runtime.onInstalled.addListener(() => {
    void ensureMangaCdnRefererRules();
  });
}

if (chrome.runtime?.onStartup?.addListener) {
  chrome.runtime.onStartup.addListener(() => {
    void ensureMangaCdnRefererRules();
  });
}

void ensureMangaCdnRefererRules();

chrome.runtime.onMessage.addListener((message) => {
  console.log("📨 Message received:", message)

  if (message.type === "TRACK_PROGRESS") {
    handleTrack(message.payload)
  }
})

async function handleTrack(payload: TrackerPayload) {
  
  // ✨ SMART FETCH: If we have a Series URL but NO cover (like on Fenrir), fetch it!
  if (!payload.coverUrl && payload.seriesUrl) {
    try {
      console.log("🔍 Fetching missing cover from:", payload.seriesUrl);
      const response = await fetch(payload.seriesUrl);
      const html = await response.text();

      // Find og:image in the fetched HTML
      const match = html.match(/meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i);
      
      if (match && match[1]) {
        let foundCover = match[1];
        // Ensure absolute URL
        if (!foundCover.startsWith('http')) {
            const origin = new URL(payload.seriesUrl).origin;
            foundCover = new URL(foundCover, origin).href;
        }
        if (isUsableCoverUrl(foundCover, payload.seriesUrl)) {
          console.log("📸 Background fetch success:", foundCover);
          payload.coverUrl = foundCover;
        }
      }
    } catch (err) {
      console.error("❌ Background fetch failed:", err);
    }
  }
  const entries = await loadEntries()
  const updated = upsertEntry(entries, payload, payload.siteId)
  await saveEntries(updated)
}
