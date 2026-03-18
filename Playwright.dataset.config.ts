import { defineConfig } from "@playwright/test";

/**
 * playwright.dataset.config.ts
 *
 * Special config for dataset generation only.
 * Runs with workers=1 to prevent race conditions on healing-data.json
 * featureLogger.ts does read-append-write which is NOT safe for parallel execution.
 */
export default defineConfig({
  testDir: "./tests/dataset-generation",

  // CRITICAL: Must be 1 — featureLogger read/write is not concurrency-safe
  workers: 1,

  // Give slow sites (OrangeHRM, DemoQA tables) enough time
  timeout: 60000,

  // Don't stop on first failure — collect as much data as possible
  forbidOnly: false,

  retries: 0,

  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    headless: true,
    navigationTimeout: 15000,
    actionTimeout: 10000,
  },
});