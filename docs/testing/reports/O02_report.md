# O02 task report

Task: O02 — employees (EC-41, EC-143 part 2)
Status: done; verified before committing.
Branch: feat/shop. No push.

## Changes

Settings → Employees is visible only with employee.manage. The page provides staff search, role/status filters and server pagination; role-default permissions grouped by module with unavailable caller keys disabled; create dialog; edit drawer with linked identifiers read-only and the existing F06 branch/permission setters; protected OWNER/self rows; activation reasons; pending invitation resends and linked password resets. The one-time link dialog supports copy and an encoded WhatsApp URL and discards the link on close.

The public /password/set page removes the URL fragment before lookup, shows the staff name/login/shop, validates F04 passwords and confirmation, handles invalid/used/expired/failed resets and redirects to login with username and shop context prefilled. Invite acceptance displays the username rather than a derived auth email. All new strings are bilingual and layouts support RTL. Vendored contracts updated to 0.8.0; tarball integrity matches the lockfile.

## Verification

- Typecheck and lint passed; one existing TanStack DataTable compiler warning remains.
- Full Web suite: 183 passed in 30 files. New staff and reset suites contain 17 cases, including login validation, defaults, disabled permission keys, owner/self actions, pending/linked actions, inline conflicts, the global plan toast, fragment clearing, reset states, prefilled login and link disposal.
- Real Playwright AR/EN: staff create/edit/resend/deactivate/reactivate, copy and WhatsApp encoding, permission grant, invitation acceptance, password reset and username login passed. Arabic mobile staff viewport (390 px) has no document overflow. Screenshots inspected without capturing raw-token dialogs. The browser check led to correcting duplicate pagination and pending status after invite revocation.
- API: 535 unit cases passed; full local suite 663 passed + one existing F14 expected failure (128 integration passes + that expected failure); contracts 126 passed; every SQL file 649 passed including O02 55.
- Security diff review: authenticated shop query keys, server permission/tenant checks, public reset requests skip auth, token fragments cleared before requests, no persistent link state, protected target actions hidden, no new dependencies or baseline migration edits. CLAUDE.md unchanged, including the original preexisting local API edit.

Decision 1: **Case A**. Username-only auth is supported by F04's linked-account email lookup; the API uses a reserved derived email and returns a shareable link. Existing F06 grant and branch functions already blocked escalation; no replacement was needed.

EC-143 part 2: the active route is implemented and integration proves that deactivation refuses the same live token immediately. F06 grant/revoke applies to the same token on the next request.

No O02 work is outstanding. The preexisting F14 direct-RPC linked-entity ownership defect remains under its original expected-failure test. Local task servers and Supabase were stopped. NTFS worktree checks were used, with the original feat/shop branch fast-forwarded to this commit. No push or deployment.

## Changed files in this repo
- package-lock.json
- package.json
- src/App.tsx
- src/components/guards/RequireNavItem.test.tsx
- src/config/navigation.ts
- src/i18n/resources.ts
- src/pages/auth/InviteAcceptPage.test.tsx
- src/pages/auth/InviteAcceptPage.tsx
- vendor/ziadkhaled-wb-contracts-0.7.0.tgz (removed)
- docs/testing/reports/O02_report.md
- src/i18n/locales/ar/employees.json
- src/i18n/locales/en/employees.json
- src/pages/auth/SetPasswordPage.test.tsx
- src/pages/auth/SetPasswordPage.tsx
- src/pages/settings/EmployeesPage.test.tsx
- src/pages/settings/EmployeesPage.tsx
- src/pages/settings/StaffLinkDialog.tsx
- src/services/staffApi.ts
- vendor/ziadkhaled-wb-contracts-0.8.0.tgz
