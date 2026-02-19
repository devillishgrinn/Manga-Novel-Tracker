import { TrackerPayload } from "./models";

export interface FallbackAnalysis {
  payload: TrackerPayload;
  confidence: number;
  reasons: string[];
}

const CHAPTER_TOKEN_REGEX = /(\d+(?:[._-]\d+)?)/;
const CHAPTER_PATTERNS = [
  /(?:^|[^\w])(chapter|chap|ch)\.?\s*(\d+(?:[._-]\d+)?)(?:[^\w]|$)/i,
  /\/chapter[-_/]?(\d+(?:[._-]\d+)?)(?:\/|$)/i,
];
const TITLE_CHAPTER_SUFFIX_REGEX = /\s*[-|:]\s*(chapter|chap|ch)\.?\s*\d+(?:[._-]\d+)?\b.*$/i;
const TITLE_CHAPTER_PREFIX_REGEX = /^(chapter|chap|ch)\.?\s*\d+(?:[._-]\d+)?\s*[-|:]\s*/i;
const GENERIC_TITLE_REGEX =
  /^(report\s+a\s+bug|unlock\s+chapter|account|profile|home|library|roadmap|explore|sign\s*in|log\s*in|register|search|menu|notices?)$/i;
const GENERIC_COVER_PATH_REGEX = /\/(?:favicon|logo|icon|avatar|default|placeholder|no-cover|no_avatar|og-image)/i;
const SITE_TOKEN_ALIASES: Record<string, string> = {
  asurascans: "asurascans",
  asuracomic: "asurascans",
  manganato: "manganato",
  mangakakalot: "manganato",
  fenrirealm: "fenrirealm",
  helioscans: "helioscans",
  novelbin: "novelbin",
  rapid: "rapid",
  manhuaus: "manhuaus",
};

type SiteIdentity = {
  siteId: string;
  siteName?: string;
};

