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
const COLLAPSED_SECTIONS_KEY = "collapsedSiteSections";
const DELETE_UNDO_TIMEOUT_MS = 5000;
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

type SiteAutoTrackRule = {
    autoTrack: boolean;
    minConfidence: number;
};

type DetectionState = "detected" | "auto" | "low_confidence";

type PendingDeleteState = {
    entry: TrackerEntry;
    originalIndex: number;
    timerId: number;
};

let activeMediaFilter: MediaFilter = "manga";
let cachedEntries: TrackerEntry[] = [];
let detectedAnalysis: PageAnalysis | null = null;
let detectedHostname: string | null = null;
let detectedSiteKey: string | null = null;
let collapsedSections: Record<string, boolean> = {};
let pendingDelete: PendingDeleteState | null = null;
let activeLongPressStop: (() => void) | null = null;
let longPressReleaseHandlersBound = false;

setupMediaToggle();
void initializePopup();
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

async function initializePopup() {
    bindLongPressReleaseHandlers();
    await loadCollapsedSections();
    await refreshList();
}

function bindLongPressReleaseHandlers(): void {
    if (longPressReleaseHandlersBound) {
        return;
    }

    const release = () => {
        if (activeLongPressStop) {
            activeLongPressStop();
        }
    };

    document.addEventListener("pointerup", release);
    document.addEventListener("pointercancel", release);
    document.addEventListener("touchend", release);
    document.addEventListener("touchcancel", release);
    window.addEventListener("blur", release);
    longPressReleaseHandlersBound = true;
}

async function loadCollapsedSections(): Promise<void> {
    if (!chrome.storage?.local?.get) {
        collapsedSections = {};
        return;
    }

    const result = await chrome.storage.local.get(COLLAPSED_SECTIONS_KEY);
    const stored = result[COLLAPSED_SECTIONS_KEY];
    collapsedSections = stored && typeof stored === "object"
        ? (stored as Record<string, boolean>)
        : {};
}

async function saveCollapsedSections(): Promise<void> {
    if (!chrome.storage?.local?.set) {
        return;
    }

    await chrome.storage.local.set({ [COLLAPSED_SECTIONS_KEY]: collapsedSections });
}

function isSiteCollapsed(siteId: string): boolean {
    return Boolean(collapsedSections[siteId]);
}

async function toggleSiteCollapsed(siteId: string): Promise<void> {
    collapsedSections[siteId] = !isSiteCollapsed(siteId);
    await saveCollapsedSections();
    renderFilteredEntries();
}

