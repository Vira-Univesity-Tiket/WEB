import { defineConfig } from "@playwright/test";
import { randomBytes } from "node:crypto";

process.env.VIRA_BROWSER_FIXTURE_KEY ||= randomBytes(32).toString("hex");
const driverTests = /driver-.*\.spec\.ts$/;

export default defineConfig({
  testDir: "./tests/browser",
  globalTeardown: "./tests/stop-fixture.mjs",
  workers: 1,
  timeout: 45_000,
  // Independent backends keep route catalogs and authentication quotas isolated.
  projects: [
    {
      name: "student",
      testIgnore: driverTests,
      use: { baseURL: "http://127.0.0.1:3017" },
    },
    {
      name: "driver",
      testMatch: driverTests,
      use: { baseURL: "http://127.0.0.1:3018" },
    },
  ],
  use: {
    baseURL: "http://127.0.0.1:3017",
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    },
  },
  webServer: [3017, 3018].flatMap((port) => [
    {
      command: "node tests/start-fixture.mjs",
      url: `http://127.0.0.1:${port + 2000}/healthz`,
      reuseExistingServer: false,
      env: { VIRA_BROWSER_FIXTURE_PORT: String(port + 2000) },
    },
    {
      command: `npm run ${process.env.VIRA_BROWSER_PREVIEW === "true" ? "preview" : "dev"} -- --port ${port} --strictPort`,
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: false,
      env: {
        VITE_DEV_API_TARGET: `http://127.0.0.1:${port + 2000}`,
        VITE_API_BASE_PATH: "/api1",
      },
    },
  ]),
});
