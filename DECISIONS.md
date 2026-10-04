# Decisions (client repo)

Decisions taken during Sprint 1 that the docs don't already settle. Newest last. The full list with reasons is in `EcoFin-API/DECISIONS.md`. These are the ones that affect this repo.

## Sprint 1 (3 Oct 2026)

### D1. Contracts package lives in a third repo `EcoFin-Contracts/` (decided by the team)
- Package `@ecotech/contracts`, built with `tsc`, version `0.1.0`, used as `"@ecotech/contracts": "file:../EcoFin-Contracts"` **for now**.
- **Before merging Sprint 1 to `main`:** create the GitHub repo `EcoFin-Contracts`, push it, tag `v0.1.0`, and switch this repo to `"github:<owner>/EcoFin-Contracts#v0.1.0"`. Until then GitHub CI can't install this repo.

### D4. Worktrees are created by the master with `git worktree add`, as siblings of the repos (`EcoFine/wt-<agent>`), so `file:../EcoFin-Contracts` resolves the same way everywhere.

### D5. Sprint 1 contracts (0.1.0) cover every Sprint 1 endpoint up front. Client builders don't change the contracts package.

### D7. Shared-file ownership per wave (client repo)
| Wave | `package.json` + lockfile | `.github/workflows/*` | `src/App.tsx` / router / `src/config/navigation.ts` | `.env.example` |
|---|---|---|---|---|
| 0 | B2 | B2 | B2 | B2 |
| 2 | B7 | B7 | B7 | B7 |
| 3 | B9 | B9 | B9 | B9 |
| 4 | B11 | B11 | B11 | B11 |
The master adds the contracts dependency when F03 merges.

### D11. Playwright MCP isn't available this sprint
Client tasks write Playwright tests that are skipped unless `RUN_E2E=1`. Nobody walked the flows live in a browser. That's listed as manual work in the test plan.

### D18. Client permission code is split between F09 and F06
F09 builds `usePermissions()` + `<RequirePermission>`; F06 adds `useCan`, `<Can>`, `useBranchAccess` on top.

### D26. No third repo: contracts live in `EcoFin-API/packages/contracts` (supersedes D1 and §4; user decision, 4 Oct)
- `EcoFin-API` is an npm workspace (`packages/*`). `@ecotech/contracts` (same name, version `0.1.0`) lives in `packages/contracts`, and the API uses it through the workspace, so nothing outside the repo is needed to build, test or deploy the API.
- It is published privately to **GitHub Packages** by a CI workflow on tags `contracts-v*` (`publishConfig.registry = https://npm.pkg.github.com`, auth through `NPM_TOKEN`).
- `EcoFin-Web` depends on `"@ecotech/contracts": "0.1.0"` from GitHub Packages (`.npmrc` with `${NPM_TOKEN}`). **Until the first publish**, `integration/sprint-1` only uses a local copy. That is a **blocker before `main`**.
- No file may reference a `../` path outside its repo. No Dockerfile changes.
- GitHub Packages requires the npm scope to equal the owning GitHub user/org: publishing `@ecotech/*` needs a GitHub org `ecotech` (or a scope rename). See the run report.
- The old `EcoFin-Contracts` folder is deleted after the move; its history is kept inside `EcoFin-API`.
