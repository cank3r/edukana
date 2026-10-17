import { defineConfig } from "@playwright/test";
import path from "node:path";

const output = process.env.ASSIGNMENT_GUIDE_OUTPUT ?? path.resolve(__dirname, "../edukana-assignment-guide-results");
export default defineConfig({
  testDir: "./tests/ui", testMatch: "assignment-guide.spec.ts", fullyParallel: false, workers: 1, retries: 0,
  timeout: 25_000, outputDir: path.join(output, "results"),
  reporter: [["line"], ["json", { outputFile: path.join(output, "results.json") }]],
  use: { baseURL: "http://127.0.0.1:3171", browserName: "chromium", channel: process.platform === "win32" ? "chrome" : undefined,
    headless: true, locale: "es-DO", serviceWorkers: "block", screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: process.env.ASSIGNMENT_GUIDE_SERVER_RUNNING === "1" ? undefined : {
    command: "node tests/ui/assignment-guide-server.cjs", url: "http://127.0.0.1:3171", timeout: 90_000, reuseExistingServer: false,
  },
  projects: [320, 360, 390, 768, 1280].map(width => ({ name: `ancho-${width}`, grepInvert: width === 390 ? undefined : /@single/,
    use: { viewport: { width, height: 900 }, hasTouch: width <= 390,
      reducedMotion: width === 1280 ? "reduce" : "no-preference" } })),
});