function parseChapterValue(raw: string): number | null {
  const normalized = raw.replace(/[_-]/g, ".");
  const parsed = Number(normalized);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function normalizeTitle(value: string): string {
  return value
    .replace(TITLE_CHAPTER_SUFFIX_REGEX, "")
    .replace(TITLE_CHAPTER_PREFIX_REGEX, "")
    .replace(/\s*[-|:]\s*(read|online|raw|scan).*$/i, "")
    .trim();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
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

function canonicalSiteId(value: string): string | null {
  const token = normalizeSiteToken(value);
  if (!token) {
    return null;
  }

  return SITE_TOKEN_ALIASES[token] || null;
}

function extractChapterFromText(text: string): { chapter: number; reason: string } | null {
  for (const pattern of CHAPTER_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const token = match[2] ?? match[1];
    const chapter = parseChapterValue(token);
    if (chapter) {
      return {
        chapter,
        reason: "chapter detected from page patterns",
      };
    }
  }

  return null;
}

function extractChapter(url: URL, doc: Document): { chapter: number; reason: string } | null {
  const pathDetection = extractChapterFromText(url.pathname);
  if (pathDetection) {
    return {
      chapter: pathDetection.chapter,
      reason: "chapter detected from URL path",
    };
  }

  const titleDetection = extractChapterFromText(doc.title || "");
  if (titleDetection) {
    return titleDetection;
  }

  const bodyText = doc.body?.innerText?.slice(0, 20000) || "";
  return extractChapterFromText(bodyText);
}

function getMetaContent(doc: Document, selector: string): string | null {
  return doc.querySelector(selector)?.getAttribute("content")?.trim() || null;
}

function getDocumentHtml(doc: Document): string {
  return doc.documentElement?.outerHTML || "";
}

function extractEmbeddedValue(doc: Document, patterns: RegExp[]): string | null {
  const html = getDocumentHtml(doc);
  if (!html) {
    return null;
  }

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const value = match?.[1]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function sanitizeTitleCandidate(raw: string, siteName?: string): string | null {
  if (!raw) {
    return null;
  }

  let title = normalizeWhitespace(normalizeTitle(raw));
  if (!title) {
    return null;
  }

  if (siteName) {
    const escaped = siteName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    title = title
      .replace(new RegExp(`\\s*[-|:]\\s*${escaped}\\s*$`, "i"), "")
      .replace(new RegExp(`^${escaped}\\s*[-|:]\\s*`, "i"), "")
      .trim();
  }

  if (!title || title.length < 2 || GENERIC_TITLE_REGEX.test(title)) {
    return null;
  }

  return title;
}

function slugToTitle(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inferTitleFromUrl(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length >= 2 && /^(series|manga|novel|book|comic|b)$/i.test(parts[0])) {
    const slug = parts[1];
    if (slug && /[-_]/.test(slug) && !CHAPTER_TOKEN_REGEX.test(slug)) {
      return slugToTitle(slug);
    }
  }

  const slugSegments = parts
    .filter((segment) => !/^(chapter|chap|ch)$/i.test(segment))
    .filter((segment) => !CHAPTER_TOKEN_REGEX.test(segment))
    .filter((segment) => /[-_]/.test(segment));

  if (slugSegments.length === 0) {
    return null;
  }

  return slugToTitle(slugSegments[slugSegments.length - 1]);
}

function extractSiteIdentity(url: URL, doc: Document): SiteIdentity {
  const siteCandidates = [
    getMetaContent(doc, 'meta[property="og:site_name"]'),
    getMetaContent(doc, 'meta[name="application-name"]'),
    getMetaContent(doc, 'meta[name="apple-mobile-web-app-title"]'),
    doc.querySelector("header .header-wordmark")?.textContent?.trim() || null,
    doc.querySelector('a[aria-label*="Home"]')?.getAttribute("aria-label")?.replace(/\s*home\s*$/i, "").trim() ||
      null,
    doc.title.split("|").pop()?.trim() || null,
    doc.title.split("-").pop()?.trim() || null,
  ];

  for (const candidate of siteCandidates) {
    if (!candidate) {
      continue;
    }

    const siteId = canonicalSiteId(candidate);
    if (siteId) {
      return {
        siteId,
        siteName: normalizeWhitespace(candidate),
      };
    }
  }

  const hostSiteId = canonicalSiteId(url.hostname);
  if (hostSiteId) {
    return {
      siteId: hostSiteId,
    };
  }

  return {
    siteId: url.hostname.replace(/^www\./i, "").toLowerCase(),
  };
}

function extractTitle(url: URL, doc: Document, siteIdentity: SiteIdentity): { title: string; reason: string } | null {
  const scriptedSeriesName = extractEmbeddedValue(doc, [
    /seriesNameFromAstro":"([^"\\]+)"/i,
    /"series_name":"([^"\\]+)"/i,
    /"seriesTitle":"([^"\\]+)"/i,
  ]);
  if (scriptedSeriesName) {
    const sanitized = sanitizeTitleCandidate(scriptedSeriesName, siteIdentity.siteName);
    if (sanitized) {
      return { title: sanitized, reason: "title detected from embedded page data" };
    }
  }

  const headingSelectors = [
    "main h1",
    "article h1",
    ".series-title",
    ".story-info-right h1",
    ".panel-story-info .story-info-right h1",
    "h1",
  ];
  for (const selector of headingSelectors) {
    const heading = doc.querySelector(selector)?.textContent?.trim();
    if (!heading) {
      continue;
    }

    const sanitized = sanitizeTitleCandidate(heading, siteIdentity.siteName);
    if (sanitized) {
      return { title: sanitized, reason: "title detected from page heading" };
    }
  }

  const ogTitle = getMetaContent(doc, 'meta[property="og:title"]');
  if (ogTitle) {
    const sanitized = sanitizeTitleCandidate(ogTitle, siteIdentity.siteName);
    if (sanitized) {
      return { title: sanitized, reason: "title detected from og:title" };
    }
  }

  const twitterTitle = getMetaContent(doc, 'meta[name="twitter:title"]');
  if (twitterTitle) {
    const sanitized = sanitizeTitleCandidate(twitterTitle, siteIdentity.siteName);
    if (sanitized) {
      return { title: sanitized, reason: "title detected from twitter:title" };
    }
  }

  const fromUrl = inferTitleFromUrl(url);
  if (fromUrl) {
    const sanitized = sanitizeTitleCandidate(fromUrl, siteIdentity.siteName);
    if (sanitized) {
      return { title: sanitized, reason: "title inferred from URL slug" };
    }
  }

  const fromDocTitle = sanitizeTitleCandidate(doc.title || "", siteIdentity.siteName);
  if (fromDocTitle) {
    const hostToken = url.hostname.replace(/^www\./i, "").split(".")[0];
    const candidate = fromDocTitle.replace(new RegExp(`\\b${hostToken}\\b`, "ig"), "").trim();
    const sanitized = sanitizeTitleCandidate(candidate, siteIdentity.siteName);
    if (sanitized) {
      return { title: sanitized, reason: "title detected from document title" };
    }
  }

  return null;
}

function extractSeriesUrl(url: URL): string {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length === 0) {
    return url.href;
  }

  if (parts.length >= 2 && /^(series|manga|novel|book|comic|b)$/i.test(parts[0])) {
    return `${url.origin}/${parts[0]}/${parts[1]}`;
  }

  const chapterIndex = parts.findIndex((segment, index) => {
    if (/^(chapter|chap|ch)$/i.test(segment)) {
      return true;
    }
    if (/^(chapter|chap|ch)[-_/]?\d+(?:[._-]\d+)?$/i.test(segment)) {
      return true;
    }
    if (index > 0 && CHAPTER_TOKEN_REGEX.test(segment) && /chapter|chap|ch/i.test(parts[index - 1])) {
      return true;
    }
    return false;
  });

  if (chapterIndex > 0) {
    return `${url.origin}/${parts.slice(0, chapterIndex).join("/")}`;
  }

  if (parts.length > 1 && CHAPTER_TOKEN_REGEX.test(parts[parts.length - 1])) {
    return `${url.origin}/${parts.slice(0, -1).join("/")}`;
  }

  return `${url.origin}/${parts.join("/")}`;
}

