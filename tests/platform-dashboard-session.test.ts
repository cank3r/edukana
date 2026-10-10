import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import React, { type ReactElement } from "react";
const require = createRequire(import.meta.url);
const { loadWithStubs } = require("./helpers/load-with-stubs.cjs");
// Node's TSX runner uses classic JSX; Next uses the automatic runtime.
Object.assign(globalThis, { React });
let session: unknown = null;
let authError: Error | null = null;
let capabilityReads: unknown[][] = [];
let dataReads = 0;
function StudentHome() { return null; }
function unusedHome() { throw new Error("Unexpected home component"); }
const { default: DashboardPage }: typeof import("../src/app/dashboard/page") = loadWithStubs("src/app/dashboard/page.tsx", {
  "@/lib/auth": { auth: async () => { if (authError) throw authError; return session; } },
  "@/lib/authorization": { getEffectiveCapabilities: async (...args: unknown[]) => {
    capabilityReads.push(args); return new Set(["student.portal.view"]);
  } },
  "@/lib/db": { db: new Proxy({}, { get() { dataReads++; throw new Error("Unexpected dashboard database access"); } }) },
  "@/server/platform/independent": { getIndependentHome: async () => { dataReads++; throw new Error("Unexpected independent home read"); } },
  "./AdminHome": { AdminHome: unusedHome },
  "./CoordinatorHome": { CoordinatorHome: unusedHome },
  "./IndependentHome": { IndependentHome: unusedHome },
  "./ParentHome": { ParentHome: unusedHome },
  "./StudentHome": { StudentHome },
  "./TeacherHome": { TeacherHome: unusedHome },
});
beforeEach(() => { session = null; authError = null; capabilityReads = []; dataReads = 0; });
test("dashboard yields to layout when live session is revoked without reading institution data", async () => {
  assert.equal(await DashboardPage(), null);
  assert.deepEqual(capabilityReads, []); assert.equal(dataReads, 0);
});
test("dashboard yields to layout for a session without a user", async () => {
  session = { expires: "2099-01-01" };
  assert.equal(await DashboardPage(), null);
  assert.deepEqual(capabilityReads, []); assert.equal(dataReads, 0);
});
test("dashboard preserves the authenticated student home and institution scope", async () => {
  session = { user: { id: "student-a", institutionId: "institution-a", name: "Estudiante A", role: "STUDENT" } };
  const result = await DashboardPage() as ReactElement<{ user: { id: string; institutionId: string }; userName: string }>;
  assert.equal(result.type, StudentHome);
  assert.deepEqual(result.props, { user: { id: "student-a", institutionId: "institution-a" }, userName: "Estudiante A" });
  assert.deepEqual(capabilityReads, [["institution-a", "STUDENT"]]); assert.equal(dataReads, 0);
});
test("dashboard does not swallow authentication failures", async () => {
  authError = new Error("Authentication database unavailable");
  await assert.rejects(DashboardPage, (error) => error === authError);
  assert.deepEqual(capabilityReads, []); assert.equal(dataReads, 0);
});
