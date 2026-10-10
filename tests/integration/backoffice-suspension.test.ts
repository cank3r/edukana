import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { findOwnMembership, listActiveMemberships } from "@/server/identity";
import { authenticateCredentials, authenticateCredentialsWithStatus } from "@/server/login";
import { resolveLiveIdentity, resolveSessionAccess } from "@/server/session";
import { getInstitutionAccessState, getInstitutionSuspension, setInstitutionSuspension } from "@/server/platform/suspension";
import { ensureSeed } from "./setup";

const OPERATOR = "bo-b-operator@prueba.test";
const EMAIL = "bo-b-shared@prueba.test";
const PASSWORD = "BoB-test-pass2026";
const A = "bo_b_institution_a";
const B = "bo_b_institution_b";
const SHARED_A = "bo_b_shared_a";
const SHARED_B = "bo_b_shared_b";
const NAME = "Instituto Suspensión B";
const change = (status: "ACTIVE" | "SUSPENDED" = "SUSPENDED") => ({
  institutionId: A, status, confirmation: NAME, reason: "Pausa administrativa de prueba",
});
let identityId = "";
let previousOperator: string | undefined;
let ip = 0;
const loginInput = (slug?: string) => ({ email: EMAIL, password: PASSWORD, ip: `198.51.100.${++ip}`, institutionSlug: slug });

before(async () => {
  await ensureSeed();
  previousOperator = process.env.PLATFORM_OPERATOR_EMAILS;
  process.env.PLATFORM_OPERATOR_EMAILS = OPERATOR;
  await db.institution.createMany({ data: [
    { id: A, name: NAME, slug: "bo-b-suspension-a", settings: { preserved: true }, plan: "PRO" },
    { id: B, name: "Otra institución B", slug: "bo-b-suspension-b" },
  ] });
  const identity = await db.identity.create({ data: { email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 4) } });
  identityId = identity.id;
  await db.user.createMany({ data: [
    { id: SHARED_A, institutionId: A, identityId, name: "Persona compartida", email: EMAIL, role: "ADMIN" },
    { id: SHARED_B, institutionId: B, identityId, name: "Persona compartida", email: EMAIL, role: "TEACHER" },
  ] });
});
beforeEach(async () => {
  await db.institution.updateMany({ where: { id: { in: [A, B] } }, data: { status: "ACTIVE", suspendedAt: null, suspendedReason: null } });
  await db.auditLog.deleteMany({ where: { institutionId: { in: [A, B] } } });
  await db.loginAttempt.deleteMany();
});
after(async () => {
  if (previousOperator === undefined) delete process.env.PLATFORM_OPERATOR_EMAILS;
  else process.env.PLATFORM_OPERATOR_EMAILS = previousOperator;
  await db.auditLog.deleteMany({ where: { institutionId: { in: [A, B] } } });
  await db.institution.deleteMany({ where: { id: { in: [A, B] } } });
  await db.identity.deleteMany({ where: { email: EMAIL } });
  await db.loginAttempt.deleteMany();
  await db.$disconnect();
});

test("BO-B: no operador no lee ni suspende ni reactiva, aunque sea administrador", async () => {
  for (const email of [null, "", EMAIL, "estudiante@a.test"]) {
    assert.equal(await getInstitutionSuspension(email, A), null);
    for (const status of ["ACTIVE", "SUSPENDED"] as const) {
      assert.equal((await setInstitutionSuspension(email, change(status))).ok, false);
    }
  }
  assert.equal((await getInstitutionAccessState(A))?.status, "ACTIVE");
  assert.equal(await db.auditLog.count({ where: { institutionId: A } }), 0);
});

test("BO-B: nombre incorrecto, motivo vacío, ID inexistente y estado manipulado no cambian nada", async () => {
  for (const override of [{ confirmation: "Otra" }, { reason: " " }, { institutionId: "inexistente" }, { status: "UNKNOWN" }]) {
    assert.equal((await setInstitutionSuspension(OPERATOR, { ...change(), ...override })).ok, false);
  }
  assert.equal((await getInstitutionAccessState(A))?.status, "ACTIVE");
  assert.equal(await db.auditLog.count({ where: { institutionId: A } }), 0);
});

test("BO-B: suspensión conserva cuentas, plan y configuración; bitácora guarda antes/después y operador", async () => {
  const users = await db.user.findMany({ where: { institutionId: A } });
  const identity = await db.identity.findUniqueOrThrow({ where: { id: identityId } });
  assert.equal((await setInstitutionSuspension(OPERATOR.toUpperCase(), change())).ok, true);
  const institution = await db.institution.findUniqueOrThrow({ where: { id: A } });
  assert.equal(institution.status, "SUSPENDED");
  assert.ok(institution.suspendedAt);
  assert.equal(institution.suspendedReason, change().reason);
  assert.equal(institution.plan, "PRO");
  assert.deepEqual(institution.settings, { preserved: true });
  assert.deepEqual(await db.user.findMany({ where: { institutionId: A } }), users);
  assert.deepEqual(await db.identity.findUniqueOrThrow({ where: { id: identityId } }), identity);
  const audit = await db.auditLog.findFirstOrThrow({ where: { institutionId: A } });
  assert.equal(audit.action, "PLATFORM_INSTITUTION_SUSPENDED");
  assert.equal(audit.entity, "Institution");
  assert.equal(audit.entityId, A);
  const changes = audit.changes as { operator: string; before: { status: string }; after: { status: string; suspendedReason: string } };
  assert.equal(changes.operator, OPERATOR);
  assert.equal(changes.before.status, "ACTIVE");
  assert.equal(changes.after.status, "SUSPENDED");
  assert.equal(changes.after.suspendedReason, change().reason);
});

