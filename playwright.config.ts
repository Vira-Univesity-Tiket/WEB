import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:3017',
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined }
  },
  webServer: [
    { command: 'node tests/start-fixture.mjs', url: 'http://127.0.0.1:5017/healthz', reuseExistingServer: false },
    { command: `npm run ${process.env.VIRA_BROWSER_PREVIEW === 'true' ? 'preview' : 'dev'} -- --port 3017 --strictPort`, url: 'http://127.0.0.1:3017', reuseExistingServer: false, env: { VITE_DEV_API_TARGET: 'http://127.0.0.1:5017', VITE_API_BASE_PATH: '/api1' } }
  ]
});
