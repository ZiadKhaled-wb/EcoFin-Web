import { defineConfig } from '@playwright/test';

// E2E runs only with RUN_E2E=1 (see e2e/smoke.spec.ts). Browsers are installed manually:
// npx playwright install chromium
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173' },
  webServer:
    process.env.RUN_E2E === '1' && !process.env.E2E_BASE_URL
      ? { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true }
      : undefined,
});
