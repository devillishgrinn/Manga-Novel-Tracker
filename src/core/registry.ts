import { SiteAdapter } from "./adapter"
import { fenrirealmAdapter } from "../adapters/fenrirealm"  
import { helioScansAdapter } from "../adapters/helioscans";

export const adapters: SiteAdapter[] = [
    fenrirealmAdapter,
    helioScansAdapter
]
