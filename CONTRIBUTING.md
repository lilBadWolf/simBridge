# Contributing to simBridge

This guide is for contributors working on the codebase.

## Tech Stack

- Desktop runtime: Electron (Electron Forge)
- Main process: TypeScript
- Preload bridge: TypeScript + Electron IPC
- Renderer: Vite + TypeScript + vanilla CSS
- Local API service: Express 5 (embedded in desktop app)
- Parsing/scraping: axios + cheerio
- Archive handling: adm-zip

## Project Layout

- `src/main/main.ts`: Electron app bootstrap, BrowserWindow setup, IPC handlers
- `src/main/preload.ts`: secure renderer bridge (API base URL + native folder picker)
- `src/renderer/index.html`: renderer entry page
- `src/renderer/main.ts`: frontend logic and API orchestration
- `src/renderer/styles.css`: frontend styling
- `src/renderer/global.d.ts`: window bridge typings for renderer
- `server.js`: Express API routes, scraping/parsing, download/extract pipeline
- `forge.config.js`: packaging targets, metadata, and icon configuration
- `vite.main.config.ts`: Vite config for Electron main bundle
- `vite.preload.config.ts`: Vite config for Electron preload bundle
- `vite.renderer.config.ts`: Vite config for renderer bundle
- `build/`: desktop packaging assets (icons)
- `public/brand/`: brand assets used by UI and docs

## Run Locally

1. Install dependencies:

   ```bash
   npm install
   ```

   Note: `postinstall` runs `patch-package` automatically to apply local fixes from `patches/`.

2. Start desktop app in development mode (Electron Forge + Vite):

   ```bash
   npm start
   ```

3. The app window opens automatically.

4. Run type checks before submitting changes:

   ```bash
   npm run lint
   ```

## Packaging and Distribution

Package the app locally:

```bash
npm run package
```

Build distributables for all configured makers:

```bash
npm run make
```

Build Windows-only artifacts:

```bash
npm run make:win
```

Build Linux x64 artifacts:

```bash
npm run make:linux
```

Build Linux ARM64 artifacts (Raspberry Pi class devices with 64-bit OS):

```bash
npm run make:linux:arm64
```

Windows installer output is generated at `out/make/nsis/x64/`.

## API Surface

Current routes in `server.js`:

- `GET /api/simfiles?category=<latest-user|latest-official|top-official|top-user>&songLibraryPath=<path>`
- `GET /api/latest-user`
- `GET /api/stepmania-packs?songLibraryPath=<path>`
- `POST /api/stepmania-packs/search` with JSON body `{ songtitle?, songartist?, songLibraryPath? }`
- `POST /api/search` with JSON body `{ songtitle?, songartist?, songLibraryPath? }`
- `GET /api/simfile/:simfileId`
- `GET /api/stepmania-pack/:packId`
- `POST /api/download-simfile` with JSON body `{ simfileId, songLibraryPath }`
- `POST /api/download-pack` with JSON body `{ packId, songLibraryPath }`
- `GET /health`

## Runtime Architecture Notes

- The API server is started by the Electron main process on an ephemeral localhost port.
- The renderer resolves the API base URL through the preload IPC bridge.
- External links are opened via the OS browser from Electron.
- Song library selection is done through a native folder picker exposed in preload.
- A GitHub Releases update check runs in Electron main for packaged builds and prompts users to download newer installers.

## Local Dependency Patches

- This repo uses `patch-package` to persist a compatibility fix for Electron Forge + Vite.
- Current patch file: `patches/@electron-forge+plugin-vite+7.11.2.patch`.
- If you upgrade `@electron-forge/plugin-vite`, re-check packaging output and regenerate/remove the patch as needed.

## Data Source Notes

- Source HTML selectors are brittle by nature. If a site layout changes, parsing may fail.
- Keep parser functions narrow and isolated. Avoid mixing parsing logic into route handlers.
- Preserve explicit user-agent headers where already used unless a source requirement changes.

## Debugging Source Fetch Failures

When users report "nothing loads", isolate API behavior first:

1. Start the app with `npm start` and watch terminal output for `simBridge API running at http://127.0.0.1:<port>`.
2. Confirm API health with a quick local probe (using the logged port):

   ```bash
   # PowerShell example
   Invoke-RestMethod -Uri "http://127.0.0.1:<port>/health"
   ```

3. Test core fetch endpoints directly (`/api/simfiles`, `/api/search`, `/api/stepmania-packs`) to determine whether failures are in scraping or renderer wiring.
4. If endpoints succeed directly but UI fails, inspect preload bridge and renderer API URL resolution.

## Code Style Expectations

- Match existing formatting and naming style in touched files.
- Keep functions small and focused.
- Add comments only when logic is not obvious.
- Avoid introducing new dependencies unless there is clear value.
- Prefer TypeScript in Electron and renderer code paths.

## Pull Request Checklist

- Change is scoped to a clear goal.
- UI updates are responsive and keep existing visual language.
- API behavior is backward compatible unless intentionally changed.
- Error messages are user-readable and actionable.
- Updated docs when behavior, setup, or routes change.

## Known Behaviors To Be Aware Of

- Simfile downloads currently extract into a `Shit` subfolder under the configured Songs path. If you change this, coordinate UI copy and migration impact.
- Song installation status is inferred by filesystem scanning and normalized name matching.
- No automated test suite is currently configured; validate manually before opening a PR.
- Windows packaging is the current primary distribution path.

## Reporting Issues

When opening an issue, include:

- OS and Node version
- Repro steps
- Expected vs actual behavior
- Console/server logs
- If relevant, the source URL that broke parsing
