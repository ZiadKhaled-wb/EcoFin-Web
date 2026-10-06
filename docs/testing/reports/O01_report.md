# O01 task report

Task: O01 (branches, EC-40)
Status: verified; committed after all gates passed.
Branch: feat/shop; task commits in both repos; no push.

## Changes

New migration adds validated same-branch default safes, automatic safe assignment/backfill, branch CRUD RPCs, deactivation counts and confirmation, inactive-branch write rejection, creator branch access and audit actions. Code is normalized and immutable. Existing P05 triggers enforce creation and reactivation limits atomically.

Eight caller-context branch endpoints provide active accessible branches and administration reads/writes. Contracts 0.7.0 include request/response schemas, decimal count details and eight mapped errors (including the SQL name validation code). The existing F09 branch switcher now reads GET /api/branches, hides for a single branch, retains per-shop selection, exposes currentBranchId and refreshes after mutations. A bilingual permission-gated Settings → Branches page provides creation, editing, default-safe selection and warning confirmation.

## Checks

- API and Web typecheck/lint: passed (existing Web TanStack compiler warning only).
- O01 focused API service: nine passed; contracts: three passed; integration: six passed. F07 audit drivers and F05 route coverage passed.
- Every SQL file after a fresh database reset: 582 passed, zero failures; O01: 28 passed.
- Web full suite: 166 passed. Forms and switcher focused suite: 13 passed.
- Playwright: real AR/EN owner login, branch create with uppercase code, edit with immutable code, safe display, branch selection, clean deactivation/reactivation, shift-warning confirmation and Arabic mobile view. Screenshots inspected; no page errors or document overflow. Browser verification caught and corrected the new service's missing /api prefix.
- Security diff review: caller-JWT clients only; authenticated tenant context for all queries; same-shop checks precede writes; branch scope retained including reactivation; definer functions have empty search_path and explicit grants; no anon RPC access; warning details strictly parsed; balances only read and fixtures use ledger inserts; original migrations and CLAUDE.md unchanged.

## Implementation notes

- Reactivation and already-in-state requests check app.has_branch_access on the inactive target. Ordinary branch-scoped writes use app.require_branch_access and reject inactive branches. This permits the required reactivation without granting an inactive branch ordinary writes.
- Full parallel API verification exposed the existing F13 daily-job test's changing-fixture race: other suites created shops between its fixed-count assertions. The full suite was rerun sequentially without changing any assertion.
- The existing expected F14 direct-RPC linked-entity ownership defect remains recorded by its existing expected-failure test; no new unresolved failure.
- No seed-plan change or new dependency. Stock/report screens remain unbuilt, as the task specifies; their branch source endpoint is implemented and tested.
- NTFS worktrees used for installation/checks; original feat/shop branches fast-forwarded to the task commits. No remote database, publish, deployment or push. Local stack stopped after verification.

Done-when: branch source endpoint and switcher; default-safe validation; limits; permission and tenant denials; warnings and explicit confirmation; inactive write guard; creator access; audit and bilingual UI passed.

## Final API gate

Full sequential API suite with integration enabled: 619 passed, one existing expected failure (620 cases, 53 files). Full contracts suite: 123 passed.

## Changed files in this repo

- docs/testing/reports/O01_report.md
- package.json
- package-lock.json
- src/App.tsx
- src/components/layout/AppShell.test.tsx
- src/components/layout/BranchSwitcher.tsx
- src/config/navigation.ts
- src/features/me/useBranches.ts
- src/features/me/useSelectedBranch.ts
- src/i18n/locales/ar/branches.json
- src/i18n/locales/en/branches.json
- src/i18n/resources.ts
- src/pages/settings/BranchesPage.test.tsx
- src/pages/settings/BranchesPage.tsx
- src/services/branchApi.ts
- vendor/ziadkhaled-wb-contracts-0.6.0.tgz
- vendor/ziadkhaled-wb-contracts-0.7.0.tgz
