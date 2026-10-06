# P05 task report

Task: P05 (subscription plans and limits)
Status: done
Branch: feat/shop; one commit per task, no push.

## Changes

Date-based expiry with inclusive end day and read-only writes enforced centrally; expired shops retain login, selection, reads and export. Serialized plan-limit triggers count active, unarchived branches, employees (including pending invitations), and devices. Private module helpers and an authenticated API wrapper are ready for future modules; no existing route is module-gated.

Platform plan changes, dates, idempotent decimal subscription payments, usage and subscription detail are exposed through caller-JWT RPCs. Contracts 0.6.0 define states, the 14-day warning and validated structured errors. Web adds bilingual banners, translated global error toasts, shop-list states and the subscription administration panel.

## Checks

- API typecheck and lint: passed.
- Complete API suite with integration enabled: 592 passed, one existing expected failure (593 cases, 51 files). P05 integration: eight passed, including simultaneous last-device-seat requests, expired login/read/write, renewal and payment replay. Contracts: 120 passed.
- Every SQL file after final local database reset: 546 passed, zero failures; P05: 39 passed. Final review also rejected numeric NaN at the RPC boundary.
- Web typecheck and lint: passed; full suite: 158 passed. Final plan-loading UI correction: three focused panel tests passed.
- Playwright: real Arabic RTL and English LTR platform login/detail, date update, expired-owner login, English banner and Arabic mobile banner; no horizontal overflow. Screenshots reviewed.
- Security: platform authorization checked in API and SQL; shop reads scoped to authenticated context; private helpers have no authenticated grants; empty search_path on definer functions; limits and plan changes lock the organization; payment replay creates one row/audit; decimal strings throughout; structured DB details strictly parsed; old migrations unchanged.

## Notes

- No dev-seed plan change was needed.
- A minimal public require_module RPC delegates to the private app helper because PostgREST exposes public, not app. A private subscription_snapshot helper shares state calculations across read RPCs.
- Work verified in NTFS temporary Git worktrees due the original exFAT drive, then fast-forwarded to the original branches. CLAUDE.md was not modified or staged.
- Existing expected F14 linked-entity ownership defect remains recorded by the existing tests; it predates this task. No new failing check or unresolved decision.
- No new dependencies, remote database, deployment, package publication or push. Local Supabase stopped after checks.

Done-when: expiry/read/export, limits and concurrency, module helper, downgrade details, payment idempotency/extension/audit, platform denials, all states and bilingual Web checks passed.

## Changed files in this repo

## Changed files in this repo

- docs/testing/reports/P05_report.md
- package.json
- package-lock.json
- src/App.tsx
- src/components/layout/AppShell.tsx
- src/features/subscription/SubscriptionBanner.test.tsx
- src/features/subscription/SubscriptionBanner.tsx
- src/i18n/locales/ar/subscriptions.json
- src/i18n/locales/en/subscriptions.json
- src/i18n/resources.ts
- src/lib/api.ts
- src/lib/subscriptionErrors.test.ts
- src/lib/subscriptionErrors.ts
- src/pages/admin/AdminShopsPage.tsx
- src/pages/admin/ShopAdmin.test.tsx
- src/pages/admin/SubscriptionPage.test.tsx
- src/pages/admin/SubscriptionPage.tsx
- src/services/subscriptionApi.ts
- vendor/ziadkhaled-wb-contracts-0.5.0.tgz
- vendor/ziadkhaled-wb-contracts-0.6.0.tgz

