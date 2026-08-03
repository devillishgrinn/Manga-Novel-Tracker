import { build } from "esbuild"
import { rm } from "node:fs/promises"

await rm(new URL("../dist/", import.meta.url), { recursive: true, force: true })

await build({
  entryPoints: [
    "src/background.ts",
    "src/contentScript.ts",
    "src/popup.ts",
    "src/dashboard.ts",
    "src/settings.ts",
  ],
  bundle: true,
  outdir: "dist",
  platform: "browser",
  target: "es2020",
})
