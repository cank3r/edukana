import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import type { Capability } from "../../src/lib/capabilities";
import type { EdukanaRole } from "../../src/types/next-auth";

// DB-free boundary regressions included by the integration glob. No seed, Prisma client or Storage provider is loaded.
const require = createRequire(import.meta.url);
const { loadWithStubs } = require("../helpers/load-with-stubs.cjs");
type Row = Record<string, unknown>;
type Query = { where: Row };
const parent = { id: "parent-a", institutionId: "institution-a", role: "PARENT" as const };
const access = { canManage: false, canPublish: false };
let people: Row[];
let links: Row[];
let announcements: Row[];
let overrides: Row[];
let permissionReads: Row[];

// Only the read operators used at these boundaries; unsupported operators fail instead of silently granting access.
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "AND" || key === "OR") {
      assert.ok(Array.isArray(condition));
      return key === "AND"
        ? condition.every((part: Row) => matches(row, part))
        : condition.some((part: Row) => matches(row, part));
    }
    const value = row[key];
    if (condition === null || typeof condition !== "object") return value === condition;
    const filter = condition as Row;
    if ("in" in filter) {
      assert.ok(Array.isArray(filter.in));
      return filter.in.includes(value);
    }
    if ("not" in filter) return value !== filter.not;
    if ("some" in filter) {
      assert.ok(Array.isArray(value));
      return value.some((part: Row) => matches(part, filter.some as Row));
    }
    assert.ok(value !== null && typeof value === "object", `Unsupported boundary field: ${key}`);
    return matches(value as Row, filter);
  });
}

const asset = {
  id: "asset-a", institutionId: parent.institutionId, confirmedAt: new Date("2026-10-01T12:00:00Z"),
  bucket: "private-fixture", kind: "IMAGE", objectPath: `${parent.institutionId}/announcements/drafts/teacher-a/image.png`,
  courseId: null, announcementId: "announcement-course-a", uploaderId: "teacher-a", visibility: "PRIVATE", submission: null,
};
const database = {
  roleCapabilityOverride: { findMany: async ({ where }: Query) => {
    permissionReads.push(where);
    return overrides.filter((row) => matches(row, where));
  } },
  guardianship: { findMany: async ({ where }: Query) => links.filter((row) => matches(row, where)) },
  user: { findMany: async ({ where }: Query) => people.filter((row) => matches(row, where)) },
  announcement: { findFirst: async ({ where }: Query) => announcements.find((row) => matches(row, where)) ?? null },
  storageAsset: { findFirst: async ({ where }: Query) => matches(asset, where) ? asset : null },
};
const forbidden = () => { throw new Error("External IO is forbidden in this DB-free suite"); };
const stubs = {
  "@/lib/db": { db: new Proxy(database, { get(target, property) {
    assert.ok(Object.hasOwn(target, property), `Unexpected database model: ${String(property)}`);
    return Reflect.get(target, property);
  } }) },
  "@/lib/storage": new Proxy({}, { get: () => forbidden }),
  "@/lib/auth": { auth: forbidden },
};
const { getCommunityAnnouncementWhere }: typeof import("../../src/lib/announcement-data") =
  loadWithStubs("src/lib/announcement-data.ts", stubs);
const { assetReadAccess }: typeof import("../../src/server/courses/uploads") =
  loadWithStubs("src/server/courses/uploads.ts", stubs);

function person(id: string, role: EdukanaRole, courseId?: string): Row {
  return {
    id, role, institutionId: parent.institutionId, status: "ACTIVE",
    enrollments: role === "STUDENT" && courseId ? [{ courseId }] : [],
    taughtCourses: role === "TEACHER" && courseId ? [{ id: courseId }] : [],
    organizationalMemberships: [],
  };
}
function announcement(id: string, institutionId: string, courseId: string): Row {
  return {
    id, institutionId, authorId: "teacher-a", audienceInstitution: false, audience: "COURSE", audienceId: courseId,
    courseTargets: [{ courseId }], roleTargets: [], userTargets: [], unitTargets: [],
  };
}
beforeEach(() => {
  people = [person(parent.id, "PARENT"), person("student-a", "STUDENT", "course-a")];
  links = [{
    institutionId: parent.institutionId, parentId: parent.id, studentId: "student-a", status: "ACTIVE",
    canViewAnnouncements: true, parent: people[0], student: people[1],
  }];
  announcements = [
    announcement("announcement-course-a", parent.institutionId, "course-a"),
    announcement("announcement-other-course", parent.institutionId, "course-other"),
    announcement("announcement-other-institution", "institution-b", "course-a"),
  ];
  overrides = [];
  permissionReads = [];
});
function setPermission(capability: Capability, enabled: boolean) {
  overrides = [{ institutionId: parent.institutionId, role: "PARENT", capability, enabled }];
}
async function visible(identity = parent, authority = access) {
  const where = await getCommunityAnnouncementWhere(identity, authority);
  return announcements.filter((row) => matches(row, where as Row)).map((row) => row.id);
}
function parentAsset() {
  // Deliberately stale capabilities: the shared reader must reread institutional overrides on each query.
  const capabilities = new Set<Capability>(["child.portal.view", "child.announcements.view"]);
  return assetReadAccess({ ...parent, capabilities }, "asset-a");
}

