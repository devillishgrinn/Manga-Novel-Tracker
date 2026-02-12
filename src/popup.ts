import { loadEntries, saveEntries } from "./core/storage";
import { TrackerEntry } from "./core/models";

console.log("Popup script loaded");

const list = document.getElementById("list")!;

type SiteGroup = {
    siteId: string;
    entries: TrackerEntry[];
};

refreshList();

async function refreshList() {
    const entries = await loadEntries();

  // Sort by last updated (newest first)
    entries.sort((a, b) => b.lastUpdated - a.lastUpdated);

    render(entries);
}

function formatSiteName(siteId: string): string {
  // Add custom formatting for specific sites here
    if (siteId === "helioscans") return "HelioScans";
    if (siteId === "fenrirealm") return "Fenrir Realm";
    if (siteId === "asurascans") return "Asura Scans";

  // Default: Capitalize first letter (e.g. "manganato" -> "Manganato")
    return siteId.charAt(0).toUpperCase() + siteId.slice(1);
}

function getSiteMonogram(siteId: string): string {
    if (siteId === "asurascans") return "AS";
    if (siteId === "fenrirealm") return "FR";
    if (siteId === "helioscans") return "HS";
    return siteId.slice(0, 2).toUpperCase();
}

function getSiteLogoUrl(siteId: string): string | null {
    if (siteId === "asurascans") return "https://asuracomic.net/images/logo.webp";
    if (siteId === "fenrirealm") return "https://fenrirealm.com/img/favicon/favicon-32x32.png";
    if (siteId === "helioscans") return "https://cdn.meowing.org/uploads/_9FxZ8P7Tik";
    return null;
}

function getPrimarySiteId(entry: TrackerEntry): string {
    return Object.keys(entry.sourceMap)[0] || "unknown";
}

function formatChapter(progress: number): string {
    if (Number.isInteger(progress)) return String(progress);
    return String(progress).replace(/\.0+$/, "");
}

function rewriteChapterUrl(siteId: string, currentUrl: string, chapter: number): string {
    const chapterValue = formatChapter(chapter);

    try {
    const parsed = new URL(currentUrl);

    if (siteId === "asurascans") {
        parsed.pathname = parsed.pathname.replace(
        /(\/series\/[^/]+\/chapter\/)(\d+(?:\.\d+)?)(\/?)/i,
        `$1${chapterValue}$3`,
        );
        return parsed.href;
    }

    if (siteId === "fenrirealm") {
        parsed.pathname = parsed.pathname.replace(
        /(\/series\/[^/]+\/)(\d+(?:\.\d+)?)(\/?)/i,
        `$1${chapterValue}$3`,
        );
        return parsed.href;
    }

    if (siteId === "helioscans" && /\/series\/[^/]+\/\d+(?:\.\d+)?\/?$/i.test(parsed.pathname)) {
        parsed.pathname = parsed.pathname.replace(
        /(\/series\/[^/]+\/)(\d+(?:\.\d+)?)(\/?)/i,
        `$1${chapterValue}$3`,
        );
        return parsed.href;
    }

    const generic = parsed.pathname.replace(/(\d+(?:\.\d+)?)(\/?)$/i, `${chapterValue}$2`);
    if (generic !== parsed.pathname) {
        parsed.pathname = generic;
        return parsed.href;
    }

    return currentUrl;
    } catch {
    return currentUrl;
    }
}

function getPrimaryChapterUrl(entry: TrackerEntry): string {
    const siteId = getPrimarySiteId(entry);
    const sourceUrl = entry.sourceMap[siteId];
    if (!sourceUrl) return "#";
    return rewriteChapterUrl(siteId, sourceUrl, entry.progress);
}

function updateEntryChapterUrls(entry: TrackerEntry): void {
    const nextMap: Record<string, string> = {};
    Object.entries(entry.sourceMap).forEach(([siteId, sourceUrl]) => {
    nextMap[siteId] = rewriteChapterUrl(siteId, sourceUrl, entry.progress);
    });
    entry.sourceMap = nextMap;
}

function groupEntriesBySite(entries: TrackerEntry[]): SiteGroup[] {
    const grouped = new Map<string, TrackerEntry[]>();

    entries.forEach((entry) => {
    const siteId = getPrimarySiteId(entry);
    const current = grouped.get(siteId) || [];
    current.push(entry);
    grouped.set(siteId, current);
    });

    return [...grouped.entries()]
    .sort(([a], [b]) => formatSiteName(a).localeCompare(formatSiteName(b)))
    .map(([siteId, siteEntries]) => ({
        siteId,
        entries: siteEntries.sort((a, b) => b.lastUpdated - a.lastUpdated),
    }));
}

