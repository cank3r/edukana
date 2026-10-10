import assert from "node:assert/strict";
import { test } from "node:test";
import {
  announcementAudiences, announcementDismissalKey, announcementIsCurrent, platformAnnouncementSchema,
} from "../src/server/platform/announcement-policy";
const startsAt = new Date("2026-10-10T10:00:00.000Z");
const endsAt = new Date("2026-10-10T11:00:00.000Z");
test("platform notice starts inclusive and ends exclusive", () => {
  assert.equal(announcementIsCurrent({ startsAt, endsAt }, new Date(startsAt.getTime() - 1)), false);
  assert.equal(announcementIsCurrent({ startsAt, endsAt }, startsAt), true);
  assert.equal(announcementIsCurrent({ startsAt, endsAt }, endsAt), false);
  assert.equal(announcementIsCurrent({ startsAt, endsAt: null }, endsAt), true);
});
test("scheduled notices terminated before start never appear", () => {
  assert.equal(announcementIsCurrent({ startsAt: endsAt, endsAt: startsAt }, endsAt), false);
});
test("audiences distinguish administrators, independent teachers and their students", () => {
  assert.deepEqual(announcementAudiences("ADMIN", false), ["ALL", "ADMINS"]);
  assert.deepEqual(announcementAudiences("SUPER_ADMIN", false), ["ALL", "ADMINS"]);
  assert.deepEqual(announcementAudiences("TEACHER", false), ["ALL"]);
  assert.deepEqual(announcementAudiences("TEACHER", true), ["ALL", "INDEPENDENT"]);
  assert.deepEqual(announcementAudiences("ADMIN", true), ["ALL", "ADMINS", "INDEPENDENT"]);
  for (const role of ["STUDENT", "PARENT", "COORDINATOR"] as const) {
    assert.deepEqual(announcementAudiences(role, true), ["ALL"]);
  }
});
test("validation rejects invalid, inverted and equal dates and invalid enums", () => {
  const input = { title: "Aviso", body: "Mensaje", level: "INFO", audience: "ALL", startsAt, endsAt };
  assert.equal(platformAnnouncementSchema.safeParse(input).success, true);
  for (const overrides of [{ startsAt: "invalid" }, { startsAt: null }, { startsAt: "" }, { endsAt: startsAt }, { startsAt: endsAt, endsAt: startsAt },
    { level: "DANGER" }, { audience: "EVERYONE" }, { title: " " }, { body: " " }]) {
    assert.equal(platformAnnouncementSchema.safeParse({ ...input, ...overrides }).success, false);
  }
  assert.equal(platformAnnouncementSchema.parse({ ...input, endsAt: "" }).endsAt, null);
});
test("dismissal key isolates people and notices, supports shared identity across memberships", () => {
  assert.notEqual(announcementDismissalKey("one", "a"), announcementDismissalKey("two", "a"));
  assert.notEqual(announcementDismissalKey("one", "a"), announcementDismissalKey("one", "b"));
  assert.notEqual(announcementDismissalKey("one:a", "b"), announcementDismissalKey("one", "a:b"));
  assert.equal(announcementDismissalKey("identity", "a"), announcementDismissalKey("identity", "a"));
});
