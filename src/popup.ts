import { loadEntries, saveEntries } from "./core/storage";
import { TrackerEntry } from "./core/models";

console.log("🟢 Popup script loaded");

const list = document.getElementById("list")!;

// Initial load
refreshList();

async function refreshList() {
    const entries = await loadEntries();

  // Sort by last updated (newest first)
    entries.sort((a, b) => b.lastUpdated - a.lastUpdated);

    render(entries);
}

function formatSiteName(siteId: string): string {
  // Add custom formatting for specific sites here
    if (siteId === 'helioscans') return 'HelioScans';
    if (siteId === 'fenrirealm') return 'Fenrir Realm';

  // Default: Capitalize first letter (e.g. "manganato" -> "Manganato")
    return siteId.charAt(0).toUpperCase() + siteId.slice(1);
}

function render(entries: TrackerEntry[]) {
    if (entries.length === 0) {
    list.innerHTML = `<div class="empty">No tracked entries yet<br>Read something to get started!</div>`;
    return;
    }

    list.innerHTML = "";

    entries.forEach((entry) => {
    const div = document.createElement("div");
    div.className = "entry";

    // Get the most relevant link (just picking the first available source for now)
    const sourceUrl = Object.values(entry.sourceMap)[0] || "#";
    const seriesUrl = entry.seriesUrl || sourceUrl; //// Fallback to chapter if no series link
    
    // Use a placeholder if no cover exists
    const coverImage = entry.coverUrl || 'https://via.placeholder.com/50x70?text=No+Img';

    // Get all site names where this novel is tracked
    const siteNames = Object.keys(entry.sourceMap)
        .map(id => formatSiteName(id))
        .join(", ");

    div.innerHTML = `
    <div class="cover-wrapper" title="Go to Series Page" style="cursor: pointer;">
            <img src="${coverImage}" class="cover-img" data-href="${seriesUrl}" />
    </div>

    <div class="info">
        <div class="title" data-url="${sourceUrl}" title="Go to Chapter">${entry.title}</div>
        <div class="meta">
            <span class="badge">${entry.mediaType}</span>
            <span>Ch. ${entry.progress}</span>
            <span class="site-tag">• ${siteNames}</span>
        </div>
    </div>

    <div class="actions">
        <button class="btn-inc" data-id="${entry.id}" title="+1 Chapter">+1</button>
        <button class="btn-del delete" data-id="${entry.id}" title="Remove">✕</button>
    </div>
    `;

    // ✨ NEW: Click listener for the cover
    const coverImg = div.querySelector(".cover-img") as HTMLElement;
    coverImg.addEventListener("click", () => {
        const url = coverImg.getAttribute("data-href");
        if (url && url !== "#") chrome.tabs.create({ url });
    });

    // Add event listeners specific to this entry
    const titleLink = div.querySelector(".title") as HTMLElement;
    titleLink.addEventListener("click", () => {
        if (sourceUrl !== "#") chrome.tabs.create({ url: sourceUrl });
    });

    const incBtn = div.querySelector(".btn-inc") as HTMLButtonElement;
    incBtn.addEventListener("click", () => updateProgress(entry.id, 1));

    const delBtn = div.querySelector(".btn-del") as HTMLButtonElement;
    delBtn.addEventListener("click", () => deleteEntry(entry.id));

    list.appendChild(div);
    });
}

async function updateProgress(id: string, amount: number) {
    const entries = await loadEntries();
    const entry = entries.find((e) => e.id === id);

    if (entry) {
    entry.progress += amount;
    entry.lastUpdated = Date.now();
    await saveEntries(entries);
    refreshList(); // Re-render to show changes
    } 
}

async function deleteEntry(id: string) {
    if (!confirm("Remove this series from your list?")) return;

    const entries = await loadEntries();
    const filtered = entries.filter((e) => e.id !== id);

    await saveEntries(filtered);
    refreshList();
}