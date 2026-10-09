import { defineConfig } from "@playwright/test";

/**
 * Recorrido en navegador sobre una app ya levantada (`npm run start`) y una base sembrada con
 * `tests/e2e/smoke/seed.ts`. Deja capturas e informe en `smoke-artifacts/`.
 */
const baseURL = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests/e2e/smoke",
  testMatch: /.*\.smoke\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 12 * 60_000,
  expect: { timeout: 12_000 },
  outputDir: "smoke-artifacts/test-results",
  globalTeardown: "./tests/e2e/smoke/report.ts",
  reporter: [
    ["line"],
    ["html", { outputFolder: "smoke-artifacts/playwright-report", open: "never" }],
    ["junit", { outputFile: "smoke-artifacts/junit/results.xml" }],
  ],
  use: {
    baseURL,
    browserName: "chromium",
    headless: true,
    locale: "es-DO",
    timezoneId: "America/Santo_Domingo",
    actionTimeout: 12_000,
    navigationTimeout: 30_000,
    screenshot: "off",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    { name: "movil", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: "escritorio", use: { viewport: { width: 1280, height: 800 } } },
  ],
});
