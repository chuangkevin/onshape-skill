import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'on',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx tsx --env-file=.env src/server/index.ts',
    port: 3000,
    reuseExistingServer: true,
    timeout: 60000,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
