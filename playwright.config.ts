import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a RUNNING BedBoard (docker compose up), not a dev server.
 *   demo project  : a database loaded with the demo seed         (npm run e2e:demo)
 *   fresh project : a brand-new empty database, first-run wizard (npm run e2e:fresh)
 * They share one database, so tests run one at a time.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3001";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    locale: "en-IN",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // The service worker would also answer requests when a test switches the network off; it is
    // checked on its own (access.spec.ts) and in the manual checklist, so keep these tests deterministic.
    serviceWorkers: "block",
  },
  projects: [
    // A low-end-phone-sized screen with touch, because "two taps on a phone" is the product.
    { name: "demo", testDir: "./tests/e2e/demo", use: { ...devices["Pixel 7"] } },
    { name: "fresh", testDir: "./tests/e2e/fresh", use: { ...devices["Desktop Chrome"] } },
  ],
});
