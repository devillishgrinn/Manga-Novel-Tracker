import { SiteAdapter } from "../core/adapter";
import { TrackerPayload } from "../core/models";

const HOST_REGEX = /(^|\.)novelbin\.com$/i;
const CHAPTER_PATH_REGEX = /^\/b\/([^/]+)\/chapter-(\d+(?:\.\d+|_\d+)?)(?:[/-].*)?\/?$/i;
const SITE_SUFFIX_REGEX = /\s*[-|:]\s*novel\s*bin\b.*$/i;
const SITE_NAME_REGEX = /^novel\s*bin$/i;

function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function parseChapterToken(token: string): number {
  return Number(token.replace(/_/g, "."));
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
    `a[href*="/b/${seriesSlug}"]:not([href*="/chapter-"])`,
    'h1 a[href*="/b/"]:not([href*="/chapter-"])',
    '.breadcrumb a[href*="/b/"]:not([href*="/chapter-"])',
    "h1",
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
    .replace(SITE_SUFFIX_REGEX, "")
    .replace(/^read\s+/i, "")
    .trim();

  if (!normalized || SITE_NAME_REGEX.test(normalized)) {
    return null;
  }

  const titleBeforeChapter = normalized.match(/^(.*?)\s*[-|:]?\s*Chapter\s+\d+(?:\.\d+)?\b/i);
  if (titleBeforeChapter?.[1]?.trim()) {
    return titleBeforeChapter[1].trim();
  }

  const titleAfterChapter = normalized.match(/^Chapter\s+\d+(?:\.\d+)?\s*[-|:]\s*(.*)$/i);
  if (titleAfterChapter?.[1]?.trim()) {
    return titleAfterChapter[1].trim();
  }

  const exactChapterToken = new RegExp(`\\bChapter\\s+${chapter}(?:\\.0+)?\\b`, "i");
  return normalized.replace(exactChapterToken, "").replace(/[\s\-|:]+$/, "").trim() || null;
}

function extractCoverUrl(origin: string): string | undefined {
  const candidates = [
    document.querySelector('meta[property="og:image"]')?.getAttribute("content"),
    document.querySelector('meta[name="twitter:image"]')?.getAttribute("content"),
    document.querySelector('meta[property="twitter:image"]')?.getAttribute("content"),
    document.querySelector('img[class*="cover" i]')?.getAttribute("src"),
    document.querySelector('img[itemprop="image"]')?.getAttribute("src"),
  ];

  for (const rawCover of candidates) {
    if (!rawCover) {
      continue;
    }

    try {
      return new URL(rawCover, origin).href;
    } catch {
      continue;
    }
  }

  return undefined;
}

export const novelbinAdapter: SiteAdapter = {
  siteId: "novelbin",

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
      mediaType: "novel",
      progress: chapter,
      unit: "chapter",
      sourceUrl: window.location.href,
      siteId: "novelbin",
      seriesUrl: `${currentUrl.origin}/b/${seriesSlug}`,
      coverUrl: extractCoverUrl(currentUrl.origin),
    };
  },
};