test("DB-free: active tutor receives only the linked course audience in its institution", async () => {
  assert.deepEqual(await visible(), ["announcement-course-a"]);
  assert.equal((await parentAsset()).status, 200);
});

for (const capability of ["child.portal.view", "child.announcements.view"] as const) {
  test(`DB-free: ${capability} revocation and restoration change the next community query`, async () => {
    assert.deepEqual(await visible(), ["announcement-course-a"]);
    setPermission(capability, false);
    assert.deepEqual(await visible(), []);
    setPermission(capability, true);
    assert.deepEqual(await visible(), ["announcement-course-a"]);
    assert.deepEqual(permissionReads, Array.from({ length: 3 }, () => ({ institutionId: parent.institutionId, role: "PARENT" })));
  });

  test(`DB-free: ${capability} revocation blocks a new private asset authorization despite stale caller capabilities`, async () => {
    assert.equal((await parentAsset()).status, 200);
    setPermission(capability, false);
    assert.equal((await parentAsset()).status, 403);
    setPermission(capability, true);
    assert.equal((await parentAsset()).status, 200);
  });
}

test("DB-free: overrides of another institution or role never revoke this tutor", async () => {
  overrides = [
    { institutionId: "institution-b", role: "PARENT", capability: "child.announcements.view", enabled: false },
    { institutionId: parent.institutionId, role: "STUDENT", capability: "child.portal.view", enabled: false },
  ];
  assert.deepEqual(await visible(), ["announcement-course-a"]);
});

test("DB-free: disabled flag, missing link and inactive links still deny community and assets", async () => {
  for (const state of ["PENDING", "REVOKED"]) {
    links[0].status = state;
    assert.deepEqual(await visible(), []);
    assert.equal((await parentAsset()).status, 403);
  }
  links[0].status = "ACTIVE";
  links[0].canViewAnnouncements = false;
  assert.deepEqual(await visible(), []);
  assert.equal((await parentAsset()).status, 403);
  links = [];
  assert.deepEqual(await visible(), []);
  assert.equal((await parentAsset()).status, 403);
});

test("DB-free: another parent, foreign link and suspended linked accounts cannot receive the child audience", async () => {
  for (const field of ["parentId", "institutionId"]) {
    const before = links[0][field];
    links[0][field] = "foreign";
    assert.deepEqual(await visible(), []);
    links[0][field] = before;
  }
  for (const person of people) {
    person.status = "SUSPENDED";
    assert.deepEqual(await visible(), []);
    person.status = "ACTIVE";
  }
});

test("DB-free: student, teacher, publisher and manager audiences keep their existing behavior", async () => {
  setPermission("child.announcements.view", false);
  for (const role of ["STUDENT", "TEACHER", "COORDINATOR", "ADMIN"] as const) {
    const actor = { id: `actor-${role}`, institutionId: parent.institutionId, role };
    people.push(person(actor.id, role, "course-a"));
    const where = await getCommunityAnnouncementWhere(actor, role === "ADMIN" ? { ...access, canManage: true } : access);
    const ids = announcements.filter((row) => matches(row, where as Row)).map((row) => row.id);
    assert.deepEqual(ids, role === "ADMIN" ? ["announcement-course-a", "announcement-other-course"]
      : role === "COORDINATOR" ? [] : ["announcement-course-a"]);
  }
  const publisher = { id: "teacher-a", institutionId: parent.institutionId, role: "TEACHER" as const };
  people.push(person(publisher.id, publisher.role));
  const where = await getCommunityAnnouncementWhere(publisher, { ...access, canPublish: true });
  assert.deepEqual(announcements.filter((row) => matches(row, where as Row)).map((row) => row.id),
    ["announcement-course-a", "announcement-other-course"]);
  assert.deepEqual(permissionReads, []);
});
