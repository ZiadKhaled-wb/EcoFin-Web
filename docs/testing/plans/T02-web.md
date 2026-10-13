# Test plan T02 (ETA settings and devices, client, EC-90)

Decision D67. Contracts **0.35.0** (`EtaSettings`, `Device`, `Sale.eta`, `building_number` on a branch). Server plan: `EcoFin-API/docs/testing/plans/T02.md`.
Unit tests: `npx vitest run src/pages/settings`.

## Tests

| Test ID | What is proven | File | Status |
|---|---|---|---|
| T02-W-001 | sends the building number the ETA receipt needs (T02) | `src/pages/settings/BranchesPage.test.tsx` | passing |
| T02-W-002 | lists each device with its branch, ETA serial and status | `src/pages/settings/DevicesPage.test.tsx` | passing |
| T02-W-003 | the pre-shared key is write-only: never shown, sent only when typed | `src/pages/settings/DevicesPage.test.tsx` | passing |
| T02-W-004 | registers a new device and shows a taken serial | `src/pages/settings/DevicesPage.test.tsx` | passing |
| T02-W-005 | the client secret is write-only: never shown, sent only when typed | `src/pages/settings/EtaSettingsPage.test.tsx` | passing |
| T02-W-006 | warns before switching to production | `src/pages/settings/EtaSettingsPage.test.tsx` | passing |
| T02-W-007 | shows the Arabic warning too (RTL) | `src/pages/settings/EtaSettingsPage.test.tsx` | passing |
| T02-W-008 | explains why the environment cannot change while receipts are on their way | `src/pages/settings/EtaSettingsPage.test.tsx` | passing |
| T02-W-009 | refuses to turn ETA on without a client ID before calling the server | `src/pages/settings/EtaSettingsPage.test.tsx` | passing |
| T02-W-010 | tests the connection with the chosen device and shows the ETA reason | `src/pages/settings/EtaSettingsPage.test.tsx` | passing |
| T02-W-011 | the menu items need org.settings_manage and device.manage | `src/pages/settings/EtaSettingsPage.test.tsx` | passing |
| T02-W-012 | a sale carries its ETA receipt for the printout (Sale.eta) | `src/pages/settings/EtaSettingsPage.test.tsx` | passing |

Not automated here: a walk through the two screens in a browser in Arabic and English (the pages use the shared form components and logical spacing only), and printing the QR code, which is S04's.
