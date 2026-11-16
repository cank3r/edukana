import { defineConfig } from "@playwright/test";
import path from "node:path";

const output = path.resolve(__dirname, "../personas-import-ui-artifacts");
export default defineConfig({
  testDir: "./tests/ui", testMatch: "people-import-ui.spec.ts", fullyParallel: false, workers: 1,
  timeout: 30_000, retries: 0, outputDir: path.join(output, "results"),
  reporter: [["line"], ["html", { outputFolder: path.join(output, "report"), open: "never" }],
    ["json", { outputFile: path.join(output, "results.json") }]],
  use: {
    baseURL: "http://127.0.0.1:3149", browserName: "chromium", channel: process.platform === "win32" ? "chrome" : undefined,
    headless: true, locale: "es-DO", screenshot: "only-on-failure", trace: "retain-on-failure",
  },
  webServer: {
    command: "node tests/ui/people-import-ui-server.cjs", url: "http://127.0.0.1:3149", timeout: 90_000, reuseExistingServer: false,
  },
  projects: [
    { name: "movil-360", use: { viewport: { width: 360, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "escritorio-1280", use: { viewport: { width: 1280, height: 900 } } },
  ],
});
