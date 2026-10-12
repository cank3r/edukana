import { defineConfig } from "@playwright/test";
import { join } from "node:path";
import { canonicalConfig } from "./scripts/canonical-mvp-config.mjs";

const fixture = canonicalConfig();

export default defineConfig({
  testDir: "./tests/e2e/canonical-mvp",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 12 * 60_000,
  expect: { timeout: 15_000 },
  outputDir: join(fixture.privateDir, "test-results"),
  reporter: [
    ["line"],
    ["json", { outputFile: join(fixture.privateDir, "results.json") }],
  ],
  use: {
    baseURL: fixture.baseURL,
    browserName: "chromium",
    headless: true,
    locale: "es-DO",
    timezoneId: "America/Santo_Domingo",
    viewport: { width: 1280, height: 800 },
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    screenshot: "only-on-failure",
    trace: "off",
    video: "off",
  },
  projects: [
    { name: "canonical-core", testMatch: "core.spec.ts" },
    { name: "canonical-ux", testMatch: "ux.spec.ts", dependencies: ["canonical-core"] },
    { name: "canonical-denials", testMatch: "denials.spec.ts", dependencies: ["canonical-core"] },
    { name: "canonical-auth-race", testMatch: "logout-race.spec.ts", dependencies: ["canonical-core"] },
  ],
});
