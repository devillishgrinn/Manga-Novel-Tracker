import { adaptLegacyAdapter, SourceAdapter } from "./adapter"
import { fenrirealmAdapter } from "../adapters/fenrirealm"
import { helioScansAdapter } from "../adapters/helioscans"
import { asuraScansAdapter } from "../adapters/asurascans"
import { manganatoAdapter } from "../adapters/manganato"
import { novelbinAdapter } from "../adapters/novelbin"

// Public series pages used only for health probes; swap if a source retires a slug.
export const adapters: SourceAdapter[] = [
  adaptLegacyAdapter(fenrirealmAdapter, "Fenrir Realm", "https://fenrirealm.com/series/solo-leveling"),
  adaptLegacyAdapter(helioScansAdapter, "HelioScans", "https://helioscans.com/series/264e71b1b29/"),
  adaptLegacyAdapter(
    asuraScansAdapter,
    "Asura Scans",
    "https://asuracomic.net/series/nano-machine-159d6f56",
  ),
  adaptLegacyAdapter(manganatoAdapter, "MangaNato", "https://www.manganato.gg/manga/solo-leveling"),
  adaptLegacyAdapter(novelbinAdapter, "NovelBin", "https://novelbin.com/b/lord-of-the-mysteries"),
]

export function getAdapter(sourceId: string): SourceAdapter | undefined {
  return adapters.find((adapter) => adapter.id === sourceId)
}
