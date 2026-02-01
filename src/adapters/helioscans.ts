import { SiteAdapter } from "../core/adapter";
import { TrackerPayload } from "../core/models";

export const helioScansAdapter: SiteAdapter = {
    siteId: "helioscans",

    match(url: string): boolean {
    return url.includes("helioscans.com") && url.includes("/chapter/");
    },

    extract(): TrackerPayload | null {
    // 1. Wait/Check for title (if needed, or just grab from document immediately if available)
    // Note: Adapters run synchronously in the router. 
    // If HelioScans loads dynamically, you might need the MutationObserver approach or keep the specific logic.
    
    const titleText = document.title;
    const match = titleText.match(/^(.*?)\s+-?\s*Chapter\s+(\d+)/i);
    
    if (!match) return null;

    return {
        title: match[1].trim(),
        mediaType: "novel",
        progress: Number(match[2]),
        unit: "chapter",
    
      // ✅ FIX: Add this line. The router/storage needs it to update the map.
        sourceUrl: window.location.href, 
    
        siteId: "helioscans"
        };
    }
};