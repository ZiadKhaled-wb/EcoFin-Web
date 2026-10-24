# Decisions (client repo)

Decisions taken during Sprint 1 that the docs don't already settle. Newest last. The full list with reasons is in `EcoFin-API/DECISIONS.md`. These are the ones that affect this repo.

## Sprint 1 (3 Oct 2026)

### D1. Contracts package lives in a third repo `EcoFin-Contracts/` (decided by the team)
- Package `@ziadkhaled-wb/contracts`, built with `tsc`, version `0.1.0`, used as `"@ziadkhaled-wb/contracts": "file:../EcoFin-Contracts"` **for now**.
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
- `EcoFin-API` is an npm workspace (`packages/*`). `@ziadkhaled-wb/contracts` (same name, version `0.1.0`) lives in `packages/contracts`, and the API uses it through the workspace, so nothing outside the repo is needed to build, test or deploy the API.
- It is published privately to **GitHub Packages** by a CI workflow on tags `contracts-v*` (`publishConfig.registry = https://npm.pkg.github.com`, auth through `NPM_TOKEN`).
- `EcoFin-Web` depends on `"@ziadkhaled-wb/contracts": "0.1.0"` from GitHub Packages (`.npmrc` with `${NPM_TOKEN}`). **Until the first publish**, `integration/sprint-1` only uses a local copy. That is a **blocker before `main`**.
- No file may reference a `../` path outside its repo. No Dockerfile changes.
- GitHub Packages requires the npm scope to equal the owning GitHub user/org: publishing `@ecotech/*` needs a GitHub org `ecotech` (or a scope rename). See the run report.
- The old `EcoFin-Contracts` folder is deleted after the move; its history is kept inside `EcoFin-API`.

### D28. Contracts come from GitHub Packages as `@ziadkhaled-wb/contracts` (user decision, 4 Oct; full text in EcoFin-API `DECISIONS.md`)
- The scope must equal the repo owner (`ZiadKhaled-wb`), so `@ecotech/contracts` was renamed. Version `0.1.0` is published from EcoFin-API (tag `contracts-v0.1.0`).
- This repo installs the fixed version through `.npmrc` (`${NPM_TOKEN}`): a classic token with only `read:packages` in Vercel (`NPM_TOKEN`), in the Actions secrets (`NPM_TOKEN`, used by CI) and in each developer's environment. The vendored tarball is gone.
- New contract version: publish it from EcoFin-API, then bump `@ziadkhaled-wb/contracts` here and run `npm install`.

### T03 ETA receipts page (EC-91)
- The page is Tax -> ETA receipts (`/tax/eta-receipts`, `fiscal.view`); each receipt shows one action (Retry, Retry now, Correct and resend, Check now, Assign a POS) and it is disabled while the server's diagnosis says `ready: false`. The shell bell (`fiscal.view` only, refreshed every 60 s) links to the page filtered to `problem`. Corrections run as a job on the server: after "Correct and resend" the drawer reads the receipt again every 3 s for at most 30 s.

EC-147: POS writes recheck the shift device on every call; only force_close_shift (cash.adjust) skips it. Trusted service-role jobs without auth.uid() are exempt. A NULL current_device_id returns DEVICE_REVOKED; a different valid device returns DEVICE_MISMATCH.

### S08 offline POS (EC-75)
- Decisions D1, D8, D10 and D11 of S08 are in EcoFin-API `DECISIONS.md` (D90). On the Web: every sale goes through the IndexedDB outbox (`src/offline/`); offline, the POS is cash-only on the lease's snapshot, opened with the cashier's PIN, and the app shell is served by the service worker of the production build.

### L01 + N09 legal module pages (EC-108, EC-88)
- The rules and the numbers are in EcoFin-API `DECISIONS.md` (D92, contracts 0.63.0). On the Web: Legal in the menu (`legal.view`, hidden when the plan has no `legal` module, known from the subscription status), the cases list `/legal` (open / closed / all tabs, search, lawyer filter for the owner, a hearing within 7 days highlighted), the case page `/legal/cases/:id` (details, the status moves the server allows, hearings, append-only notes, papers through F14 with purpose `legal_document`, the money since the case was opened; no collect button), "Open legal case" (owner only) on the legal referrals tab and the contract page, and the N09 badge "Legal: {status}" on the contract page, the customer account's contract rows and the overdue list. A referral that became a case shows "case opened" and a link to the case instead of "dismiss".
- **One rule for the lawyer** (`isLegalOnly` in `src/config/navigation.ts`): a user whose keys are all in {legal.view, legal.manage, customer.view_pii, overdue.view} has no dashboard in the menu and lands on `/legal`. `/dashboard` is `HomeGate`, which sends such a user to `homePath`; the login still goes to `/dashboard` (the keys are only known after the permissions load).
- `/contracts/:id` also opens for `legal.view` (a lawyer reads the contract of their case; the server already allowed it). The contract page then shows the sale number without a link (no sales key), no link to the customer (no customers menu) and no printing.
- The claim is checked on the client against what the contract still owes (`compareMoney`), only when it was changed; a typed "10500" is padded before it is compared. The server's answer wins (`LEGAL_CLAIM_TOO_HIGH`).
- Contracts 0.63.0 is the published package (tag `contracts-v0.63.0` on the API merge of PR 113).
