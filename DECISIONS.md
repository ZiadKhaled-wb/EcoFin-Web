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
