import { TrackerPayload } from "./models";

export interface FallbackAnalysis {
  payload: TrackerPayload;
  confidence: number;
  reasons: string[];
  extractionSources?: {
    title: string[];
    cover: string[];
    selectedTitle?: string;
    selectedCover?: string;
  };
}

const CHAPTER_TOKEN_REGEX = /(\d+(?:[._-]\d+)?)/;
const CHAPTER_PATTERNS = [
  /(?:^|[^\w])(chapter|chap|ch)\.?\s*(\d+(?:[._-]\d+)?)(?:[^\w]|$)/i,
  /\/chapter[-_/]?(\d+(?:[._-]\d+)?)(?:\/|$)/i,
];
const TITLE_CHAPTER_SUFFIX_REGEX = /\s*[-|:]\s*(chapter|chap|ch)\.?\s*\d+(?:[._-]\d+)?\b.*$/i;
const TITLE_CHAPTER_PREFIX_REGEX = /^(chapter|chap|ch)\.?\s*\d+(?:[._-]\d+)?\s*[-|:]\s*/i;
const GENERIC_TITLE_REGEX =
  /^(report\s+a\s+bug|unlock\s+chapter|account|profile|home|library|roadmap|explore|sign\s*in|log\s*in|register|search|menu|notices?|chapter\s*\d+(?:[._-]\d+)?|ch\.?\s*\d+(?:[._-]\d+)?)$/i;
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

type PatternSource = {
  label: string;
  pattern: RegExp;
};

function formatSourceValue(value: string): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= 120) {
    return normalized;
  }
  return `${normalized.slice(0, 117)}...`;
}

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

function extractEmbeddedValue(
  doc: Document,
  patterns: PatternSource[],
  trace?: string[],
): { value: string; source: string } | null {
  const html = getDocumentHtml(doc);
  if (!html) {
    return null;
  }

  for (const { label, pattern } of patterns) {
    const match = html.match(pattern);
    const value = match?.[1]?.trim();
    if (trace) {
      trace.push(`${label}: ${value ? formatSourceValue(value) : "no match"}`);
    }
    if (value) {
      return { value, source: label };
    }
  }

  return null;
}

