# Manga/Novel Tracker

A private, local-first Manifest V3 Chrome extension that tracks reading progress and new chapters on Fenrir Realm, HelioScans, Asura, MangaNato/Kakalot, and NovelBin.

## What it does

- Saves progress from supported chapter pages after explicit onboarding consent.
- Keeps source identities separate (`sourceId:externalId`); titles never cause automatic merging.
- Lets you explicitly link equivalent source records, choose a preferred source, edit progress, and resume reading.
- Checks tracked public series pages daily or on demand, with an unread badge and optional desktop notifications.
- Exports/imports a local JSON backup. No accounts, cloud sync, analytics, or backend are used.

## Development

```powershell
npm install
npm run typecheck
npm run test:all
npm run build
```

Load this folder as an unpacked extension from `chrome://extensions` with Developer mode enabled. Open **Settings**, consent to local tracking, and enable automatic tracking before visiting a supported chapter page.

## Private release

```powershell
npm run release:package
```

This creates a versioned ZIP and SHA-256 checksum in `release/`. Testers unzip it and load the resulting folder as an unpacked extension. See [manual validation](docs/MANUAL-VALIDATION.md) before distribution and [privacy details](docs/PRIVACY.md).

## Design

- `LibrarySeries` is a local library card.
- `SourceSeries` is a deterministic source identity.
- `SeriesSourceLink` is an explicit user-confirmed relationship between them.
- Source adapters are statically compiled parsing modules; the background service owns network access and refresh policy.
