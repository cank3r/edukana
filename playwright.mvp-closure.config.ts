import { defineConfig } from "@playwright/test";
import path from "node:path";

const output = process.env.MVP_CLOSURE_OUTPUT ?? path.resolve(__dirname, "../mvp-closure-artifacts");
export default defineConfig({
  testDir: "./tests/ui", testMatch: "mvp-closure-ui.spec.ts", fullyParallel: false, workers: 1,
  timeout: 20_000, retries: 0, outputDir: path.join(output, "results"),
  reporter: [["line"], ["json", {outputFile: path.join(output,"results.json")}]],
  use: {baseURL:"http://127.0.0.1:3153", browserName:"chromium", headless:true, locale:"es-DO",
    screenshot:"only-on-failure", trace:"retain-on-failure"},
  webServer: {command:"node tests/ui/mvp-closure-ui-server.cjs", url:"http://127.0.0.1:3153",
    timeout:90_000, reuseExistingServer:false},
  projects: [
    {name:"movil-360", use:{viewport:{width:360,height:844},isMobile:true,hasTouch:true}},
    {name:"escritorio-1280", use:{viewport:{width:1280,height:900}}},
  ],
});