test("BO-B: sesión viva se corta en la siguiente petición, conservando sesión de la otra membresía", async () => {
  const claimsA = { userId: SHARED_A, identityId, sessionVersion: 0 };
  const claimsB = { userId: SHARED_B, identityId, sessionVersion: 0 };
  assert.ok(await resolveLiveIdentity(claimsA));
  await setInstitutionSuspension(OPERATOR, change());
  assert.equal(await resolveLiveIdentity(claimsA), null);
  assert.equal((await resolveLiveIdentity(claimsB))?.institutionId, B);
  assert.deepEqual(await resolveSessionAccess(claimsA), { identity: null, suspendedInstitutionName: NAME });
  assert.equal((await db.identity.findUniqueOrThrow({ where: { id: identityId } })).sessionVersion, 0);
});

test("BO-B: contraseña válida rechaza slug suspendido, permite otra institución y entrada global", async () => {
  await setInstitutionSuspension(OPERATOR, change());
  const rejected = await authenticateCredentialsWithStatus(loginInput("bo-b-suspension-a"));
  assert.deepEqual(rejected, { user: null, suspendedInstitutionName: NAME });
  assert.equal((await authenticateCredentials(loginInput("bo-b-suspension-b")))?.institutionId, B);
  const automatic = await authenticateCredentials(loginInput());
  assert.equal(automatic?.institutionId, B);
  assert.equal(automatic?.institutionCount, 1);
});

test("BO-B: intentos válidos en institución suspendida no bloquean otra membresía por límite global", async () => {
  await setInstitutionSuspension(OPERATOR, change());
  for (let attempt = 0; attempt < 6; attempt++) {
    assert.equal((await authenticateCredentialsWithStatus(loginInput("bo-b-suspension-a"))).suspendedInstitutionName, NAME);
  }
  assert.equal((await authenticateCredentials(loginInput()))?.institutionId, B);
});

test("BO-B: contraseña errónea o institución ajena no revela estado ni nombre", async () => {
  await setInstitutionSuspension(OPERATOR, change());
  assert.deepEqual(await authenticateCredentialsWithStatus({ ...loginInput("bo-b-suspension-a"), password: "Wrong-password" }), { user: null });
  assert.deepEqual(await authenticateCredentialsWithStatus(loginInput("instituto-a")), { user: null });
});

test("BO-B: si todas sus instituciones están suspendidas no hay login", async () => {
  await setInstitutionSuspension(OPERATOR, change());
  await setInstitutionSuspension(OPERATOR, { ...change(), institutionId: B, confirmation: "Otra institución B" });
  assert.equal(await authenticateCredentials(loginInput()), null);
});

test("BO-B: selector y cambio de institución excluyen suspendida y membresía ajena", async () => {
  await setInstitutionSuspension(OPERATOR, change());
  assert.deepEqual((await listActiveMemberships(identityId)).map((row) => row.id), [SHARED_B]);
  assert.equal(await findOwnMembership(identityId, SHARED_A), null);
  assert.equal(await findOwnMembership("otra-identidad", SHARED_B), null);
  assert.equal((await findOwnMembership(identityId, SHARED_B))?.id, SHARED_B);
});

test("BO-B: reactivación restaura login y sesión sin cambiar miembros ni versión", async () => {
  await setInstitutionSuspension(OPERATOR, change());
  await setInstitutionSuspension(OPERATOR, change("ACTIVE"));
  assert.ok(await resolveLiveIdentity({ userId: SHARED_A, identityId, sessionVersion: 0 }));
  assert.equal((await authenticateCredentials(loginInput("bo-b-suspension-a")))?.institutionId, A);
  const state = await getInstitutionSuspension(OPERATOR, A);
  assert.equal(state?.status, "ACTIVE");
  assert.equal(state?.suspendedAt, null);
  assert.equal(state?.suspendedReason, null);
  assert.equal(await db.auditLog.count({ where: { institutionId: A, action: "PLATFORM_INSTITUTION_REACTIVATED" } }), 1);
});

test("BO-B: sesión expirada o de identidad ajena no revela nombre de institución suspendida", async () => {
  await setInstitutionSuspension(OPERATOR, change());
  assert.equal(await resolveSessionAccess({ userId: SHARED_A, identityId, sessionVersion: 88 }), null);
  assert.equal(await resolveSessionAccess({ userId: SHARED_A, identityId: "otra", sessionVersion: 0 }), null);
});

test("BO-B: doble envío concurrente produce una sola transición y auditoría", async () => {
  const results = await Promise.all([
    setInstitutionSuspension(OPERATOR, change()), setInstitutionSuspension(OPERATOR, change()),
  ]);
  assert.ok(results.every((result) => result.ok));
  assert.equal(await db.auditLog.count({ where: { institutionId: A, action: "PLATFORM_INSTITUTION_SUSPENDED" } }), 1);
});

test("BO-B: contrato catálogo expone solo estado y nombre; institución inexistente es null", async () => {
  await setInstitutionSuspension(OPERATOR, change());
  assert.deepEqual(await getInstitutionAccessState(A), { status: "SUSPENDED", name: NAME });
  assert.equal(await getInstitutionAccessState("inexistente"), null);
});

test("BO-B: login exitoso registra evidencia sin correo, dirección IP ni secretos", async () => {
  assert.ok(await authenticateCredentials(loginInput("bo-b-suspension-a")));
  const audit = await db.auditLog.findFirstOrThrow({ where: { institutionId: A, action: "LOGIN_SUCCEEDED" } });
  assert.equal(audit.userId, SHARED_A);
  assert.equal(audit.entityId, SHARED_A);
  assert.deepEqual(audit.changes, {});
  assert.equal(audit.ipAddress, null);
  assert.equal(audit.userAgent, null);
});
