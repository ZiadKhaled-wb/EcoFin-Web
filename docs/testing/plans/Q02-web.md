# Test plan Q02 (monitoring, client)

Server half and decisions: EcoFin-API `docs/testing/plans/Q02.md`, D35, runbook `docs/05-operations/monitoring.md`.

| Test ID | Done-when item | Type | Preconditions | Steps | Expected result | Automated file:test name | Status |
|---|---|---|---|---|---|---|---|
| Q02W-01 | Off without `VITE_SENTRY_DSN` | unit | none | `npx vitest run src/lib/monitoring.test.ts` | nothing loads, starts or sends | `monitoring.test.ts` | passing now |
| Q02W-02 | Privacy and settings | unit | none | same | environment, short release, no user data/cookies/bodies, no BrowserSession; breadcrumb URLs and event URL without query; national ids masked | `monitoring.test.ts` | passing now |
| Q02W-03 | An API 5xx is reported with the API's request id | unit | none | `npx vitest run src/lib/api.test.ts` | `captureApiError` gets status, code, requestId, method, path; `ApiError.requestId` is set; 4xx and network errors are not reported | `api.test.ts` › error tracking (Q02) | passing now |
| Q02W-04 | Render errors reach the tracker | code review | none | `src/components/ui/ErrorBoundary.tsx` | `componentDidCatch` calls `captureRenderError` | n.a. | done |
| Q02W-05 | First screen doesn't grow | manual | none | `npm run build` | main chunk about 203 kB gzipped (was 202); Sentry is a separate chunk loaded only with a DSN | n.a. | checked 5 Oct |
| Q02W-06 | Live on the dev site | manual | `VITE_SENTRY_DSN` in Vercel (runbook) | trigger an API 5xx from the site (runbook section 3) | an issue in Sentry `ecofin-web` tagged with the same requestId as the API's issue | n.a. | manual after the keys are set |
