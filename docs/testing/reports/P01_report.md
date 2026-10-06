# P01 task report

Task: P01 (shop provisioning, EC-34)
Status: done
Branch: feat/shop; no push.

## Changes

Super-admin session flag and guards, separate admin layout, shop listing/search/filter/paging, create form, suspend/reactivate/resend, public invitation acceptance and translated states, prefilled login success message, shared contracts 0.5.0 local tarball.

## Checks

- Typecheck: passed.
- Lint: passed; existing TanStack DataTable compiler warning only.
- Full Web tests: 147 passed (two workers); new/affected focused suites: 40 passed. Initial existing sample-page timeout resolved by reducing workers without changing assertions/timeouts.
- Playwright: platform login bypassed shop picker; real create/email/accept flow; AR RTL and EN LTR admin and invite views; fragment cleared; login email prefilled. No horizontal overflow observed.
- Security review: guard restricts admin area; API remains authority; invitation token held only in component memory; shared schemas used; no hard-coded UI strings or extra dependencies.

## Notes

Local shared contracts artifact in vendor makes fresh npm ci possible without publishing. Checks ran in a temporary NTFS worktree because the original exFAT volume cannot support npm workspace symlinks. Original feat/shop is fast-forwarded to this commit.

All P01 Web requirements complete. No deployment or push.

## Changed files

See the commit diff; the file inventory is appended below.

- docs/testing/reports/P01_report.md
- package.json
- package-lock.json
- src/App.tsx
- src/components/guards/GuestOnly.tsx
- src/components/guards/RequireShop.tsx
- src/components/guards/RequireSuperAdmin.test.tsx
- src/components/guards/RequireSuperAdmin.tsx
- src/components/layout/AdminLayout.tsx
- src/i18n/locales/ar/shops.json
- src/i18n/locales/en/shops.json
- src/i18n/resources.ts
- src/pages/admin/AdminShopsPage.tsx
- src/pages/admin/CreateShopPage.tsx
- src/pages/admin/ShopAdmin.test.tsx
- src/pages/admin/shopErrors.ts
- src/pages/auth/authErrors.ts
- src/pages/auth/InviteAcceptPage.test.tsx
- src/pages/auth/InviteAcceptPage.tsx
- src/pages/auth/LoginPage.tsx
- src/pages/auth/ShopPickerPage.tsx
- src/services/shopApi.ts
- src/store/authStore.ts
- vendor/ziadkhaled-wb-contracts-0.5.0.tgz
