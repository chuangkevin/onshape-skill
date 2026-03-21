import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3939',
    screenshot: 'on',
    trace: 'on-first-retry',
  },
  webServer: {
    command: process.platform === 'win32'
      ? 'set PORT=3939&& npx tsx --env-file=.env src/server/index.ts'
      : 'PORT=3939 npx tsx --env-file=.env src/server/index.ts',
    port: 3939,
    reuseExistingServer: true,
    timeout: 60000,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
