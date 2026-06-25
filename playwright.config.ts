import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 15_000,
  retries: 0,
  workers: 1,
  webServer: {
    command: 'npx serve . -l 4321 --no-clipboard',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:4321',
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  },
  projects: [{ name: 'chromium' }],
});
