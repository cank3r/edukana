import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import type { PersonRow } from "../src/server/imports/people";

const require = createRequire(import.meta.url);
const { loadWithStubs } = require("./helpers/load-with-stubs.cjs");
type Actor = { id: string; institutionId: string; role: string };
let session: { user?: Partial<Actor> } | null;
let allowed: boolean;
let capabilitiesRead: unknown[][];
let plans: Array<{ institutionId: string; rows: PersonRow[] }>;
let applications: Array<{ actor: Omit<Actor, "role">; rows: PersonRow[] }>;
let revalidations: string[];
let existing: Set<string>;
let failure: "plan" | "apply" | null;
let concurrentExisting: number;
const initial = { ok: false as const, message: "" };
const csv = "Nombre,Correo,Rol\nAna Nueva,ana@example.invalid,estudiante\nPersona Existente,existe@example.invalid,docente\n";

const { importPeopleAction }: typeof import("../src/server/actions/people-import") = loadWithStubs(
  "src/server/actions/people-import.ts", {
    "next/cache": { revalidatePath: (path: string) => revalidations.push(path) },
    "@/lib/auth": { auth: async () => session },
    "@/lib/authorization": { getEffectiveCapabilities: async (...args: unknown[]) => {
      capabilitiesRead.push(args); return new Set(allowed ? ["people.manage"] : []);
    } },
    "@/lib/db": { db: new Proxy({}, { get() { throw new Error("Real database is forbidden in import action tests"); } }) },
    "@/server/imports/people-apply": {
      planPeopleImport: async (institutionId: string, rows: PersonRow[]) => {
        plans.push({ institutionId, rows });
        if (failure === "plan") throw new Error("Simulated planning failure");
        return { toCreate: rows.filter((row) => !existing.has(row.email)), existing: rows.filter((row) => existing.has(row.email)) };
      },
      applyPeopleImport: async (actor: Omit<Actor, "role">, rows: PersonRow[]) => {
        applications.push({ actor, rows });
        if (failure === "apply") throw new Error("Simulated partial application failure");
        return { created: rows.length - concurrentExisting, alreadyExisted: concurrentExisting };
      },
    },
  },
);
function form(contents = csv, confirm?: string) {
  const data = new FormData();
  data.set("file", new File([contents], "personas.csv", { type: "text/csv" }));
  if (confirm !== undefined) data.set("confirm", confirm);
  return data;
}
beforeEach(() => {
  session = { user: { id: "admin-test", institutionId: "institution-test", role: "ADMIN" } };
  allowed = true; capabilitiesRead = []; plans = []; applications = []; revalidations = [];
  existing = new Set(["existe@example.invalid"]); failure = null; concurrentExisting = 0;
});

test("preview parses the real CSV and plans within the session institution without writes or cache invalidation", async () => {
  const result = await importPeopleAction(initial, form());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.step, "preview");
  assert.deepEqual([result.totalLines, result.toCreate, result.alreadyExisted, result.rejected], [2, 1, 1, 0]);
  assert.equal(plans[0].institutionId, "institution-test");
  assert.deepEqual(plans[0].rows.map((row) => [row.email, row.role]),
    [["ana@example.invalid", "STUDENT"], ["existe@example.invalid", "TEACHER"]]);
  assert.deepEqual(capabilitiesRead, [["institution-test", "ADMIN"]]);
  assert.deepEqual(applications, []);
  assert.deepEqual(revalidations, []);
});

test("confirmation reparses and replans current file, ignoring browser summaries and spoofed actor fields", async () => {
  const preview = await importPeopleAction(initial, form());
  existing.add("ana@example.invalid");
  const data = form(`${csv}Otra Persona,otra@example.invalid,tutor\n`, "true");
  data.set("institutionId", "other-institution"); data.set("userId", "other-admin");
  const result = await importPeopleAction(preview, data);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.step, "done");
  assert.deepEqual([result.totalLines, result.toCreate, result.alreadyExisted], [3, 1, 2]);
  assert.equal(plans.length, 2);
  assert.equal(capabilitiesRead.length, 2);
  assert.deepEqual(applications[0].actor, { id: "admin-test", institutionId: "institution-test" });
  assert.deepEqual(applications[0].rows.map((row) => row.email), ["otra@example.invalid"]);
  assert.deepEqual(revalidations, ["/dashboard/gestion"]);
});

