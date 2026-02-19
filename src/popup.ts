import { loadEntries, saveEntries } from "./core/storage";
import { TrackerEntry } from "./core/models";
import { AnalyzeCurrentPageResponse, PageAnalysis } from "./core/messages";

console.log("Popup script loaded");

const list = document.getElementById("list")!;
const mediaToggle = document.getElementById("mediaToggle");
const mediaTogglePill = mediaToggle?.querySelector<HTMLElement>(".media-toggle-pill");
const detectedPanel = document.getElementById("detectedPanel");

const SITE_RULES_KEY = "siteAutoTrackRules";
const LEGACY_DOMAIN_RULES_KEY = "domainAutoTrackRules";
const DEFAULT_MIN_CONFIDENCE = 80;
const LOCAL_COVER_FALLBACK =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='70' viewBox='0 0 50 70'%3E%3Crect width='50' height='70' fill='%23101622'/%3E%3Crect x='1' y='1' width='48' height='68' fill='none' stroke='%23364763'/%3E%3Ctext x='25' y='38' fill='%2397abcf' font-size='8' text-anchor='middle' font-family='Segoe UI,sans-serif'%3ENo Cover%3C/text%3E%3C/svg%3E";
const SITE_ID_ALIASES: Record<string, string> = {
    asuracomic: "asurascans",
    asurascans: "asurascans",
    mangakakalot: "manganato",
    manganato: "manganato",
    fenrirealm: "fenrirealm",
    helioscans: "helioscans",
    novelbin: "novelbin",
    rapid: "rapid",
    manhuaus: "manhuaus",
};

type MediaFilter = "manga" | "novel";

type SiteGroup = {
    siteId: string;
    entries: TrackerEntry[];
};

let activeMediaFilter: MediaFilter = "manga";
let cachedEntries: TrackerEntry[] = [];
let detectedAnalysis: PageAnalysis | null = null;
let detectedHostname: string | null = null;
let detectedSiteKey: string | null = null;

setupMediaToggle();
refreshList();
void detectCurrentPage();

function isMediaFilter(value: string): value is MediaFilter {
    return value === "manga" || value === "novel";
}

function setupMediaToggle() {
    if (!mediaToggle) return;

    const buttons = mediaToggle.querySelectorAll<HTMLButtonElement>(".media-toggle-btn[data-media]");
    buttons.forEach((button) => {
    button.addEventListener("click", () => {
        const media = button.dataset.media;
        if (!media || !isMediaFilter(media) || media === activeMediaFilter) return;

        activeMediaFilter = media;
        syncMediaToggleState();
        renderFilteredEntries();
        renderDetectionPanelForActiveFilter();
    });
    });

    syncMediaToggleState();
}

function syncMediaToggleState() {
    if (!mediaToggle) return;

    const buttons = mediaToggle.querySelectorAll<HTMLButtonElement>(".media-toggle-btn[data-media]");
    buttons.forEach((button) => {
    const isActive = button.dataset.media === activeMediaFilter;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    });

    mediaTogglePill?.setAttribute("data-active", activeMediaFilter);
}

function renderFilteredEntries() {
    const filteredEntries = cachedEntries.filter((entry) => entry.mediaType === activeMediaFilter);
    render(filteredEntries);
}

async function refreshList() {
    const entries = await loadEntries();

  // Sort by last updated (newest first)
    entries.sort((a, b) => b.lastUpdated - a.lastUpdated);

    cachedEntries = entries;
    renderFilteredEntries();
}

function normalizeHostname(hostname: string): string {
    return hostname.replace(/^www\./i, "").toLowerCase();
}

