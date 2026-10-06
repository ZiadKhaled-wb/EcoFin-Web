# CI formatting fix

Date: 2026-10-06
Status: done

## Changes

Formatted src/pages/admin/SubscriptionPage.test.tsx with the repository Prettier rules. Only the type import and variable declaration spacing changed. No runtime behavior, test assertions or workflow settings changed. CLAUDE.md remains untouched.

## Checks

- Full npm run format:check: passed.
- Typecheck: passed.
- Lint: passed with the existing DataTable compiler warning.
- Unit tests: all 188 passed with test files executed sequentially. The initial concurrent run timed out in two unchanged SamplePage tests; no assertions or timeout settings were modified.
- Diff and security review: formatting only. Browser check: not applicable.

Committed locally; no push.