async function refreshList(options?: { preserveScroll?: boolean }) {
    const previousScrollTop = options?.preserveScroll ? list.scrollTop : null;
    const entries = await loadEntries();

  // Sort by last updated (newest first)
    entries.sort((a, b) => b.lastUpdated - a.lastUpdated);

    cachedEntries = entries;
    renderFilteredEntries();
    if (previousScrollTop !== null) {
        list.scrollTop = previousScrollTop;
    }
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

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function renderSourceList(items: string[]): string {
    if (items.length === 0) {
        return '<span class="detected-source-item">No source attempts logged</span>';
    }

    return items
        .map((item) => `<span class="detected-source-item">${escapeHtml(item)}</span>`)
        .join("");
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

async function getSiteRule(
    siteKey: string,
    legacyHostname?: string | null,
): Promise<SiteAutoTrackRule | null> {
    const rules = await loadSiteRules();
    const normalized = normalizeRuleKey(siteKey);
    if (rules[normalized]) {
        return rules[normalized];
    }

    if (legacyHostname) {
        const legacyNormalized = normalizeRuleKey(legacyHostname);
        if (rules[legacyNormalized]) {
            return rules[legacyNormalized];
        }
    }

    return null;
}

function getDetectionState(
    analysis: PageAnalysis,
    rule: SiteAutoTrackRule | null,
): DetectionState {
    if (!rule || !rule.autoTrack) {
        return "detected";
    }

    const minConfidence = Number.isFinite(rule.minConfidence)
        ? rule.minConfidence
        : DEFAULT_MIN_CONFIDENCE;

    return analysis.confidence >= minConfidence ? "auto" : "low_confidence";
}

function applyDetectionStateBadge(
    badge: HTMLElement | null,
    state: DetectionState,
): void {
    if (!badge) {
        return;
    }

    badge.classList.remove("detect-badge--detected", "detect-badge--auto", "detect-badge--low");

    if (state === "auto") {
        badge.classList.add("detect-badge--auto");
        badge.textContent = "Auto-tracked";
        return;
    }

    if (state === "low_confidence") {
        badge.classList.add("detect-badge--low");
        badge.textContent = "Not confident enough";
        return;
    }

    badge.classList.add("detect-badge--detected");
    badge.textContent = "Detected";
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
    const titleSources = analysis.extractionSources?.title || [];
    const coverSources = analysis.extractionSources?.cover || [];
    const selectedTitleSource = analysis.extractionSources?.selectedTitle;
    const selectedCoverSource = analysis.extractionSources?.selectedCover;
    detectedPanel.classList.remove("hidden");
    detectedPanel.innerHTML = `
        <div class="detected-preview-row">
            <div class="detected-preview">
                <img class="detected-cover-img" src="${previewCover}" data-fallback-src="${LOCAL_COVER_FALLBACK}" alt="${analysis.payload.title} cover" />
                <div class="detected-copy">
                    <div class="detected-title-row">
                        <div class="detected-title">${analysis.payload.title}</div>
                        <span class="detect-badge detect-badge--detected" id="detectedStateBadge">Detected</span>
                    </div>
                    <div class="detected-meta">Detected chapter ${chapterText} - ${formatConfidence(analysis.confidence)}</div>
                </div>
            </div>
            <button type="button" class="detected-info-btn" id="detectedSourcesToggle" aria-label="Show source details" aria-expanded="false">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"></circle>
                    <line x1="12" y1="10.6" x2="12" y2="16.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></line>
                    <circle cx="12" cy="7.6" r="1" fill="currentColor"></circle>
                </svg>
            </button>
        </div>
        <div class="detected-sources hidden" id="detectedSourcesPanel">
            <div class="detected-source-block">
                <div class="detected-source-label">Title sources</div>
                ${selectedTitleSource ? `<div class="detected-source-selected">Selected: ${escapeHtml(selectedTitleSource)}</div>` : ""}
                <div class="detected-source-list">${renderSourceList(titleSources)}</div>
            </div>
            <div class="detected-source-block">
                <div class="detected-source-label">Cover sources</div>
                ${selectedCoverSource ? `<div class="detected-source-selected">Selected: ${escapeHtml(selectedCoverSource)}</div>` : ""}
                <div class="detected-source-list">${renderSourceList(coverSources)}</div>
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
    const sourcesToggle = detectedPanel.querySelector<HTMLButtonElement>("#detectedSourcesToggle");
    const sourcesPanel = detectedPanel.querySelector<HTMLElement>("#detectedSourcesPanel");
    const stateBadge = detectedPanel.querySelector<HTMLElement>("#detectedStateBadge");

    void (async () => {
        const currentRule = await getSiteRule(siteKey, detectedHostname);
        if (autoTrackCheck) {
            autoTrackCheck.checked = Boolean(currentRule?.autoTrack);
        }
        applyDetectionStateBadge(stateBadge, getDetectionState(analysis, currentRule));
    })();

    previewImg?.addEventListener("error", () => {
        const fallback = previewImg.dataset.fallbackSrc || LOCAL_COVER_FALLBACK;
        if (previewImg.src !== fallback) {
            previewImg.src = fallback;
        }
    });

    sourcesToggle?.addEventListener("click", () => {
        if (!sourcesPanel) return;
        const expanded = sourcesToggle.getAttribute("aria-expanded") === "true";
        const nextExpanded = !expanded;
        sourcesToggle.setAttribute("aria-expanded", String(nextExpanded));
        sourcesPanel.classList.toggle("hidden", !nextExpanded);
    });

    addButton?.addEventListener("click", async () => {
        if (!detectedAnalysis) return;

        chrome.runtime?.sendMessage?.({
            type: "TRACK_PROGRESS",
            payload: detectedAnalysis.payload,
        });

        if (siteKey) {
            if (autoTrackCheck?.checked) {
                const minConfidence = getSuggestedMinConfidence(detectedAnalysis.confidence);
                await saveSiteRule(siteKey, minConfidence);
                applyDetectionStateBadge(
                    stateBadge,
                    getDetectionState(detectedAnalysis, { autoTrack: true, minConfidence }),
                );
            } else {
                await removeSiteRule(siteKey, detectedHostname);
                applyDetectionStateBadge(stateBadge, "detected");
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

function getToastHost(): HTMLElement {
    const existing = document.getElementById("toastHost");
    if (existing) {
        return existing;
    }

    const host = document.createElement("div");
    host.id = "toastHost";
    host.className = "toast-host";
    document.body.appendChild(host);
    return host;
}

function clearToast(): void {
    const host = document.getElementById("toastHost");
    if (host) {
        host.innerHTML = "";
    }
}

async function restoreDeletedEntry(state: PendingDeleteState): Promise<void> {
    const entries = await loadEntries();
    if (entries.some((entry) => entry.id === state.entry.id)) {
        return;
    }

    const insertAt = Math.max(0, Math.min(state.originalIndex, entries.length));
    entries.splice(insertAt, 0, state.entry);
    await saveEntries(entries);
    await refreshList();
}

function queueUndoDelete(entry: TrackerEntry, originalIndex: number): void {
    if (pendingDelete) {
        window.clearTimeout(pendingDelete.timerId);
    }

    const host = getToastHost();
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `
        <span class="toast-message">Removed ${escapeHtml(entry.title)}</span>
        <button type="button" class="toast-action">Undo</button>
    `;

    host.innerHTML = "";
    host.appendChild(toast);

    const timerId = window.setTimeout(() => {
        if (pendingDelete?.entry.id === entry.id) {
            pendingDelete = null;
        }
        clearToast();
    }, DELETE_UNDO_TIMEOUT_MS);

    pendingDelete = { entry, originalIndex, timerId };

    const undoButton = toast.querySelector<HTMLButtonElement>(".toast-action");
    undoButton?.addEventListener("click", async () => {
        if (!pendingDelete || pendingDelete.entry.id !== entry.id) {
            return;
        }

        const snapshot = pendingDelete;
        window.clearTimeout(snapshot.timerId);
        pendingDelete = null;
        clearToast();
        await restoreDeletedEntry(snapshot);
    });
}

function attachStepButton(
    button: HTMLButtonElement,
    onStep: () => Promise<void>,
): void {
    let pressDelayId: number | null = null;
    let repeatId: number | null = null;
    let repeated = false;
    let inFlight = false;

    const runStep = () => {
        if (inFlight) {
            return;
        }

        inFlight = true;
        void onStep().finally(() => {
            inFlight = false;
        });
    };

    const clearTimers = () => {
        if (pressDelayId !== null) {
            window.clearTimeout(pressDelayId);
            pressDelayId = null;
        }
        if (repeatId !== null) {
            window.clearInterval(repeatId);
            repeatId = null;
        }

        if (activeLongPressStop === clearTimers) {
            activeLongPressStop = null;
        }
    };

    const handlePressStart = (buttonCode?: number) => {
        if (typeof buttonCode === "number" && buttonCode !== 0) {
            return;
        }

        repeated = false;
        clearTimers();
        activeLongPressStop = clearTimers;
        pressDelayId = window.setTimeout(() => {
            repeated = true;
            runStep();
            repeatId = window.setInterval(runStep, 180);
        }, 350);
    };

    button.addEventListener("click", (event) => {
        if (repeated) {
            event.preventDefault();
            repeated = false;
            return;
        }
        runStep();
    });
    button.addEventListener("pointerdown", (event) => {
        handlePressStart(event.button);
    });
    button.addEventListener("pointerup", clearTimers);
    button.addEventListener("pointercancel", clearTimers);
    button.addEventListener("mouseleave", clearTimers);
}

function beginChapterEdit(
    chapterValueEl: HTMLElement,
    entry: TrackerEntry,
): void {
    if (chapterValueEl.dataset.editing === "true") {
        return;
    }

    chapterValueEl.dataset.editing = "true";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.step = "0.1";
    input.className = "chapter-input";
    input.value = String(entry.progress);

    let settled = false;
    const restoreDisplay = (value: number) => {
        chapterValueEl.dataset.editing = "false";
        chapterValueEl.textContent = `Ch. ${formatChapter(value)}`;
    };

    const commit = async () => {
        if (settled) {
            return;
        }
        settled = true;

        const parsed = Number(input.value);
        if (!Number.isFinite(parsed) || parsed < 1) {
            restoreDisplay(entry.progress);
            return;
        }

        restoreDisplay(parsed);
        await setProgress(entry.id, parsed);
    };

    const cancel = () => {
        if (settled) {
            return;
        }
        settled = true;
        restoreDisplay(entry.progress);
    };

    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            void commit();
        }

        if (event.key === "Escape") {
            event.preventDefault();
            cancel();
        }
    });
    input.addEventListener("blur", () => {
        void commit();
    });

    chapterValueEl.textContent = "";
    chapterValueEl.appendChild(input);
    input.focus();
    input.select();
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
    const collapsed = isSiteCollapsed(group.siteId);
    const section = document.createElement("section");
    section.className = `site-section site-${group.siteId}${collapsed ? " collapsed" : ""}`;
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
        <button type="button" class="site-collapse-btn" aria-label="Toggle ${siteName} section" aria-expanded="${String(!collapsed)}">
            <svg class="site-collapse-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <path d="M5 7.5L10 12.5L15 7.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
        </button>
        </div>
        <div class="site-items"></div>
    `;

    const logoImg = section.querySelector(".site-logo-img") as HTMLImageElement | null;
    const logoFallback = section.querySelector(".site-logo-fallback") as HTMLElement | null;
    const collapseBtn = section.querySelector(".site-collapse-btn") as HTMLButtonElement | null;
    if (logoImg && logoFallback) {
        logoImg.addEventListener("error", () => {
        logoImg.style.display = "none";
        logoFallback.style.display = "inline-flex";
        });
    }
    collapseBtn?.addEventListener("click", () => {
        void toggleSiteCollapsed(group.siteId);
    });

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
                <span class="chapter-value" title="Click to jump to chapter">Ch. ${formatChapter(entry.progress)}</span>
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
    attachStepButton(decBtn, () => updateProgress(entry.id, -1));

    const incBtn = div.querySelector(".btn-inc") as HTMLButtonElement;
    attachStepButton(incBtn, () => updateProgress(entry.id, 1));
    const chapterValueEl = div.querySelector(".chapter-value") as HTMLElement;
    chapterValueEl.addEventListener("click", () => beginChapterEdit(chapterValueEl, entry));

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
    if (!entry) {
        return;
    }

    await setProgress(id, entry.progress + amount);
}

async function setProgress(id: string, nextProgress: number) {
    const entries = await loadEntries();
    const entry = entries.find((e) => e.id === id);

    if (!entry) {
        return;
    }

    const clamped = Math.max(1, nextProgress);
    entry.progress = clamped;
    entry.latestKnownChapter = Math.max(entry.latestKnownChapter ?? 0, clamped);
    updateEntryChapterUrls(entry);

    await saveEntries(entries);
    await refreshList({ preserveScroll: true });
}

async function deleteEntry(id: string) {
    const entries = await loadEntries();
    const index = entries.findIndex((entry) => entry.id === id);
    if (index < 0) {
        return;
    }

    const [removed] = entries.splice(index, 1);

    await saveEntries(entries);
    await refreshList();
    queueUndoDelete(removed, index);
}
