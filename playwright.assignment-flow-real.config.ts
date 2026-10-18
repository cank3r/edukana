import { defineConfig } from "@playwright/test";
import path from "node:path";

const baseURL = process.env.ASSIGNMENT_FLOW_BASE_URL;
if (!baseURL || new URL(baseURL).hostname !== "127.0.0.1") throw new Error("A disposable loopback server is required.");
const output = process.env.ASSIGNMENT_FLOW_OUTPUT;
if (!output) throw new Error("An explicit evidence directory is required.");
export default defineConfig({
  testDir: "./tests/e2e/assignment-flow-real", testMatch: "*.spec.ts", workers: 1, fullyParallel: false,
  retries: 0, timeout: 60_000, expect: { timeout: 15_000 },
  outputDir: path.join(output, "results"),
  reporter: [["line"], ["json", { outputFile: path.join(output, "results.json") }]],
  use: { baseURL, browserName: "chromium", channel: process.platform === "win32" ? "chrome" : undefined,
    headless: true, locale: "es-DO", serviceWorkers: "block", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "mobile", use: { viewport: { width: 360, height: 844 }, hasTouch: true } },
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
  ],
});