function normalizeSiteToken(value: string): string {
    return value
        .toLowerCase()
        .replace(/^https?:\/\//i, "")
        .replace(/^www\./i, "")
        .split(/[/?#]/)[0]
        .split(".")[0]
        .replace(/[^a-z0-9]+/g, "");
}

function normalizeRuleKey(key: string): string {
    return normalizeHostname(key);
}

function looksLikeHostname(value: string): boolean {
    return value.includes(".");
}

function canonicalizeSiteId(siteId: string, sourceUrl?: string): string {
    const tokenFromSiteId = normalizeSiteToken(siteId);
    if (SITE_ID_ALIASES[tokenFromSiteId]) {
        return SITE_ID_ALIASES[tokenFromSiteId];
    }

    if (sourceUrl) {
        try {
            const hostToken = normalizeSiteToken(new URL(sourceUrl).hostname);
            if (SITE_ID_ALIASES[hostToken]) {
                return SITE_ID_ALIASES[hostToken];
            }
        } catch {
            // Ignore URL parse failures.
        }
    }

    return normalizeHostname(siteId);
}

function formatConfidence(confidence: number): string {
    const safe = Math.max(0, Math.min(100, Math.round(confidence)));
    return `${safe}% confidence`;
}

function getSuggestedMinConfidence(confidence: number): number {
    if (confidence >= 95) return 90;
    if (confidence >= 85) return 80;
    return DEFAULT_MIN_CONFIDENCE;
}

async function loadSiteRules(): Promise<Record<string, { autoTrack: boolean; minConfidence: number }>> {
    if (!chrome.storage?.local?.get) {
        return {};
    }

    const result = await chrome.storage.local.get([SITE_RULES_KEY, LEGACY_DOMAIN_RULES_KEY]);
    const rules = result[SITE_RULES_KEY] || result[LEGACY_DOMAIN_RULES_KEY];

    if (!rules || typeof rules !== "object") {
        return {};
    }

    return rules as Record<string, { autoTrack: boolean; minConfidence: number }>;
}

async function saveSiteRule(siteKey: string, minConfidence: number): Promise<void> {
    if (!chrome.storage?.local?.set) {
        return;
    }

    const rules = await loadSiteRules();
    const normalized = normalizeRuleKey(siteKey);
    rules[normalized] = {
        autoTrack: true,
        minConfidence,
    };

    await chrome.storage.local.set({ [SITE_RULES_KEY]: rules });
}

async function removeSiteRule(siteKey: string, legacyHostname?: string | null): Promise<void> {
    if (!chrome.storage?.local?.set) {
        return;
    }

    const rules = await loadSiteRules();
    const normalized = normalizeRuleKey(siteKey);
    const legacyNormalized = legacyHostname ? normalizeRuleKey(legacyHostname) : null;
    if (!(normalized in rules) && (!legacyNormalized || !(legacyNormalized in rules))) {
        return;
    }

    delete rules[normalized];
    if (legacyNormalized) {
        delete rules[legacyNormalized];
    }
    await chrome.storage.local.set({ [SITE_RULES_KEY]: rules });
}

async function isSiteAutoTracked(siteKey: string, legacyHostname?: string | null): Promise<boolean> {
    const rules = await loadSiteRules();
    const normalized = normalizeRuleKey(siteKey);
    if (rules[normalized]?.autoTrack) {
        return true;
    }

    if (legacyHostname) {
        const legacyNormalized = normalizeRuleKey(legacyHostname);
        return Boolean(rules[legacyNormalized]?.autoTrack);
    }

    return false;
}

function hideDetectionPanel(clearState = false): void {
    if (!detectedPanel) return;

    detectedPanel.classList.add("hidden");
    detectedPanel.innerHTML = "";

    if (clearState) {
        detectedAnalysis = null;
        detectedHostname = null;
        detectedSiteKey = null;
    }
}

function renderDetectionPanelForActiveFilter(): void {
    if (!detectedAnalysis) {
        hideDetectionPanel();
        return;
    }

    if (detectedAnalysis.payload.mediaType !== activeMediaFilter) {
        hideDetectionPanel();
        return;
    }

    renderDetectionPanel(detectedAnalysis);
}

function resolveDisplayCover(coverUrl: string | undefined): string {
    if (!coverUrl || !coverUrl.trim()) {
        return LOCAL_COVER_FALLBACK;
    }

    try {
        const resolved = new URL(coverUrl);
        if (resolved.protocol === "http:" || resolved.protocol === "https:") {
            return resolved.href;
        }
    } catch {
        // Ignore and fall through.
    }

    return LOCAL_COVER_FALLBACK;
}

function renderDetectionPanel(analysis: PageAnalysis): void {
    if (!detectedPanel) return;

    const chapterText = formatChapter(analysis.payload.progress);
    const previewCover = resolveDisplayCover(analysis.payload.coverUrl);
    const siteKey = canonicalizeSiteId(
        detectedSiteKey || analysis.payload.siteId || detectedHostname || "site",
    );
    const siteLabel = looksLikeHostname(siteKey) ? siteKey : formatSiteName(siteKey);
    detectedPanel.classList.remove("hidden");
    detectedPanel.innerHTML = `
        <div class="detected-preview">
            <img class="detected-cover-img" src="${previewCover}" data-fallback-src="${LOCAL_COVER_FALLBACK}" alt="${analysis.payload.title} cover" />
            <div class="detected-copy">
                <div class="detected-title">${analysis.payload.title}</div>
                <div class="detected-meta">Detected chapter ${chapterText} - ${formatConfidence(analysis.confidence)}</div>
            </div>
        </div>
        <div class="detected-actions">
            <button type="button" class="btn-track" id="detectedTrackBtn">Add To Tracker</button>
            <label class="detected-autotrack">
                <input type="checkbox" id="detectedAutoTrackCheck" />
                Always auto-track this site (${siteLabel})
            </label>
            <span class="detected-status" id="detectedStatus"></span>
        </div>
    `;

    const addButton = detectedPanel.querySelector<HTMLButtonElement>("#detectedTrackBtn");
    const autoTrackCheck = detectedPanel.querySelector<HTMLInputElement>("#detectedAutoTrackCheck");
    const status = detectedPanel.querySelector<HTMLElement>("#detectedStatus");
    const previewImg = detectedPanel.querySelector<HTMLImageElement>(".detected-cover-img");

    if (autoTrackCheck) {
        void (async () => {
            autoTrackCheck.checked = await isSiteAutoTracked(siteKey, detectedHostname);
        })();
    }

    previewImg?.addEventListener("error", () => {
        const fallback = previewImg.dataset.fallbackSrc || LOCAL_COVER_FALLBACK;
        if (previewImg.src !== fallback) {
            previewImg.src = fallback;
        }
    });

    addButton?.addEventListener("click", async () => {
        if (!detectedAnalysis) return;

        chrome.runtime?.sendMessage?.({
            type: "TRACK_PROGRESS",
            payload: detectedAnalysis.payload,
        });

        if (siteKey) {
            if (autoTrackCheck?.checked) {
                await saveSiteRule(
                    siteKey,
                    getSuggestedMinConfidence(detectedAnalysis.confidence),
                );
            } else {
                await removeSiteRule(siteKey, detectedHostname);
            }
        }

        if (status) {
            status.textContent = "Added";
        }

        await refreshList();
    });
}

async function detectCurrentPage(): Promise<void> {
    if (!detectedPanel) return;
    if (!chrome.tabs?.query || !chrome.tabs?.sendMessage) {
        hideDetectionPanel(true);
        return;
    }

    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeTab = tabs[0];

        if (!activeTab?.id || !activeTab.url || !/^https?:\/\//i.test(activeTab.url)) {
            hideDetectionPanel(true);
            return;
        }

        const response = (await chrome.tabs.sendMessage(activeTab.id, {
            type: "ANALYZE_CURRENT_PAGE",
        })) as AnalyzeCurrentPageResponse | undefined;

        if (!response?.detected || !response.analysis) {
            hideDetectionPanel(true);
            return;
        }

        detectedAnalysis = response.analysis;
        detectedHostname =
            response.hostname ||
            normalizeHostname(new URL(activeTab.url).hostname);
        detectedSiteKey =
            response.siteKey ||
            response.analysis.payload.siteId ||
            detectedHostname;
        renderDetectionPanelForActiveFilter();
    } catch {
        hideDetectionPanel(true);
    }
}

function formatSiteName(siteId: string): string {
    if (siteId === "helioscans") return "HelioScans";
    if (siteId === "fenrirealm") return "Fenrir Realm";
    if (siteId === "asurascans") return "Asura Scans";
    if (siteId === "manganato") return "MangaNato";
    if (siteId === "novelbin") return "NovelBin";
    if (siteId === "rapid") return "RAPID";
    if (siteId === "manhuaus") return "Manhuaus";
    if (looksLikeHostname(siteId)) return siteId;
    return siteId.charAt(0).toUpperCase() + siteId.slice(1);
}

function getSiteMonogram(siteId: string): string {
    if (siteId === "asurascans") return "AS";
    if (siteId === "fenrirealm") return "FR";
    if (siteId === "helioscans") return "HS";
    if (siteId === "manganato") return "MN";
    if (siteId === "novelbin") return "NB";
    if (siteId === "rapid") return "RP";
    return siteId.slice(0, 2).toUpperCase();
}

function getSiteLogoUrl(siteId: string, sampleSourceUrl?: string): string | null {
    if (siteId === "asurascans") return "https://asuracomic.net/images/logo.webp";
    if (siteId === "fenrirealm") return "https://fenrirealm.com/img/favicon/favicon-32x32.png";
    if (siteId === "helioscans") return "https://cdn.meowing.org/uploads/_9FxZ8P7Tik";
    if (siteId === "manganato") return "https://www.manganato.gg/images/logo-manganato.webp";
    if (siteId === "novelbin") return "https://novelbin.com/favicon.ico";
    if (siteId === "rapid" && sampleSourceUrl) {
        try {
            return new URL("/favicon.svg", sampleSourceUrl).href;
        } catch {
            // Fall back to generic favicon resolver.
        }
    }

    if (sampleSourceUrl) {
        try {
            const host = new URL(sampleSourceUrl).hostname;
            return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
        } catch {
            return null;
        }
    }

    return null;
}

function getSiteCoverFallback(siteId: string, sourceUrl?: string): string {
    if (siteId === "manganato") {
    try {
        if (sourceUrl && new URL(sourceUrl).hostname.includes("mangakakalot.gg")) {
        return "https://www.mangakakalot.gg/images/404-avatar.webp";
        }
    } catch {
        // Ignore parse errors and use default fallback below.
    }
    return "https://www.manganato.gg/images/default_nato.webp";
    }

    return LOCAL_COVER_FALLBACK;
}

function getPrimarySource(entry: TrackerEntry): { siteId: string; sourceUrl: string } | null {
    const sourceEntries = Object.entries(entry.sourceMap);
    if (sourceEntries.length === 0) {
        return null;
    }

    const normalizedSources = sourceEntries.map(([rawSiteId, sourceUrl]) => ({
        siteId: canonicalizeSiteId(rawSiteId, sourceUrl),
        sourceUrl,
    }));

    const preferred = normalizedSources.find((source) => !looksLikeHostname(source.siteId));
    return preferred || normalizedSources[0];
}

function getPrimarySiteId(entry: TrackerEntry): string {
    return getPrimarySource(entry)?.siteId || "unknown";
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

    if (siteId === "manganato") {
        parsed.pathname = parsed.pathname.replace(
        /(\/manga\/[^/]+\/chapter[-_])(\d+(?:[._-]\d+)?)(\/?)/i,
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
    const primary = getPrimarySource(entry);
    if (!primary) return "#";
    return rewriteChapterUrl(primary.siteId, primary.sourceUrl, entry.progress);
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
    if (cachedEntries.length === 0) {
        list.innerHTML = `<div class="empty">No tracked entries yet<br>Read something to get started!</div>`;
    } else {
        list.innerHTML = `<div class="empty">No tracked ${activeMediaFilter} entries yet<br>Switch the toggle to view the other type.</div>`;
    }
    return;
    }

    list.innerHTML = "";
    const groups = groupEntriesBySite(entries);

    groups.forEach((group) => {
    const siteName = formatSiteName(group.siteId);
    const sampleSourceUrl = getPrimarySource(group.entries[0])?.sourceUrl;
    const siteLogoUrl = getSiteLogoUrl(group.siteId, sampleSourceUrl);
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

        const primarySiteId = getPrimarySiteId(entry);
        const sourceUrl = getPrimaryChapterUrl(entry);
        const seriesUrl = entry.seriesUrl || sourceUrl;
        const coverFallback = getSiteCoverFallback(primarySiteId, sourceUrl === "#" ? undefined : sourceUrl);
        const coverImage = entry.coverUrl || coverFallback;
        const linkedCount = Object.keys(entry.sourceMap).length;

        div.innerHTML = `
        <div class="cover-wrapper" title="Go to Series Page" style="cursor: pointer;">
            <img src="${coverImage}" class="cover-img" data-href="${seriesUrl}" data-fallback-src="${coverFallback}" />
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

        const coverImg = div.querySelector(".cover-img") as HTMLImageElement;
        coverImg.addEventListener("error", () => {
        const fallback = coverImg.dataset.fallbackSrc || LOCAL_COVER_FALLBACK;
        if (coverImg.src !== fallback) {
            coverImg.src = fallback;
            return;
        }

        if (fallback !== LOCAL_COVER_FALLBACK) {
            coverImg.src = LOCAL_COVER_FALLBACK;
        }
        });
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
