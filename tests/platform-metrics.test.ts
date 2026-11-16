import assert from "node:assert/strict";
import { test } from "node:test";
import { metricsWindow, getPlatformMetrics } from "@/server/platform/metrics";

test("ventanas del tablero usan UTC y días exactos", () => {
  const dates = metricsWindow(new Date("2026-10-09T23:00:00Z"));
  assert.equal(dates.month.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(dates.days7.toISOString(), "2026-10-02T23:00:00.000Z");
  assert.equal(dates.days30.toISOString(), "2026-09-09T23:00:00.000Z");
});
test("el tablero rechaza no operadores antes de consultar datos", async () => {
  process.env.PLATFORM_OPERATOR_EMAILS = "metric-operator@example.test";
  assert.equal(await getPlatformMetrics(null), null);
  assert.equal(await getPlatformMetrics("admin@example.test"), null);
});
