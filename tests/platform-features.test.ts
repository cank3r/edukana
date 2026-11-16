import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateCommission, resolveInstitutionFeatures, salesMonth } from "../src/server/platform/feature-policy";

test("features: defaults are on, malformed and missing JSON is safe", () => {
  for (const value of [null, undefined, [], "broken", {}, { ai: [], platform: "broken" }]) {
    assert.deepEqual(resolveInstitutionFeatures(value), { ai: true, catalog: true, aiLocked: false, commissionPercent: 0 });
  }
});
test("features: plan defaults apply only without explicit institution choices", () => {
  assert.deepEqual(resolveInstitutionFeatures({}, { ai: false, catalog: false }),
    { ai: false, catalog: false, aiLocked: false, commissionPercent: 0 });
  assert.deepEqual(resolveInstitutionFeatures({ ai: { enabled: true }, platform: { catalogEnabled: true } }, { ai: false, catalog: false }),
    { ai: true, catalog: true, aiLocked: false, commissionPercent: 0 });
  assert.equal(resolveInstitutionFeatures({ ai: { enabled: false } }, { ai: true }).ai, false);
});
test("features: the platform lock wins over every AI setting and plan", () => {
  for (const enabled of [undefined, true, false]) {
    assert.equal(resolveInstitutionFeatures({ ai: { enabled }, platform: { aiLocked: true } }, { ai: true }).ai, false);
  }
});
test("features: invalid stored commissions fall back safely", () => {
  for (const commissionPercent of [-1, 101, NaN, Infinity, "10", null]) {
    assert.equal(resolveInstitutionFeatures({ platform: { commissionPercent } }).commissionPercent, 0);
  }
});
test("commission: zero, fractions, rounding, 100 percent and conservation of cents", () => {
  assert.deepEqual(calculateCommission(10001, 12.5), { grossCents: 10001, commissionCents: 1250, netCents: 8751 });
  assert.deepEqual(calculateCommission(1, 50), { grossCents: 1, commissionCents: 1, netCents: 0 });
  assert.deepEqual(calculateCommission(123, 0), { grossCents: 123, commissionCents: 0, netCents: 123 });
  assert.deepEqual(calculateCommission(123, 100), { grossCents: 123, commissionCents: 123, netCents: 0 });
  assert.deepEqual(calculateCommission(0, 20), { grossCents: 0, commissionCents: 0, netCents: 0 });
});
test("commission: reject invalid monetary input instead of silently corrupting totals", () => {
  for (const gross of [-1, NaN, Infinity, 1.1, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => calculateCommission(gross, 10));
  for (const percent of [-1, 101, NaN, Infinity]) assert.throws(() => calculateCommission(100, percent));
});

test("sales month: uses UTC boundaries and rolls December into the next year", () => {
  assert.deepEqual(salesMonth(new Date("2026-12-31T23:59:59Z")), {
    gte: new Date("2026-12-01T00:00:00Z"), lt: new Date("2027-01-01T00:00:00Z"),
  });
  assert.deepEqual(salesMonth(new Date("2026-03-01T00:30:00+02:00")), {
    gte: new Date("2026-02-01T00:00:00Z"), lt: new Date("2026-03-01T00:00:00Z"),
  });
});
