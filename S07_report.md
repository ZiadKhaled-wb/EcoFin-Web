# S07: sales history and void

## Result

Added Sales > History with accessible-branch, cashier, date, status and number/serial/phone filters, server paging and computed status badges. Existing sale details retain their fields and show branch, SKU/serial, discount, returns, eligibility hints and the permission-gated void dialog. The dialog validates a reason, creates an idempotency key per opening, disables in flight and refreshes sales queries after success.

## Changed files

- salesHistoryApi service; SalesHistoryPage, SaleHistoryActions and their tests.
- Existing SalePage and additive EN/AR detail test fixtures.
- Navigation, route permission guards and four reviewed role snapshots.
- EN/AR sales translations.
- Contracts 0.35.0 dependency/lockfile and vendor tarball; this report.

## Verification

- Typecheck, lint and format: passed (existing DataTable compiler warning only).
- Full Web suite: 551 passed across 71 files, run sequentially because parallel worker startup on exFAT exceeded the runner timeout.
- Final history/detail regression run: 24 passed, including 4 new history tests.
- Real Chrome EN/LTR and AR/RTL: login, exact serial search, detail, reason dialog, real void and refreshed voided list; Arabic at 390px checked. Screenshots: test-results/s07/detail-en.png, detail-ar.png, history-en.png and history-ar.png (ignored local artifacts).
- API: 684 unit and 290 contracts tests; 379 integration tests; 2,615 SQL checks, all green.

GET /api/sales/:id already existed and was extended additively by the API. No S07 work remains. Reprint and start-return action slots remain empty as instructed. No push; CLAUDE.md unchanged.
