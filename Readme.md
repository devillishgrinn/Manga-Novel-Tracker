# Manga/Novel Tracker (Chrome Extension)

A Manifest V3 Chrome extension that automatically tracks your reading progress on supported manga/novel sites and keeps everything in one popup list.

## Features

- Auto-detects current chapter from supported sites.
- Saves progress in `chrome.storage.local`.
- Groups entries by site in the popup.
- Quick actions in popup:
  - Open series page
  - Open chapter page
  - Increment/decrement chapter
  - Delete entry
- Merges entries across sites when title and media type match.
- Attempts cover image fallback from series page when missing.

## Supported Sites

- Fenrir Realm (`fenrirealm.com`)
- HelioScans (`helioscans.com`)
- Asura Scans / Asura Comic
  - `asuracomic.net`
  - `asurascans.com`
  - `beta.asurascans.com`
- MangaNato / MangaKakalot
  - `manganato.gg`
  - `mangakakalot.gg`

## Tech Stack

- TypeScript
- Chrome Extensions API (Manifest V3)
- esbuild (bundling)
- Vitest + jsdom (unit/integration tests)

## Project Structure

```text
src/
  adapters/        Site-specific extraction logic
  core/            Router, models, storage, registry
  background.ts    Receives tracking events and persists entries
  contentScript.ts Detects supported pages and sends payloads
  popup.ts         Popup UI logic
tests/
  unit/            Unit tests
  integration/     End-to-end extension flow tests
manifest.json      Extension configuration
popup.html         Popup layout and styles
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Build extension

```bash
npm run build
```

### 3. Load in Chrome

1. Open `chrome://extensions/`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this project folder

## Development

Use watch mode for automatic rebuilds:

```bash
npm run watch
```

After rebuilds, reload the extension in `chrome://extensions/`.

## Available Scripts

- `npm run build` - Bundle extension files into `dist/`
- `npm run watch` - Build in watch mode
- `npm test` - Run unit tests
- `npm run test:integration` - Run integration tests
- `npm run test:all` - Run all tests

## How It Works

1. `contentScript.ts` runs on supported chapter URLs.
2. It uses `routePage()` to select the correct adapter.
3. Adapter extracts a normalized tracking payload.
4. Payload is sent to `background.ts` as `TRACK_PROGRESS`.
5. Background merges/upserts data into `chrome.storage.local`.
6. `popup.ts` reads entries and renders your reading list.

Storage key: `trackerEntries`

## Permissions

- `storage` for local persistence
- Host permissions for supported domains in `manifest.json`

## Run in Docker (Optional)

```bash
docker build -t manga-novel-tracker .
docker run --rm -it manga-novel-tracker
```

## Known Limitations

- Site layout/title changes can break adapter extraction.
- Cross-site merge is title-based; inconsistent titles can create duplicates.
- Progress increases only when the new value is higher than stored progress (except manual +/- in popup).

## Disclaimer

This project is for educational/personal use and is not affiliated with any supported website.
