import { adaptLegacyAdapter, SourceAdapter } from "./adapter"
import { fenrirealmAdapter } from "../adapters/fenrirealm"  
import { helioScansAdapter } from "../adapters/helioscans";
import { asuraScansAdapter } from "../adapters/asurascans";
import { manganatoAdapter } from "../adapters/manganato";
import { novelbinAdapter } from "../adapters/novelbin";

export const adapters: SourceAdapter[] = [
    adaptLegacyAdapter(fenrirealmAdapter, "Fenrir Realm"),
    adaptLegacyAdapter(helioScansAdapter, "HelioScans"),
    adaptLegacyAdapter(asuraScansAdapter, "Asura Scans"),
    adaptLegacyAdapter(manganatoAdapter, "MangaNato"),
    adaptLegacyAdapter(novelbinAdapter, "NovelBin"),
]

export function getAdapter(sourceId: string): SourceAdapter | undefined {
    return adapters.find((adapter) => adapter.id === sourceId)
}
