# Manga/Novel Tracker — Project Memory

## Product

Private, sideloaded Manifest V3 Chrome extension for tracking manga and novel reading progress. It is local-first: no account, cloud sync, analytics, backend, generic unsupported-site scraping, offline reader, or automated external submissions.

## Supported sources

- Fenrir Realm
- HelioScans
- Asura Scans / Asura Comic
- MangaNato / MangaKakalot
- NovelBin

## Approved architecture

- Source records use deterministic `sourceId:externalId` identities. Prefer an immutable source-native ID; otherwise use the adapter's canonical normalized series URL/slug.
- Local `LibrarySeries` records are UUID-backed library cards. `SeriesSourceLink` records explicitly connect library cards to source records. Never automatically merge records by title.
- Source adapters are statically compiled modules registered in one registry. They parse and normalize source content; background services own fetching, refresh scheduling, rate limits, timeouts, and permissions.
- IndexedDB stores library series, source series, links, refresh state, and migration metadata. `chrome.storage.local` stores only small settings and migration flags.
- The first successful source refresh establishes a baseline. Daily automatic and manual refreshes detect new chapters; notifications are opt-in and deduplicated.
- Content scripts are restricted to supported source chapter pages. Generic detector and broad HTTP(S) injection are removed.

## Existing baseline before production rewrite

- Version `0.1.0`; TypeScript, esbuild, Vitest, jsdom.
- Existing source adapters track chapter progress and a popup renders the local list.
- Original persistence is a single `chrome.storage.local` `trackerEntries` array and title-based cross-source merging.
- Existing tests: 49 unit and 3 integration tests passed; build passed on 2026-07-30.
- No CI workflow, persistent memory, release automation, dashboard, update polling, or data migration existed.

## Current implementation status

- Version `0.2.0` introduces IndexedDB-backed `LibrarySeries`, `SourceSeries`, `SeriesSourceLink`, and release-check persistence through `src/core/libraryDb.ts`.
- Legacy `trackerEntries` migrate once into separate source-backed records and are removed only after migration verification.
- Content scripts wait for user onboarding consent and auto-tracking settings; the manifest no longer injects into every HTTP(S) page.
- The background worker schedules daily public, unauthenticated refreshes, rate-limits requests, records baselines/new releases, updates the action badge, and uses optional notification permission.
- Popup is a compact status/resume surface; `dashboard.html` provides library management, explicit linking, progress/preferred-source controls, refresh, JSON backup import/export, and a **Source Health** tab; `settings.html` provides consent and refresh controls.
- CI runs type-checking, linting, formatting, tests, build, and Windows release packaging. `npm run release:package` creates a ZIP and SHA-256 file in ignored `release/`.
- Automated checks on 2026-08-02: type-check, lint, Prettier, build, 25 unit tests, 1 integration test, and production dependency audit all pass.

## Implementation decisions

- Continue reading on source sites; no embedded/offline reader.
- Retain cover URLs but use a bundled fallback when a remote image fails. Do not change request headers to bypass image restrictions.
- Sideloaded release packages are reproducible ZIP artifacts with checksums and manual unpacked installation instructions.

## Changelog

- 2026-07-30: Created project memory and recorded the approved production architecture.
- 2026-08-03: Added Source Health tab to the library dashboard with per-adapter probe URLs, dedicated `CHECK_SOURCE_HEALTH` background check, and IndexedDB `sourceHealth` persistence.
