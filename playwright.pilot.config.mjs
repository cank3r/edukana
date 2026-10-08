import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { loadCanonicalPilotConfig } from "./scripts/canonical-pilot-config.mjs";

const pilot = loadCanonicalPilotConfig();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  outputDir: join(pilot.scratch, "edukana-canonical-pilot"),
  reporter: [["line"]],
  use: {
    ...devices["Desktop Edge"],
    baseURL: pilot.baseUrl,
    channel: "msedge",
    headless: pilot.headless,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
});