function extractCoverUrl(url: URL, doc: Document): string | undefined {
  const scriptedCover = extractEmbeddedValue(doc, [
    /seriesCoverUrlFromAstro":"([^"\\]+)"/i,
    /"series_cover_url":"([^"\\]+)"/i,
    /"cover_url":"([^"\\]+)"/i,
  ]);

  const candidates = [
    scriptedCover,
    getMetaContent(doc, 'meta[property="og:image"]'),
    getMetaContent(doc, 'meta[property="og:image:url"]'),
    getMetaContent(doc, 'meta[name="og:image"]'),
    getMetaContent(doc, 'meta[name="twitter:image"]'),
    getMetaContent(doc, 'meta[property="twitter:image"]'),
    getMetaContent(doc, 'meta[name="twitter:image:src"]'),
    doc.querySelector('link[rel="image_src"]')?.getAttribute("href")?.trim() || null,
    doc.querySelector('img[itemprop="image"]')?.getAttribute("src")?.trim() || null,
    doc.querySelector('img[class*="cover" i]')?.getAttribute("src")?.trim() || null,
    doc.querySelector('img[class*="poster" i]')?.getAttribute("src")?.trim() || null,
    doc.querySelector('img[class*="thumb" i]')?.getAttribute("src")?.trim() || null,
    doc.querySelector('img[class*="summary" i]')?.getAttribute("src")?.trim() || null,
    doc.querySelector('img[class*="cover" i]')?.getAttribute("data-src")?.trim() || null,
    doc.querySelector('img[class*="cover" i]')?.getAttribute("data-original")?.trim() || null,
    doc.querySelector('img[class*="poster" i]')?.getAttribute("data-src")?.trim() || null,
    doc.querySelector('img[class*="thumb" i]')?.getAttribute("data-src")?.trim() || null,
    doc.querySelector('img[class*="summary" i]')?.getAttribute("data-src")?.trim() || null,
  ];

  for (const rawCover of candidates) {
    if (!rawCover) {
      continue;
    }

    try {
      const resolved = new URL(rawCover, url.href);
      if (
        (resolved.protocol === "http:" || resolved.protocol === "https:") &&
        !GENERIC_COVER_PATH_REGEX.test(resolved.pathname)
      ) {
        return resolved.href;
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

function detectMediaType(url: URL, doc: Document): "manga" | "novel" {
  const bodyText = doc.body?.innerText?.slice(0, 8000) || "";
  const sample = `${url.href} ${doc.title} ${bodyText}`.toLowerCase();

  let novelScore = 0;
  let mangaScore = 0;

  if (/\b(light\s*novel|web\s*novel|\bnovel\b)\b/i.test(sample)) {
    novelScore += 2;
  }
  if (/\b(manga|manhwa|manhua|webtoon|comic)\b/i.test(sample)) {
    mangaScore += 2;
  }
  if (/\bscan(lation|s)?\b/i.test(sample)) {
    mangaScore += 1;
  }
  if (/\bchapter\b/i.test(sample)) {
    novelScore += 1;
  }

  if (typeof doc.querySelectorAll === "function") {
    const imageCount = doc.querySelectorAll("img").length;
    const paragraphNodes = Array.from(doc.querySelectorAll("p"));
    const longParagraphCount = paragraphNodes.filter((node) => {
      const text = node.textContent?.trim() || "";
      return text.length >= 160;
    }).length;

    if (longParagraphCount >= 5 && imageCount <= longParagraphCount + 2) {
      novelScore += 2;
    }
    if (imageCount >= 10 && longParagraphCount <= 3) {
      mangaScore += 2;
    }
  }

  if (novelScore > mangaScore) {
    return "novel";
  }

  return "manga";
}

function clampScore(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export function analyzeCurrentPage(urlString: string, doc: Document): FallbackAnalysis | null {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }

  const chapterResult = extractChapter(url, doc);
  if (!chapterResult) {
    return null;
  }

  const siteIdentity = extractSiteIdentity(url, doc);
  const titleResult = extractTitle(url, doc, siteIdentity);
  if (!titleResult || titleResult.title.length < 2) {
    return null;
  }

  const seriesUrl = extractSeriesUrl(url);
  const coverUrl = extractCoverUrl(url, doc);
  const reasons = [titleResult.reason, chapterResult.reason];

  if (seriesUrl !== url.href) {
    reasons.push("series URL inferred from chapter path");
  }
  if (coverUrl) {
    reasons.push("cover image detected from page metadata");
  }

  let confidence = 40;
  confidence += chapterResult.reason.includes("URL") ? 30 : 20;
  confidence += titleResult.reason.includes("heading") ? 18 : 15;
  confidence += titleResult.reason.includes("embedded page data") ? 5 : 0;
  confidence += seriesUrl !== url.href ? 10 : 0;
  confidence += coverUrl ? 5 : 0;

  return {
    payload: {
      title: titleResult.title,
      mediaType: detectMediaType(url, doc),
      progress: chapterResult.chapter,
      unit: "chapter",
      sourceUrl: url.href,
      siteId: siteIdentity.siteId,
      seriesUrl,
      coverUrl,
    },
    confidence: clampScore(confidence),
    reasons,
  };
}
