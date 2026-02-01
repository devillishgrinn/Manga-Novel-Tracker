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
    
    // Get all site names where this novel is tracked
    const siteNames = Object.keys(entry.sourceMap)
      .map(id => formatSiteName(id))
      .join(", ");

    div.innerHTML = `
      <div class="info">
        <div class="title" data-url="${sourceUrl}">${entry.title}</div>
        <div class="meta">
          <span class="badge">${entry.mediaType}</span>
          <span>Ch. ${entry.progress}</span>
          <span style="color: #666;">•</span>
          <span style="color: #4da6ff;">${siteNames}</span>
        </div>
      </div>
      <div class="actions">
        <button class="btn-inc" data-id="${entry.id}" title="+1 Chapter">+1</button>
        <button class="btn-del delete" data-id="${entry.id}" title="Remove">✕</button>
      </div>
    `;

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