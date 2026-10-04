# Contributing (client)

## Requirements

- Node 24 (see `.nvmrc`), npm 11.

## Run the project

```bash
npm ci
cp .env.example .env   # optional in dev; see the file for each variable
npm run dev            # http://localhost:5173, /api is proxied to VITE_DEV_API_TARGET
```

## Scripts

| Script                 | What it does                                  |
| ---------------------- | --------------------------------------------- |
| `npm run dev`          | Vite dev server                               |
| `npm run build`        | Type-check, then production build             |
| `npm run typecheck`    | `tsc -b --noEmit` (strict mode, app and node) |
| `npm run lint`         | ESLint (`no-explicit-any` is an error)        |
| `npm run format`       | Prettier, write                               |
| `npm run format:check` | Prettier, check only                          |
| `npm test`             | Vitest (jsdom, Testing Library)               |
| `npm run test:watch`   | Vitest in watch mode                          |

Browser tests live in `e2e/` (Playwright) and run only with `RUN_E2E=1`
(install a browser once with `npx playwright install chromium`).

## Standards

- TypeScript strict, ESLint and Prettier (`.prettierrc.json`, same as the server). Line endings are LF (`.gitattributes`).
- Write the test first. No `@ts-ignore`, no `any`, no disabled lint rules, no skipped tests to get green.
- No hard-coded UI text. Every screen must work in Arabic (RTL) and English.
- API shapes come from the shared contracts package, never defined locally (`@ziadkhaled-wb/contracts`, source in `EcoFin-API/packages/contracts`, published to GitHub Packages; `.npmrc` reads `NPM_TOKEN`). Installing it needs a classic GitHub token with only `read:packages` in `NPM_TOKEN` (PowerShell: `$env:NPM_TOKEN="ghp_..."; npm ci`). Never commit the token.

## Pull requests

CI runs on every pull request: `typecheck`, `lint`, `format:check`, `test`, `build`.
A failing check blocks the merge. Run the same commands locally before you push.
