import { routePage } from "./core/router";

// 1. Check if the current URL matches any known adapter
const payload = routePage(window.location.href);

// 2. If matched, send the data
if (payload) {
  console.log("📦 Tracking detected:", payload);
  chrome.runtime.sendMessage({
    type: "TRACK_PROGRESS",
    payload
  });
}
