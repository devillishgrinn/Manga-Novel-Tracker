import { SiteAdapter } from "../core/adapter";
import { TrackerPayload } from "../core/models";

const HOST_REGEX = /(^|\.)manganato\.gg$|(^|\.)mangakakalot\.gg$/i;
const CHAPTER_PATH_REGEX = /^\/manga\/([^/]+)\/chapter[-_]([0-9]+(?:[._-][0-9]+)?)(?:\/)?$/i;
const GENERIC_COVER_PATH_REGEX =
  /\/images\/(?:og-image|logo|svg\/logo|default_nato|404-avatar|no-avatar)/i;

function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function parseChapterToken(token: string): number {
  return Number(token.replace(/[\-_]/g, "."));
}

function extractChapterParts(pathname: string): { seriesSlug: string; chapter: number } | null {
  const match = pathname.match(CHAPTER_PATH_REGEX);
  if (!match) {
    return null;
  }

  const chapter = parseChapterToken(match[2]);
  if (Number.isNaN(chapter)) {
    return null;
  }

  return {
    seriesSlug: match[1],
    chapter,
  };
}

function extractTitleFromHeading(seriesSlug: string): string | null {
  const selectors = [
    `h1 a[href*="/manga/${seriesSlug}"]`,
    'h1 a[href*="/manga/"]',
    "h1",
    ".story-info-right h1",
    ".panel-story-info .story-info-right h1",
  ];

  for (const selector of selectors) {
    const text = document.querySelector(selector)?.textContent?.trim();
    if (text) {
      return text;
    }
  }

  return null;
}

function extractTitleFromMeta(chapter: number): string | null {
  const rawTitle =
    document.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
    document.title ||
    "";

  const normalized = rawTitle
    .replace(/\s*[-|:]\s*(manganato|mangakakalot)(?:\.com)?\b.*$/i, "")
    .trim();

  if (!normalized) {
    return null;
  }

  const titleBeforeChapter = normalized.match(/^(.*?)\s*[-|:]?\s*Chapter\s+\d+(?:[._-]\d+)?\b/i);
  if (titleBeforeChapter?.[1]?.trim()) {
    return titleBeforeChapter[1].trim();
  }

  const titleAfterChapter = normalized.match(/^Chapter\s+\d+(?:[._-]\d+)?\s*[-|:]\s*(.*)$/i);
  if (titleAfterChapter?.[1]?.trim()) {
    return titleAfterChapter[1].trim();
  }

  const exactChapterToken = new RegExp(`\\bChapter\\s+${chapter}(?:\\.0+)?\\b`, "i");
  return normalized.replace(exactChapterToken, "").replace(/[\s\-|:]+$/, "").trim() || null;
}

function extractCoverUrl(origin: string): string | undefined {
  const candidates = [
    document.querySelector(".panel-story-info img")?.getAttribute("src"),
    document.querySelector(".story-info-left img")?.getAttribute("src"),
    document.querySelector(".manga-info-pic img")?.getAttribute("src"),
    document.querySelector('meta[property="og:image"]')?.getAttribute("content"),
    document.querySelector('meta[name="twitter:image"]')?.getAttribute("content"),
  ];

  for (const rawCover of candidates) {
    if (!rawCover) {
      continue;
    }

    try {
      const resolved = new URL(rawCover, origin);
      if (resolved.origin === new URL(origin).origin && GENERIC_COVER_PATH_REGEX.test(resolved.pathname)) {
        continue;
      }

      return resolved.href;
    } catch {
      continue;
    }
  }

  return undefined;
}

export const manganatoAdapter: SiteAdapter = {
  siteId: "manganato",

  match(url: string): boolean {
    try {
      const parsed = new URL(url);
      return HOST_REGEX.test(parsed.hostname) && CHAPTER_PATH_REGEX.test(parsed.pathname);
    } catch {
      return false;
    }
  },

  extract(): TrackerPayload | null {
    const currentUrl = new URL(window.location.href);
    const chapterData = extractChapterParts(currentUrl.pathname);

    if (!chapterData) {
      return null;
    }

    const { seriesSlug, chapter } = chapterData;
    const title =
      extractTitleFromHeading(seriesSlug) ||
      extractTitleFromMeta(chapter) ||
      slugToTitle(seriesSlug);

    return {
      title,
      mediaType: "manga",
      progress: chapter,
      unit: "chapter",
      sourceUrl: window.location.href,
      siteId: "manganato",
      seriesUrl: `${currentUrl.origin}/manga/${seriesSlug}`,
      coverUrl: extractCoverUrl(currentUrl.origin),
    };
  },
};
