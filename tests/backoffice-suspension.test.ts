import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { beforeEach, test } from "node:test";
import {
  institutionPausedMessage, institutionStatusFilter, institutionSuspensionSchema,
  suspendedCredentialMessage, SUSPENDED_CREDENTIAL_CODE,
} from "@/server/platform/suspension-policy";

const require = createRequire(import.meta.url);
const { loadWithStubs } = require("./helpers/load-with-stubs.cjs");
const payload = { institutionId: "a", status: "SUSPENDED", confirmation: "Colegio A", reason: "Solicitud administrativa" };

test("suspensión: requiere motivo, nombre y estado válido; acota datos", () => {
  assert.equal(institutionSuspensionSchema.safeParse(payload).success, true);
  for (const override of [{ reason: " " }, { confirmation: "" }, { status: "deleted" }, { institutionId: "" }, { reason: "x".repeat(1001) }]) {
    assert.equal(institutionSuspensionSchema.safeParse({ ...payload, ...override }).success, false);
  }
  assert.equal(institutionSuspensionSchema.safeParse({ ...payload, status: "ACTIVE", reason: "" }).success, true);
});

test("suspensión: filtro admite solo ACTIVE o SUSPENDED sin aceptar estructuras de consulta", () => {
  assert.deepEqual(institutionStatusFilter("ACTIVE"), { status: "ACTIVE" });
  assert.deepEqual(institutionStatusFilter("SUSPENDED"), { status: "SUSPENDED" });
  for (const value of [null, undefined, "ALL", { not: "ACTIVE" }, ["SUSPENDED"]]) assert.deepEqual(institutionStatusFilter(value), {});
});

test("suspensión: mensaje claro conserva nombres Unicode y rechaza códigos ajenos o malformados", () => {
  const name = "Colegio Peña & Hijos";
  assert.equal(suspendedCredentialMessage(`${SUSPENDED_CREDENTIAL_CODE}${encodeURIComponent(name)}`), institutionPausedMessage(name));
  assert.equal(institutionPausedMessage(name), `El acceso de ${name} está pausado. Contacta a tu administración.`);
  for (const code of [undefined, "credentials", SUSPENDED_CREDENTIAL_CODE, `${SUSPENDED_CREDENTIAL_CODE}%GG`]) {
    assert.equal(suspendedCredentialMessage(code), null);
  }
});

let operator: string | null = null;
let guardCalls = 0;
let institution = { id: "a", name: "Colegio A", status: "ACTIVE", suspendedAt: null as Date | null, suspendedReason: null as string | null };
const audits: Array<{ data: Record<string, unknown> }> = [];
const paths: unknown[][] = [];
const calls: string[] = [];
const service: typeof import("@/server/platform/suspension") = loadWithStubs("src/server/platform/suspension.ts", {
  "@/lib/db": { db: {
    institution: { findUnique: async () => { calls.push("read"); return institution; } },
    $transaction: async (callback: (tx: unknown) => unknown) => callback({
      $queryRaw: async () => { calls.push("lock"); },
      institution: {
        findUnique: async () => { calls.push("read"); return institution; },
        update: async ({ data }: { data: typeof institution }) => { calls.push("write"); institution = { ...institution, ...data }; return data; },
      },
      auditLog: { create: async (data: { data: Record<string, unknown> }) => { audits.push(data); } },
    }),
  } },
  "@/server/identity": { normalizeEmail: (value: string) => value.trim().toLowerCase() },
  "./institutions": { isPlatformOperator: (email: string | null) => email === "operator@test.test" },
});
const actions: typeof import("@/server/actions/platform-suspension") = loadWithStubs("src/server/actions/platform-suspension.ts", {
  "@/server/platform/operator-session": { getOperatorEmail: async () => { guardCalls++; return operator; } },
  "@/server/platform/suspension": service,
  "next/cache": { revalidatePath: (...args: unknown[]) => paths.push(args) },
});
const section: typeof import("@/app/operador/[institutionId]/SuspensionSection") = loadWithStubs(
  "src/app/operador/[institutionId]/SuspensionSection.tsx", {
    "@/server/platform/operator-session": { getOperatorEmail: async () => { guardCalls++; return operator; } },
    "@/server/platform/suspension": service,
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
    "./SuspensionForm": { SuspensionForm: () => null },
  },
);
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
beforeEach(() => {
  operator = null; guardCalls = 0; audits.length = 0; paths.length = 0; calls.length = 0;
  institution = { id: "a", name: "Colegio A", status: "ACTIVE", suspendedAt: null, suspendedReason: null };
});

test("suspensión: página y acción rechazan no operador aunque falsifique correo en formulario", async () => {
  for (const email of [null, "admin@a.test", "student@a.test"]) {
    operator = email;
    await assert.rejects(section.SuspensionSection({ institutionId: "a" }), /NOT_FOUND/);
    const result = await actions.setInstitutionSuspensionAction({ ok: false, message: "" }, form({
      ...payload, operatorEmail: "operator@test.test", operator: "operator@test.test",
    }));
    assert.equal(result.ok, false);
  }
  assert.equal(guardCalls, 6);
  assert.equal(calls.length, 0);
  assert.equal(audits.length, 0);
  assert.equal(paths.length, 0);
});

test("suspensión: confirma nombre contra base antes de escribir", async () => {
  const result = await service.setInstitutionSuspension("operator@test.test", { ...payload, confirmation: "Otra" });
  assert.equal(result.ok, false);
  assert.deepEqual(calls, ["lock", "read"]);
  assert.equal(audits.length, 0);
});

test("suspensión: acción guarda transición auditada y revalida catálogo y ficha", async () => {
  operator = "operator@test.test";
  const result = await actions.setInstitutionSuspensionAction({ ok: false, message: "" }, form(payload));
  assert.equal(result.ok, true);
  assert.equal(institution.status, "SUSPENDED");
  assert.ok(institution.suspendedAt instanceof Date);
  assert.deepEqual(calls, ["lock", "read", "write"]);
  assert.equal(audits[0].data.action, "PLATFORM_INSTITUTION_SUSPENDED");
  const changes = audits[0].data.changes as { operator: string; before: { status: string }; after: { status: string } };
  assert.equal(changes.operator, operator);
  assert.equal(changes.before.status, "ACTIVE");
  assert.equal(changes.after.status, "SUSPENDED");
  assert.deepEqual(paths, [["/operador"], ["/operador/a"], ["/catalogo", "layout"]]);
});

test("suspensión: repetición no duplica bitácora; reactivar limpia solo suspensión", async () => {
  await service.setInstitutionSuspension("operator@test.test", payload);
  await service.setInstitutionSuspension("operator@test.test", payload);
  assert.equal(audits.length, 1);
  await service.setInstitutionSuspension("operator@test.test", { ...payload, status: "ACTIVE", reason: "" });
  assert.equal(institution.status, "ACTIVE");
  assert.equal(institution.suspendedAt, null);
  assert.equal(institution.suspendedReason, null);
  assert.equal(audits.length, 2);
  assert.equal(audits[1].data.action, "PLATFORM_INSTITUTION_REACTIVATED");
});
