import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3199' },
  webServer: {
    command: 'pnpm --filter @hexania/web build && pnpm --filter @hexania/server start',
    url: 'http://localhost:3199/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PORT: '3199', DATA_DIR: '.e2e-data' },
  },
});
