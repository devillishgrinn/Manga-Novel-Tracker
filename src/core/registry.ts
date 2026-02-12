import { SiteAdapter } from "./adapter"
import { fenrirealmAdapter } from "../adapters/fenrirealm"  
import { helioScansAdapter } from "../adapters/helioscans";
import { asuraScansAdapter } from "../adapters/asurascans";
import { manganatoAdapter } from "../adapters/manganato";

export const adapters: SiteAdapter[] = [
    fenrirealmAdapter,
    helioScansAdapter,
    asuraScansAdapter,
    manganatoAdapter
]
