import { adaptLegacyAdapter, SourceAdapter } from "./adapter"
import { fenrirealmAdapter } from "../adapters/fenrirealm"
import { helioScansAdapter } from "../adapters/helioscans"
import { asuraScansAdapter } from "../adapters/asurascans"
import { manganatoAdapter } from "../adapters/manganato"
import { novelbinAdapter } from "../adapters/novelbin"

// Public series pages used only for health probes; swap if a source retires a slug.
export const adapters: SourceAdapter[] = [
  adaptLegacyAdapter(fenrirealmAdapter, "Fenrir Realm", "https://fenrirealm.com/series/absolute-regression/"),
  adaptLegacyAdapter(helioScansAdapter, "HelioScans", "https://helioscans.com/series/sand-mage-of-the-burnt-desert/"),
  adaptLegacyAdapter(asuraScansAdapter, "Asura Scans", "https://asurascans.com/comics/standard-of-reincarnation-00dcbf97/"),
  adaptLegacyAdapter(manganatoAdapter, "MangaNato", "https://www.manganato.gg/manga/solo-leveling/"),
  adaptLegacyAdapter(novelbinAdapter, "NovelBin", "https://novelarrow.com/novel/cultivation-online-novel/"),
]

export function getAdapter(sourceId: string): SourceAdapter | undefined {
  return adapters.find((adapter) => adapter.id === sourceId)
}
