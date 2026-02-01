import { SiteAdapter } from "../core/adapter";
import { TrackerPayload } from "../core/models";

export const helioScansAdapter: SiteAdapter = {
    siteId: "helioscans",

    match(url: string): boolean {
    return url.includes("helioscans.com") && (url.includes("/chapter/") || /\/\d+/.test(url));
    },

    extract(): TrackerPayload | null {
    const titleText = document.title;
    const match = titleText.match(/^(.*?)\s+-?\s*Chapter\s+(\d+)/i);
    
    if (!match) return null;
    // ✨ FIX 1: Specific Selector
    let seriesLink = document.querySelector('h1 a[href*="/series/"]') as HTMLAnchorElement; // Target the link inside the <h1> tag.

    let seriesUrl = seriesLink ? seriesLink.href : undefined;

    // ✨ FIX 2: Fallback URL Construction
    // If we can't find the link, HelioScans URLs are usually: /chapter/{series_id}-{chapter_id}/
    // We can extract {series_id} and build: /series/{series_id}/
    if (!seriesUrl) {
        const pathSegments = window.location.pathname.split('/').filter(Boolean);
        const slug = pathSegments[pathSegments.length - 1]; // e.g., "264e71b1b29-639aefdfd30"
        
        // Split by the first hyphen to get the series ID
        const hyphenIndex = slug.indexOf('-');
        if (hyphenIndex > 0) {
            const seriesId = slug.substring(0, hyphenIndex);
            seriesUrl = `${window.location.origin}/series/${seriesId}/`;
        } else {
            // Worst case fallback
            seriesUrl = window.location.href;
        }
    }

    //Get Cover Image
    const coverUrl = document.querySelector('meta[property="og:image"]')?.getAttribute('content');

    return {
        title: match[1].trim(),
        mediaType: "novel",
        progress: Number(match[2]),
        unit: "chapter",
        sourceUrl: window.location.href, 
        siteId: "helioscans",
        seriesUrl,
        coverUrl
        };
    }
};