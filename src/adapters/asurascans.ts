import { SiteAdapter } from "../core/adapter";
import { TrackerPayload } from "../core/models";

const CHAPTER_PATH_REGEX = /^\/series\/([^/]+)\/chapter\/(\d+(?:\.\d+)?)(?:\/)?$/i;
const ASURA_HOST_REGEX = /(^|\.)asuracomic\.net$|(^|\.)asurascans\.com$/i;
const SITE_NAME_REGEX = /^Asura\s+Scans$/i;

function slugToTitle(slug: string): string {
  const cleanedSlug = slug.replace(/-[a-f0-9]{8}$/i, "");
  return cleanedSlug
    .split("-")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function extractChapterParts(pathname: string): { seriesSlug: string; chapter: number } | null {
  const match = pathname.match(CHAPTER_PATH_REGEX);
  if (!match) {
    return null;
  }

  return {
    seriesSlug: match[1],
    chapter: Number(match[2]),
  };
}

function extractTitleFromHeading(seriesSlug: string): string | null {
  const headingLink = document.querySelector(
    `a[href*="/series/${seriesSlug}"]:not([href*="/chapter/"])`,
  );

  const headingText = headingLink?.textContent?.trim();
  if (headingText) {
    return headingText;
  }

  const h1Text = document.querySelector("h1")?.textContent?.trim();
  return h1Text || null;
}

function extractTitleFromMeta(chapter: number): string | null {
  const rawTitle =
    document.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
    document.title ||
    "";

  const normalized = rawTitle.trim();
  if (!normalized) {
    return null;
  }

  const withoutSiteSuffix = normalized
    .replace(/\s*[-|:]\s*Asura\s+Scans\s*$/i, "")
    .trim();

  if (!withoutSiteSuffix || SITE_NAME_REGEX.test(withoutSiteSuffix)) {
    return null;
  }

  const titleBeforeChapter = withoutSiteSuffix.match(
    /^(.*?)\s*[-|:]?\s*Chapter\s+\d+(?:\.\d+)?\b/i,
  );
  if (titleBeforeChapter?.[1]) {
    const value = titleBeforeChapter[1].trim();
    if (value) {
      return value;
    }
  }

  const titleAfterChapter = withoutSiteSuffix.match(
    /^Chapter\s+\d+(?:\.\d+)?\s*[-|:]\s*(.*)$/i,
  );
  if (titleAfterChapter?.[1]) {
    const value = titleAfterChapter[1].trim();
    if (value) {
      return value;
    }
  }

  const exactChapterToken = new RegExp(`\\bChapter\\s+${chapter}(?:\\.0+)?\\b`, "i");
  if (exactChapterToken.test(withoutSiteSuffix)) {
    const value = withoutSiteSuffix
      .replace(exactChapterToken, "")
      .replace(/[\s\-|:]+$/, "")
      .trim();
    if (value) {
      return value;
    }
  }

  return withoutSiteSuffix;
}

function extractCoverUrl(origin: string): string | undefined {
  const rawCover =
    document.querySelector('meta[property="og:image"]')?.getAttribute("content") ||
    document.querySelector('meta[name="twitter:image"]')?.getAttribute("content") ||
    undefined;

  if (!rawCover) {
    return undefined;
  }

  try {
    return new URL(rawCover, origin).href;
  } catch {
    return undefined;
  }
}

export const asuraScansAdapter: SiteAdapter = {
  siteId: "asurascans",

  match(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ASURA_HOST_REGEX.test(parsed.hostname) && CHAPTER_PATH_REGEX.test(parsed.pathname);
    } catch {
      return false;
    }
  },

  extract(): TrackerPayload | null {
    const currentUrl = new URL(window.location.href);
    const chapterData = extractChapterParts(currentUrl.pathname);

    if (!chapterData || Number.isNaN(chapterData.chapter)) {
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
      siteId: "asurascans",
      seriesUrl: `${currentUrl.origin}/series/${seriesSlug}`,
      coverUrl: extractCoverUrl(currentUrl.origin),
    };
  },
};