test("only the exact confirmation value requests application", async () => {
  for (const confirm of [undefined, "false", "1", "TRUE", ""]) {
    const result = await importPeopleAction(initial, form(csv, confirm));
    assert.ok(result.ok && result.step === "preview");
  }
  assert.deepEqual(applications, []);
});

test("missing or incomplete sessions reject before planning and authorization reads", async () => {
  for (const value of [null, {}, { user: {} }, { user: { id: "admin-test" } }]) {
    session = value;
    const result = await importPeopleAction(initial, form(csv, "true"));
    assert.equal(result.ok, false);
    assert.match(result.message, /sesión terminó/);
  }
  assert.deepEqual([capabilitiesRead, plans, applications, revalidations], [[], [], [], []]);
});

test("permission is required for preview and checked again before confirmation", async () => {
  allowed = false;
  assert.match((await importPeopleAction(initial, form())).message, /No tienes permiso/);
  assert.deepEqual(plans, []);
  allowed = true;
  const preview = await importPeopleAction(initial, form());
  allowed = false;
  assert.match((await importPeopleAction(preview, form(csv, "true"))).message, /No tienes permiso/);
  assert.equal(plans.length, 1);
  assert.deepEqual(applications, []);
});

test("missing, non-file, empty and oversized uploads reject before parsing or planning", async () => {
  const missing = new FormData();
  const text = new FormData(); text.set("file", "not a file");
  const oversized = form("x".repeat(2 * 1024 * 1024 + 1));
  for (const data of [missing, text, form(""), oversized]) {
    data.set("confirm", "true");
    const result = await importPeopleAction(initial, data);
    assert.equal(result.ok, false);
    assert.match(result.message, /archivo CSV|supera 2 MB/);
  }
  assert.deepEqual([plans, applications, revalidations], [[], [], []]);
});

test("row limit produces a reviewable rejection with no creatable people", async () => {
  const content = `Nombre,Correo\n${Array.from({ length: 5001 }, (_, index) => `Persona ${index},p${index}@example.invalid`).join("\n")}`;
  const result = await importPeopleAction(initial, form(content));
  assert.ok(result.ok && result.step === "preview");
  if (!result.ok) return;
  assert.equal(result.toCreate, 0);
  assert.equal(result.totalLines, 5001);
  assert.match(result.sampleErrors[0].message, /5000 filas/);
  assert.deepEqual(plans[0].rows, []);
  assert.deepEqual(applications, []);
});

test("preview returns only twenty sample errors and the downloadable report retains every rejected row", async () => {
  const content = `Nombre,Correo\n${Array.from({ length: 25 }, (_, index) => `Persona ${index},invalido-${index}`).join("\n")}`;
  const result = await importPeopleAction(initial, form(content));
  assert.ok(result.ok && result.step === "preview");
  if (!result.ok) return;
  assert.equal(result.rejected, 25);
  assert.equal(result.sampleErrors.length, 20);
  assert.equal(result.toCreate, 0);
  assert.match(result.errorsCsv, /invalido-24/);
  assert.deepEqual(applications, []);
});

test("confirmation reports actual creations and concurrent existing rows from the apply result", async () => {
  concurrentExisting = 1;
  const result = await importPeopleAction(initial, form(csv, "true"));
  assert.ok(result.ok && result.step === "done");
  if (!result.ok) return;
  assert.equal(result.toCreate, 0);
  assert.equal(result.alreadyExisted, 2);
  assert.match(result.message, /0 personas creadas/);
});

for (const stage of ["plan", "apply"] as const) {
  test(`${stage} failure returns a non-success result and does not invalidate the directory`, async (context) => {
    context.mock.method(console, "error", () => undefined);
    failure = stage;
    const result = await importPeopleAction(initial, form(csv, "true"));
    assert.equal(result.ok, false);
    assert.match(result.message, /No se pudo procesar el archivo/);
    assert.doesNotMatch(result.message, /Simulated|partial application/);
    assert.equal(applications.length, stage === "apply" ? 1 : 0);
    assert.deepEqual(revalidations, []);
  });
}