function render(entries: TrackerEntry[]) {
    if (entries.length === 0) {
    list.innerHTML = `<div class="empty">No tracked entries yet<br>Read something to get started!</div>`;
    return;
    }

    list.innerHTML = "";
    const groups = groupEntriesBySite(entries);

    groups.forEach((group) => {
    const siteName = formatSiteName(group.siteId);
    const siteLogoUrl = getSiteLogoUrl(group.siteId);
    const siteMonogram = getSiteMonogram(group.siteId);
    const section = document.createElement("section");
    section.className = `site-section site-${group.siteId}`;
    section.innerHTML = `
        <div class="site-banner">
        <span class="site-logo" title="${siteName}">
            ${siteLogoUrl ? `<img class="site-logo-img" src="${siteLogoUrl}" alt="${siteName} logo" />` : ""}
        <span class="site-logo-fallback"${siteLogoUrl ? ' style="display: none;"' : ""}>${siteMonogram}</span>
        </span>
        <div class="site-banner-copy">
            <span class="site-banner-name">${siteName}</span>
            <span class="site-banner-count">${group.entries.length} tracked</span>
        </div>
        </div>
        <div class="site-items"></div>
    `;

    const logoImg = section.querySelector(".site-logo-img") as HTMLImageElement | null;
    const logoFallback = section.querySelector(".site-logo-fallback") as HTMLElement | null;
    if (logoImg && logoFallback) {
        logoImg.addEventListener("error", () => {
        logoImg.style.display = "none";
        logoFallback.style.display = "inline-flex";
        });
    }

    const items = section.querySelector(".site-items") as HTMLDivElement;

    group.entries.forEach((entry) => {
        const div = document.createElement("div");
        div.className = `entry entry-${entry.mediaType}`;

        const sourceUrl = getPrimaryChapterUrl(entry);
        const seriesUrl = entry.seriesUrl || sourceUrl;
        const coverImage = entry.coverUrl || "https://via.placeholder.com/50x70?text=No+Img";
        const linkedCount = Object.keys(entry.sourceMap).length;

        div.innerHTML = `
        <div class="cover-wrapper" title="Go to Series Page" style="cursor: pointer;">
            <img src="${coverImage}" class="cover-img" data-href="${seriesUrl}" />
        </div>

        <div class="info">
            <div class="title" data-url="${sourceUrl}" title="Go to Chapter">${entry.title}</div>
            <div class="meta">
            <span class="badge">${entry.mediaType}</span>
            <span class="chapter-controls">
                <button class="btn-dec" data-id="${entry.id}" title="Previous Chapter">-</button>
                <span class="chapter-value">Ch. ${formatChapter(entry.progress)}</span>
                <button class="btn-inc" data-id="${entry.id}" title="Next Chapter">+</button>
            </span>
            ${linkedCount > 1 ? `<span class="linked-tag">${linkedCount} linked</span>` : ""}
            </div>
        </div>

        <div class="actions">
            <button class="btn-del delete" data-id="${entry.id}" title="Remove">x</button>
        </div>
        `;

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

    const decBtn = div.querySelector(".btn-dec") as HTMLButtonElement;
    decBtn.addEventListener("click", () => updateProgress(entry.id, -1));

    const incBtn = div.querySelector(".btn-inc") as HTMLButtonElement;
    incBtn.addEventListener("click", () => updateProgress(entry.id, 1));

    const delBtn = div.querySelector(".btn-del") as HTMLButtonElement;
    delBtn.addEventListener("click", () => deleteEntry(entry.id));

    items.appendChild(div);
    });

    list.appendChild(section);
    });
}

async function updateProgress(id: string, amount: number) {
    const entries = await loadEntries();
    const entry = entries.find((e) => e.id === id);

    if (entry) {
    entry.progress = Math.max(1, entry.progress + amount);
    updateEntryChapterUrls(entry);
    entry.lastUpdated = Date.now();
    await saveEntries(entries);
    refreshList();
    }
}

async function deleteEntry(id: string) {
    if (!confirm("Remove this series from your list?")) return;

    const entries = await loadEntries();
    const filtered = entries.filter((e) => e.id !== id);

    await saveEntries(filtered);
    refreshList();
}