function sanitizeTitleCandidate(raw: string, siteName?: string): string | null {
  if (!raw) {
    return null;
  }

  let title = normalizeWhitespace(normalizeTitle(raw));
  title = title
    .replace(/^read\s+/i, "")
    .replace(/\s*[\-|:]\s*(read|online|for free).*$/i, "")
    .trim();
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

function extractJsonLdValues(doc: Document, key: "name" | "image"): string[] {
  if (typeof doc.querySelectorAll !== "function") {
    return [];
  }

  const blocks = Array.from(
    doc.querySelectorAll('script[type="application/ld+json"]'),
  );
  const results: string[] = [];

  const visit = (value: unknown): void => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      const direct = record[key];
      if (typeof direct === "string") {
        results.push(direct);
      } else if (Array.isArray(direct)) {
        direct.forEach((item) => {
          if (typeof item === "string") {
            results.push(item);
          }
        });
      }
      Object.values(record).forEach(visit);
    }
  };

  blocks.forEach((block) => {
    const text = block.textContent?.trim();
    if (!text) return;
    try {
      visit(JSON.parse(text));
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  });

  return results;
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

function extractTitle(
  url: URL,
  doc: Document,
  siteIdentity: SiteIdentity,
  trace: string[],
): { title: string; reason: string; source: string } | null {
  const scriptedSeriesName = extractEmbeddedValue(
    doc,
    [
      { label: "embedded:seriesNameFromAstro", pattern: /seriesNameFromAstro":"([^"\\]+)"/i },
      { label: "embedded:seriesNameFromAstro(escaped)", pattern: /seriesNameFromAstro\\":\\"([^"\\]+)\\"/i },
      { label: "embedded:series_name(json)", pattern: /"series_name":"([^"\\]+)"/i },
      { label: "embedded:series_name(escaped)", pattern: /series_name\\":\\"([^"\\]+)\\"/i },
      { label: "embedded:seriesTitle(json)", pattern: /"seriesTitle":"([^"\\]+)"/i },
      { label: "embedded:seriesTitle(escaped)", pattern: /seriesTitle\\":\\"([^"\\]+)\\"/i },
      { label: "embedded:series_name(object)", pattern: /series_name\s*:\s*["']([^"']+)["']/i },
    ],
    trace,
  );
  if (scriptedSeriesName) {
    const sanitized = sanitizeTitleCandidate(scriptedSeriesName.value, siteIdentity.siteName);
    trace.push(
      `selected:${scriptedSeriesName.source} => ${sanitized ? formatSourceValue(sanitized) : "rejected as generic"}`,
    );
    if (sanitized) {
      return {
        title: sanitized,
        reason: "title detected from embedded page data",
        source: scriptedSeriesName.source,
      };
    }
  }

  const jsonLdTitles = extractJsonLdValues(doc, "name");
  if (jsonLdTitles.length === 0) {
    trace.push("json-ld:name: no match");
  }
  for (let i = 0; i < jsonLdTitles.length; i += 1) {
    const value = jsonLdTitles[i];
    trace.push(`json-ld:name[${i + 1}]: ${formatSourceValue(value)}`);
    const sanitized = sanitizeTitleCandidate(value, siteIdentity.siteName);
    if (sanitized) {
      trace.push(`selected:json-ld:name[${i + 1}] => ${formatSourceValue(sanitized)}`);
      return {
        title: sanitized,
        reason: "title detected from JSON-LD metadata",
        source: `json-ld:name[${i + 1}]`,
      };
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
    const heading = doc.querySelector(selector)?.textContent?.trim() || "";
    trace.push(`${selector}: ${heading ? formatSourceValue(heading) : "no match"}`);
    if (!heading) {
      continue;
    }

    const sanitized = sanitizeTitleCandidate(heading, siteIdentity.siteName);
    if (sanitized) {
      trace.push(`selected:${selector} => ${formatSourceValue(sanitized)}`);
      return { title: sanitized, reason: "title detected from page heading", source: selector };
    }
  }

  const ogTitle = getMetaContent(doc, 'meta[property="og:title"]');
  trace.push(`meta:og:title: ${ogTitle ? formatSourceValue(ogTitle) : "no match"}`);
  if (ogTitle) {
    const sanitized = sanitizeTitleCandidate(ogTitle, siteIdentity.siteName);
    if (sanitized) {
      trace.push(`selected:meta:og:title => ${formatSourceValue(sanitized)}`);
      return { title: sanitized, reason: "title detected from og:title", source: "meta:og:title" };
    }
  }

  const twitterTitle = getMetaContent(doc, 'meta[name="twitter:title"]');
  trace.push(`meta:twitter:title: ${twitterTitle ? formatSourceValue(twitterTitle) : "no match"}`);
  if (twitterTitle) {
    const sanitized = sanitizeTitleCandidate(twitterTitle, siteIdentity.siteName);
    if (sanitized) {
      trace.push(`selected:meta:twitter:title => ${formatSourceValue(sanitized)}`);
      return {
        title: sanitized,
        reason: "title detected from twitter:title",
        source: "meta:twitter:title",
      };
    }
  }

  const fromUrl = inferTitleFromUrl(url);
  trace.push(`url:slug: ${fromUrl ? formatSourceValue(fromUrl) : "no match"}`);
  if (fromUrl) {
    const sanitized = sanitizeTitleCandidate(fromUrl, siteIdentity.siteName);
    if (sanitized) {
      trace.push(`selected:url:slug => ${formatSourceValue(sanitized)}`);
      return { title: sanitized, reason: "title inferred from URL slug", source: "url:slug" };
    }
  }

  const fromDocTitle = sanitizeTitleCandidate(doc.title || "", siteIdentity.siteName);
  trace.push(`document:title: ${doc.title ? formatSourceValue(doc.title) : "no match"}`);
  if (fromDocTitle) {
    const hostToken = url.hostname.replace(/^www\./i, "").split(".")[0];
    const candidate = fromDocTitle.replace(new RegExp(`\\b${hostToken}\\b`, "ig"), "").trim();
    const sanitized = sanitizeTitleCandidate(candidate, siteIdentity.siteName);
    if (sanitized) {
      trace.push(`selected:document:title => ${formatSourceValue(sanitized)}`);
      return {
        title: sanitized,
        reason: "title detected from document title",
        source: "document:title",
      };
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

function extractCoverUrl(
  url: URL,
  doc: Document,
): { url?: string; source?: string; trace: string[] } {
  const trace: string[] = [];
  const scriptedCover = extractEmbeddedValue(
    doc,
    [
      { label: "embedded:seriesCoverUrlFromAstro", pattern: /seriesCoverUrlFromAstro":"([^"\\]+)"/i },
      {
        label: "embedded:seriesCoverUrlFromAstro(escaped)",
        pattern: /seriesCoverUrlFromAstro\\":\\"([^"\\]+)\\"/i,
      },
      { label: "embedded:series_cover_url(json)", pattern: /"series_cover_url":"([^"\\]+)"/i },
      { label: "embedded:series_cover_url(escaped)", pattern: /series_cover_url\\":\\"([^"\\]+)\\"/i },
      { label: "embedded:cover_url(json)", pattern: /"cover_url":"([^"\\]+)"/i },
      { label: "embedded:cover_url(escaped)", pattern: /cover_url\\":\\"([^"\\]+)\\"/i },
      { label: "embedded:series_cover_url(object)", pattern: /series_cover_url\s*:\s*["']([^"']+)["']/i },
      { label: "embedded:cover_url(object)", pattern: /cover_url\s*:\s*["']([^"']+)["']/i },
    ],
    trace,
  );

  const jsonLdImages = extractJsonLdValues(doc, "image");
  if (jsonLdImages.length === 0) {
    trace.push("json-ld:image: no match");
  }

  const styleCover = doc.querySelector('[style*="background-image" i]')?.getAttribute("style") || "";
  const styleMatch = styleCover.match(/url\(["']?([^"')]+)["']?\)/i);

  const candidateResolvers: Array<{ source: string; value: string | null }> = [
    { source: scriptedCover?.source || "embedded:cover", value: scriptedCover?.value || null },
    ...jsonLdImages.map((value, index) => ({ source: `json-ld:image[${index + 1}]`, value })),
    { source: "meta:og:image", value: getMetaContent(doc, 'meta[property="og:image"]') },
    { source: "meta:og:image:url", value: getMetaContent(doc, 'meta[property="og:image:url"]') },
    { source: "meta:og:image(name)", value: getMetaContent(doc, 'meta[name="og:image"]') },
    { source: "meta:twitter:image", value: getMetaContent(doc, 'meta[name="twitter:image"]') },
    { source: "meta:twitter:image(property)", value: getMetaContent(doc, 'meta[property="twitter:image"]') },
    { source: "meta:twitter:image:src", value: getMetaContent(doc, 'meta[name="twitter:image:src"]') },
    { source: "link:image_src", value: doc.querySelector('link[rel="image_src"]')?.getAttribute("href")?.trim() || null },
    { source: "img:itemprop=image", value: doc.querySelector('img[itemprop="image"]')?.getAttribute("src")?.trim() || null },
    { source: "img:cover[src]", value: doc.querySelector('img[class*="cover" i]')?.getAttribute("src")?.trim() || null },
    { source: "img:poster[src]", value: doc.querySelector('img[class*="poster" i]')?.getAttribute("src")?.trim() || null },
    { source: "img:thumb[src]", value: doc.querySelector('img[class*="thumb" i]')?.getAttribute("src")?.trim() || null },
    { source: "img:summary[src]", value: doc.querySelector('img[class*="summary" i]')?.getAttribute("src")?.trim() || null },
    { source: "img:cover[data-src]", value: doc.querySelector('img[class*="cover" i]')?.getAttribute("data-src")?.trim() || null },
    {
      source: "img:cover[data-original]",
      value: doc.querySelector('img[class*="cover" i]')?.getAttribute("data-original")?.trim() || null,
    },
    { source: "img:poster[data-src]", value: doc.querySelector('img[class*="poster" i]')?.getAttribute("data-src")?.trim() || null },
    { source: "img:thumb[data-src]", value: doc.querySelector('img[class*="thumb" i]')?.getAttribute("data-src")?.trim() || null },
    {
      source: "img:summary[data-src]",
      value: doc.querySelector('img[class*="summary" i]')?.getAttribute("data-src")?.trim() || null,
    },
    { source: "style:background-image", value: styleMatch?.[1] || null },
  ];

  for (const candidate of candidateResolvers) {
    if (!candidate.value) {
      trace.push(`${candidate.source}: no match`);
      continue;
    }

    trace.push(`${candidate.source}: ${formatSourceValue(candidate.value)}`);
    try {
      const resolved = new URL(candidate.value, url.href);
      if (
        (resolved.protocol === "http:" || resolved.protocol === "https:") &&
        !GENERIC_COVER_PATH_REGEX.test(resolved.pathname)
      ) {
        trace.push(`selected:${candidate.source} => ${resolved.href}`);
        return { url: resolved.href, source: candidate.source, trace };
      }
      trace.push(`${candidate.source}: rejected as generic/non-http`);
    } catch {
      trace.push(`${candidate.source}: invalid URL`);
    }
  }

  return { trace };
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
  const titleTrace: string[] = [];
  const titleResult = extractTitle(url, doc, siteIdentity, titleTrace);
  if (!titleResult || titleResult.title.length < 2) {
    return null;
  }

  const seriesUrl = extractSeriesUrl(url);
  const coverResult = extractCoverUrl(url, doc);
  const coverUrl = coverResult.url;
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
    extractionSources: {
      title: titleTrace,
      cover: coverResult.trace,
      selectedTitle: titleResult.source,
      selectedCover: coverResult.source,
    },
  };
}
