import { routePage } from "./core/router";
import { analyzeCurrentPage } from "./core/fallbackAnalyzer";
import { AnalyzeCurrentPageResponse, PageAnalysis } from "./core/messages";

const SITE_RULES_KEY = "siteAutoTrackRules";
const LEGACY_DOMAIN_RULES_KEY = "domainAutoTrackRules";
const DEFAULT_MIN_CONFIDENCE = 80;

type DomainAutoTrackRule = {
  autoTrack: boolean;
  minConfidence: number;
};

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

function normalizeRuleKey(key: string): string {
  return normalizeHostname(key);
}

async function loadDomainRule(keys: string[]): Promise<DomainAutoTrackRule | null> {
  if (!chrome.storage?.local?.get) {
    return null;
  }

  const result = await chrome.storage.local.get([SITE_RULES_KEY, LEGACY_DOMAIN_RULES_KEY]);
  const rules =
    (result[SITE_RULES_KEY] as Record<string, DomainAutoTrackRule> | undefined) ||
    (result[LEGACY_DOMAIN_RULES_KEY] as Record<string, DomainAutoTrackRule> | undefined);

  if (!rules) {
    return null;
  }

  for (const key of keys) {
    const normalized = normalizeRuleKey(key);
    if (rules[normalized]) {
      return rules[normalized];
    }
  }

  return null;
}

function buildFallbackAnalysis(): PageAnalysis | null {
  const analysis = analyzeCurrentPage(window.location.href, document);
  if (!analysis) {
    return null;
  }

  return {
    ...analysis,
    detectedBy: "fallback",
  };
}

async function maybeAutoTrackWithFallback(): Promise<void> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(window.location.href);
  } catch {
    return;
  }

  const analysis = buildFallbackAnalysis();
  if (!analysis) {
    return;
  }

  const rule = await loadDomainRule([analysis.payload.siteId, parsedUrl.hostname]);
  if (!rule || !rule.autoTrack) {
    return;
  }

  const minConfidence = Number.isFinite(rule.minConfidence)
    ? rule.minConfidence
    : DEFAULT_MIN_CONFIDENCE;

  if (analysis.confidence < minConfidence) {
    return;
  }

  chrome.runtime.sendMessage({
    type: "TRACK_PROGRESS",
    payload: analysis.payload,
  });
}

// 1. Check if the current URL matches any known adapter
const payload = routePage(window.location.href);
if (!payload) {
  void maybeAutoTrackWithFallback();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "ANALYZE_CURRENT_PAGE") {
    return;
  }

  const adapterPayload = routePage(window.location.href);
  let response: AnalyzeCurrentPageResponse;

  try {
    const hostname = normalizeHostname(window.location.hostname || new URL(window.location.href).hostname);

    if (adapterPayload) {
      response = {
        detected: true,
        hostname,
        siteKey: adapterPayload.siteId,
        analysis: {
          payload: adapterPayload,
          confidence: 100,
          reasons: ["known site adapter matched this page"],
          detectedBy: "adapter",
          extractionSources: {
            title: [`adapter:${adapterPayload.siteId}:payload.title`],
            cover: adapterPayload.coverUrl
              ? [`adapter:${adapterPayload.siteId}:payload.coverUrl`]
              : [`adapter:${adapterPayload.siteId}:no cover provided`],
            selectedTitle: `adapter:${adapterPayload.siteId}:payload.title`,
            selectedCover: adapterPayload.coverUrl
              ? `adapter:${adapterPayload.siteId}:payload.coverUrl`
              : undefined,
          },
        },
      };
    } else {
      const fallback = buildFallbackAnalysis();
      response = {
        detected: Boolean(fallback),
        hostname,
        siteKey: fallback?.payload.siteId,
        analysis: fallback || undefined,
      };
    }
  } catch {
    response = { detected: false };
  }

  sendResponse(response);
});

// 2. If matched, send the data
if (payload) {
  console.log("📦 Tracking detected:", payload);
  chrome.runtime.sendMessage({
    type: "TRACK_PROGRESS",
    payload
  });
}
