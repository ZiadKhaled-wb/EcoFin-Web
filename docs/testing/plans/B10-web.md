# Test plan B10-web (F06 roles and permissions, client hooks)

Unit tests: `npm test`. e2e: `RUN_E2E=1` with the API (F06 branch or later), local Supabase and the dev server; env as in `e2e/auth.spec.ts` plus `E2E_CASHIER_EMAIL` / `E2E_CASHIER_PASSWORD`. Server half: EcoFin-API `docs/testing/plans/B10.md`; decisions: EcoFin-API D29.

| Test ID | Done-when item | Type | Preconditions | Steps | Expected result | Automated file:test name | Status |
|---|---|---|---|---|---|---|---|
| B10W-01 | `useCan` with a mocked `usePermissions` | unit | none | `npx vitest run src/features/me/access.test.tsx` | true for a held key, false otherwise; false while loading / on error; true for all 61 contract keys for the owner | `access.test.tsx` › useCan | passing now |
| B10W-02 | `<Can>` | unit | none | same | children with the key; nothing without it (a cashier never sees the button); `fallback` without the key and while loading | `access.test.tsx` › <Can> | passing now |
| B10W-03 | `useBranchAccess` | unit | none | same | assigned branches only; owner (`allBranches`) everywhere; false without data or without a branch id | `access.test.tsx` › useBranchAccess | passing now |
| B10W-04 | e2e: a cashier doesn't see a button wrapped in `<Can permission="employee.manage">` | e2e | `RUN_E2E=1`, cashier seed user | log in, open `/sample` (dev-only reference page) | the "Manage access" button is absent; `/api/me/permissions` answered 200 | `e2e/permissions.spec.ts`: "a cashier does not see a button…" | passing now (local, 4 Oct) |
| B10W-05 | e2e: the owner sees it | e2e | `RUN_E2E=1`, owner seed user | same | the button is visible | `e2e/permissions.spec.ts`: "the owner sees it" | passing now (local, 4 Oct) |
| B10W-06 | Keys typed from the shared contract | unit (types) | none | `npm run typecheck` | `useCan` / `<Can>` accept `PermissionKey` only (an unknown key is a type error) | `src/features/me/useCan.ts`, `Can.tsx` | passing now |
| B10W-07 | Found while testing: a 401 that lands after another call's refresh finished must not refresh again | unit + e2e | none / local stack | `npx vitest run src/lib/api.test.ts`; `e2e/auth.spec.ts -g "401 path"` | one refresh; the late call retries with the current token | `api.test.ts`: "a 401 that lands after the refresh finished…"; `auth.spec.ts`: "401 path…" | passing now |
| B10W-08 | typecheck, lint, format:check, test, build | manual | clean tree | the five commands | all pass. Note: on this machine under load, `SamplePage.test.tsx` / `AppShell.test.tsx` can hit the 5 s test timeout in the parallel run (plain `main` too); they pass alone and in CI | all | passing now (see note) |
