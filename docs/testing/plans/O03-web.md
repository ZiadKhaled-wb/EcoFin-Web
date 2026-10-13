# Test plan O03 (POS devices, client, EC-146)

Decision D69. Contracts **0.38.0** (`vendor/ziadkhaled-wb-contracts-0.38.0.tgz`). Server plan: `EcoFin-API/docs/testing/plans/O03.md`.
Unit tests: `npx vitest run src/pages/settings src/pages/accounting src/lib/api.test.ts src/components/layout`. e2e: `RUN_E2E=1 npx playwright test e2e/pos-device.spec.ts` with the API, local Supabase and the dev server (env as in `e2e/auth.spec.ts` plus `E2E_CASHIER_EMAIL` / `E2E_CASHIER_PASSWORD`).

## Shared test helper changed to pair a device

`src/test/renderApp.tsx`: `pairDevice(over?)` stores a device token for the test shop and makes `devicesApi.current` answer the device; `signOut` forgets the token. `src/pages/accounting/Shifts.test.tsx` calls it before every test, because the open-shift form now needs the paired POS device of this computer. The `Device` fixtures of `DevicesPage.test.tsx` and `EtaSettingsPage.test.tsx` gained `paired`, `paired_at` and `last_seen_at`.

## Tests (22)

| Test ID | What is proven | File | Status |
|---|---|---|---|
| O03-W-001 | the header names the device this computer is paired with | `src/components/layout/AppShell.test.tsx` | passing |
| O03-W-002 | a computer that is no device shows none, and the account menu leads to pairing | `src/components/layout/AppShell.test.tsx` | passing |
| O03-W-003 | is kept in localStorage under ecotech.deviceToken.<organization_id> | `src/lib/api.test.ts` | passing |
| O03-W-004 | sends the active shop's token as x-device-token and never a device id | `src/lib/api.test.ts` | passing |
| O03-W-005 | 403 DEVICE_REVOKED removes the token, says so once and sends the request again without it | `src/lib/api.test.ts` | passing |
| O03-W-006 | a newer pairing made meanwhile is kept, and a second refusal is not retried for ever | `src/lib/api.test.ts` | passing |
| O03-W-007 | O03: the form names the POS device of this computer | `src/pages/accounting/Shifts.test.tsx` | passing |
| O03-W-008 | O03: a computer that is no POS device cannot open a shift and is sent to pair | `src/pages/accounting/Shifts.test.tsx` | passing |
| O03-W-009 | O03: a device of another branch blocks the shift in this one; the server refusals are explained | `src/pages/accounting/Shifts.test.tsx` | passing |
| O03-W-010 | O03: DEVICE_REQUIRED from the server is shown in words | `src/pages/accounting/Shifts.test.tsx` | passing |
| O03-W-011 | shows for each device whether it is on, paired, and when it was last seen | `src/pages/settings/DevicesPage.o03.test.tsx` | passing |
| O03-W-012 | adds a device with a name and a branch, in Arabic | `src/pages/settings/DevicesPage.o03.test.tsx` | passing |
| O03-W-013 | the plan limit is shown as a toast, and a taken name in the dialog | `src/pages/settings/DevicesPage.o03.test.tsx` | passing |
| O03-W-014 | renames and moves a device; an open shift is explained | `src/pages/settings/DevicesPage.o03.test.tsx` | passing |
| O03-W-015 | turning a device off asks for a reason; turning it on is one click | `src/pages/settings/DevicesPage.o03.test.tsx` | passing |
| O03-W-016 | unpairs a device after one confirmation | `src/pages/settings/DevicesPage.o03.test.tsx` | passing |
| O03-W-017 | Pair shows the code large with what to do and a 15-minute countdown | `src/pages/settings/DevicesPage.o03.test.tsx` | passing |
| O03-W-018 | pairing a paired device warns that its computer is unpaired; a refusal is explained | `src/pages/settings/DevicesPage.o03.test.tsx` | passing |
| O03-W-019 | a typed code pairs the computer: the token is stored for the shop and the device is named | `src/pages/settings/PairDevicePage.test.tsx` | passing |
| O03-W-020 | in Arabic the success names the device and its branch | `src/pages/settings/PairDevicePage.test.tsx` | passing |
| O03-W-021 | a code of the wrong shape is refused here; a wrong code and too many tries are explained | `src/pages/settings/PairDevicePage.test.tsx` | passing |
| O03-W-022 | a computer that is already a device says which, and can be paired again | `src/pages/settings/PairDevicePage.test.tsx` | passing |

## e2e (1)

| Test ID | What is proven | File | Status |
|---|---|---|---|
| O03-E-001 | owner creates a device and a code; the cashier pairs on another computer, opens a shift there and sells; the owner turns the device off and the cashier's computer is told it is no longer a POS device | `e2e/pos-device.spec.ts` | passing (local, 13 Oct 2026, 2 workers) |
