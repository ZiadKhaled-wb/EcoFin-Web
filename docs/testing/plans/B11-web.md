# Test plan B11-web (F07 owner audit screen)

Unit tests: `npm test`. e2e: `RUN_E2E=1` with the API (F07 or later), local Supabase and the dev server; env as in `e2e/auth.spec.ts` plus `E2E_CASHIER_EMAIL` / `E2E_CASHIER_PASSWORD`. Server half: EcoFin-API `docs/testing/plans/B11.md`; decisions: EcoFin-API D30 (contracts 0.3.0 actor names, filter by clicking a person).

| Test ID | Done-when item | Type | Preconditions | Steps | Expected result | Automated file:test name | Status |
|---|---|---|---|---|---|---|---|
| B11W-01 | The audit page renders rows from a mocked API in AR and EN | unit | mocked `auditApi`, `meApi` | `npx vitest run src/pages/AuditPage.test.tsx` | heading, translated actions, actor names as buttons, branch names; `dir` rtl/ltr; first request `{ page: 1, pageSize: 25 }` | `AuditPage.test.tsx`: "renders the rows in ar/en…" | passing now |
| B11W-02 | Unknown actions and platform actions | unit | same | same | an unknown action shows its raw key; no employee → "System" | `AuditPage.test.tsx`: "an unknown action shows its raw key…" | passing now |
| B11W-03 | Filters change the request | unit | same | action, record type, branch, from-date, clear | each change sends the filter and goes back to page 1; dates become start/end of day; "Clear filters" sends none | `AuditPage.test.tsx`: "filters change the request…" | passing now |
| B11W-04 | Filter by person (D30) | unit | same | click an actor's name; clear the chip | request has `actorEmployeeId`; the chip shows the name; clearing it removes the filter | `AuditPage.test.tsx`: "clicking a person's name…" | passing now |
| B11W-05 | Pagination works (server) | unit | total 60 | Next | "Page 1 of 3"; Next asks for page 2 | `AuditPage.test.tsx`: "server pagination…" | passing now |
| B11W-06 | The drawer shows before/after | unit | a permission-change row | Details | dialog with the reason; before/after pretty-printed JSON, LTR | `AuditPage.test.tsx`: "the details drawer…" | passing now |
| B11W-07 | Errors | unit | API rejects | open the page | retry state | `AuditPage.test.tsx`: "an error shows the retry state" | passing now |
| B11W-08 | Without `audit.view` the route shows 403 | unit | cashier permissions | open `/audit` (AR and EN) | 403 page; the audit API is never called | `AuditPage.test.tsx`: "without audit.view…" | passing now |
| B11W-09 | Filter helpers | unit | none | `npx vitest run src/features/audit/filters.test.ts` | URL ↔ filters; page reset; day boundaries; display-only name never sent | `filters.test.ts` | passing now |
| B11W-10 | e2e: the owner opens `/audit`, filters by action `auth.login`, sees their login | e2e | `RUN_E2E=1`, owner seed user | open from the menu; pick the action; open details; click the name | request with `action=auth.login`, URL updated, first row "Signed in" by "Owner One"; drawer opens; request with `actorEmployeeId` | `e2e/audit.spec.ts`: "the owner opens it from the menu…" | passing now (local, 4 Oct) |
| B11W-11 | e2e: a cashier | e2e | cashier seed user | look for the menu item; type `/audit` | no menu item; 403 page | `e2e/audit.spec.ts`: "a cashier has no menu item…" | passing now (local, 4 Oct) |
| B11W-12 | Visual: AR/EN at 1280 and 360 px | manual | dev server + API | open `/audit`, open the drawer | layout mirrors; no page overflow (the table scrolls in its own box on phones); drawer stays on screen | Playwright walkthrough (4 Oct) | done |
| B11W-13 | typecheck, lint, format:check, test, build | manual | clean tree | the five commands | all pass (one existing TanStack lint warning) | all | passing now |
