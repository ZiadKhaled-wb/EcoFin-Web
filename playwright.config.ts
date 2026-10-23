import { defineConfig } from '@playwright/test';

/** S08: the offline project runs against the production build (service worker, CSP). */
const PREVIEW_URL = process.env.E2E_PREVIEW_URL ?? 'http://localhost:4173';
const local = process.env.RUN_E2E === '1' && !process.env.E2E_BASE_URL;

// E2E runs only with RUN_E2E=1 (see e2e/smoke.spec.ts). Browsers are installed manually:
// npx playwright install chromium
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173' },
  // EC-145 signs the seeded cashier out for a moment, so it runs after the other specs, not
  // beside them (they log in as that cashier).
  projects: [
    {
      name: 'main',
      testIgnore: /(employee-active|sale-languages|s08-offline)\.spec\.ts/,
    },
    // INT-4's invalid-next control belongs to the next receipt across all shops.
    // Language sales must wait until that suite has finished using the shared fake ETA.
    { name: 'sale-languages', testMatch: /sale-languages\.spec\.ts/, dependencies: ['main'] },
    {
      name: 'employee-active',
      testMatch: /employee-active\.spec\.ts/,
      dependencies: ['sale-languages'],
    },
    // S08 (§6.4): offline cash sales against `vite build && vite preview`; it sends receipts to
    // the same fake ETA, so it runs after the suites above.
    {
      name: 'offline',
      testMatch: /s08-offline\.spec\.ts/,
      dependencies: ['employee-active'],
      use: { baseURL: PREVIEW_URL },
    },
  ],
  webServer: local
    ? [
        { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true },
        {
          command: 'npx vite build && npx vite preview --port 4173 --strictPort',
          url: PREVIEW_URL,
          reuseExistingServer: true,
          timeout: 300_000,
          // The build talks to the local Supabase only (never the one in .env).
          env: { VITE_SUPABASE_URL: process.env.E2E_SUPABASE_URL ?? 'http://127.0.0.1:54321' },
        },
      ]
    : undefined,
});
