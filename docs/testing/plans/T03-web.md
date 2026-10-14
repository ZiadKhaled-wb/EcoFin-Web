# T03 web test plan: ETA receipts page

**Slice:** T03 · ETA monitor and corrections (EC-91). Server plan: `EcoFin-API/docs/testing/plans/T03.md`.

```text
npx vitest run src/pages/tax
```

| Test ID | What is proven | File |
| --- | --- | --- |
| T03-W-001 | the cards filter the list (situation and accepted today) | `src/pages/tax/EtaReceipts.test.tsx` |
| T03-W-002 | situation badges, the sale link, an overdue deadline in red, a receipt without a POS | same |
| T03-W-003 | the drawer lists each problem with the right fix link (product, branch, customer, support); only the situation's action shows, disabled with a hint while not ready | same |
| T03-W-004 | "Correct and resend" shows queued, then the drawer refreshes until the situation changes | same |
| T03-W-005 | bulk retry shows how many were queued and why the others were skipped | same |
| T03-W-006 | Arabic: RTL and translated badge | same |
| T03-W-007 | the shell badge shows with `fiscal.view` and a count above zero and links to the problems | same |
| T03-W-008 | no badge (and no request) without `fiscal.view`, nor when nothing needs attention | same |

Both languages have every key (`SameShape` in `src/i18n/resources.ts` fails the type check otherwise).
