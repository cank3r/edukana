import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { MemoryEmailProvider, setEmailProviderForTests } from "@/server/integrations/email";
import { createPerson } from "@/server/people/create";
import { sendInvitations } from "@/server/people/invitations";
import { A, B, ensureSeed } from "./setup";

const mail = new MemoryEmailProvider();
const NEW_EMAILS = ["nueva.persona@crear.test", "otra.persona@crear.test", "admin.nuevo@crear.test", "invitada@crear.test", "ajena@crear.test"];
const SHARED = "estudiante@b.test";

before(async () => {
  process.env.APP_URL = "https://edukana.test";
  await ensureSeed();
  setEmailProviderForTests(mail);
});
beforeEach(() => {
  mail.sent.length = 0;
});
after(async () => {
  setEmailProviderForTests(null);
  await db.user.deleteMany({ where: { email: { in: NEW_EMAILS } } });
  await db.user.deleteMany({ where: { email: SHARED, institutionId: A.institutionId } });
  await db.identity.deleteMany({ where: { email: { in: NEW_EMAILS } } });
  await db.identity.updateMany({ where: { email: SHARED }, data: { passwordHash: null } });
  await db.passwordResetToken.deleteMany();
  await db.auditLog.deleteMany({ where: { action: { in: ["PERSON_CREATED", "PEOPLE_INVITED"] } } });
  await db.$disconnect();
});

test("crear persona: queda en la institución de quien la crea, sin contraseña, con el correo normalizado y registrada", async () => {
  const result = await createPerson(A.admin, { name: "  Nueva Persona ", email: "  Nueva.Persona@Crear.test ", role: "TEACHER", phone: " 8095550101 " });
  assert.ok(result.ok);
  const saved = await db.user.findUniqueOrThrow({ where: { id: result.userId }, include: { identity: true } });
  assert.equal(saved.institutionId, A.institutionId);
  assert.equal(saved.name, "Nueva Persona");
  assert.equal(saved.email, "nueva.persona@crear.test");
  assert.equal(saved.role, "TEACHER");
  assert.equal(saved.phone, "8095550101");
  assert.equal(saved.status, "ACTIVE");
  assert.equal(saved.password, null);
  assert.equal(saved.identity?.email, "nueva.persona@crear.test");
  assert.equal(saved.identity?.passwordHash, null);
  assert.equal(await db.auditLog.count({ where: { action: "PERSON_CREATED", institutionId: A.institutionId, userId: A.admin.id, entityId: result.userId } }), 1);
  assert.equal(mail.sent.length, 0, "crear no envía correos por sí solo");
});

test("crear persona: un correo que ya existe en la institución se rechaza con un mensaje claro", async () => {
  const countBefore = await db.user.count({ where: { institutionId: A.institutionId } });
  const repeated = await createPerson(A.admin, { name: "Otra Vez", email: "NUEVA.persona@crear.test", role: "STUDENT" });
  assert.equal(repeated.ok, false);
  assert.match(repeated.ok ? "" : repeated.message, /Ya hay una persona con ese correo/);
  const seeded = await createPerson(A.admin, { name: "Estudiante Repetido", email: "estudiante@a.test", role: "STUDENT" });
  assert.equal(seeded.ok, false);
  assert.equal(await db.user.count({ where: { institutionId: A.institutionId } }), countBefore);
});

test("crear persona: datos incompletos o mal escritos no crean nada", async () => {
  assert.equal((await createPerson(A.admin, { name: "ab", email: "otra.persona@crear.test", role: "STUDENT" })).ok, false);
  assert.equal((await createPerson(A.admin, { name: "Otra Persona", email: "sin-arroba", role: "STUDENT" })).ok, false);
  assert.equal((await createPerson(A.admin, { name: "Otra Persona", email: "otra.persona@crear.test", role: "SUPER_ADMIN" })).ok, false);
  assert.equal(await db.user.count({ where: { email: "otra.persona@crear.test" } }), 0);
  assert.equal(await db.identity.count({ where: { email: "otra.persona@crear.test" } }), 0);
});

test("crear persona: si el correo ya existe en otra institución, reutiliza la identidad y no toca su contraseña", async () => {
  const passwordHash = await bcrypt.hash("ClaveDeSiempre1", 4);
  const identity = await db.identity.update({ where: { email: SHARED }, data: { passwordHash } });
  const result = await createPerson(A.admin, { name: "Estudiante Compartido", email: SHARED, role: "STUDENT" });
  assert.ok(result.ok);
  const membership = await db.user.findUniqueOrThrow({ where: { id: result.userId } });
  assert.equal(membership.institutionId, A.institutionId);
  assert.equal(membership.identityId, identity.id);
  assert.equal(await db.identity.count({ where: { email: SHARED } }), 1);
  assert.equal((await db.identity.findUniqueOrThrow({ where: { email: SHARED } })).passwordHash, passwordHash);
  const inB = await db.user.findUniqueOrThrow({ where: { id: B.student.id } });
  assert.equal(inB.institutionId, B.institutionId);
  assert.equal(inB.name, "student B", "la membresía de la otra institución no cambia");
});

test("crear persona: solo un administrador puede crear a otro administrador", async () => {
  const denied = await createPerson(A.coordinator, { name: "Admin Nuevo", email: "admin.nuevo@crear.test", role: "ADMIN" });
  assert.deepEqual(denied, { ok: false, message: "Solo un administrador puede agregar a otro administrador." });
  assert.equal(await db.user.count({ where: { email: "admin.nuevo@crear.test" } }), 0);
  assert.equal(await db.identity.count({ where: { email: "admin.nuevo@crear.test" } }), 0);
  const allowed = await createPerson(A.admin, { name: "Admin Nuevo", email: "admin.nuevo@crear.test", role: "ADMIN" });
  assert.ok(allowed.ok);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: allowed.userId } })).role, "ADMIN");
});

test("crear persona: no se puede crear en otra institución", async () => {
  const countBefore = await db.user.count({ where: { institutionId: B.institutionId } });
  const smuggled = { name: "Persona Ajena", email: "ajena@crear.test", role: "STUDENT", institutionId: B.institutionId };
  const result = await createPerson(A.admin, smuggled);
  assert.ok(result.ok);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: result.userId } })).institutionId, A.institutionId);
  assert.equal(await db.user.count({ where: { institutionId: B.institutionId } }), countBefore);
  assert.equal(await db.auditLog.count({ where: { action: "PERSON_CREATED", institutionId: B.institutionId } }), 0);
});

test("crear persona con invitación: recibe un correo con el enlace para crear su contraseña", async () => {
  const result = await createPerson(A.admin, { name: "Persona Invitada", email: "invitada@crear.test", role: "STUDENT" });
  assert.ok(result.ok);
  assert.deepEqual(await sendInvitations(A.admin, [result.userId]), { sent: 1, failed: 0, skipped: 0, remaining: 0 });
  assert.equal(mail.sent.length, 1);
  assert.equal(mail.sent[0].to, "invitada@crear.test");
  assert.match(mail.sent[0].text, /https:\/\/edukana\.test\/restablecer\/[A-Za-z0-9_-]+/);
  assert.equal(await db.passwordResetToken.count({ where: { userId: result.userId } }), 1);

  // Si el correo falla, la persona sigue creada y sin enlace: se le puede invitar después.
  setEmailProviderForTests({
    async send() {
      throw new Error("proveedor caído");
    },
  });
  try {
    await db.passwordResetToken.deleteMany({ where: { userId: result.userId } });
    assert.equal((await sendInvitations(A.admin, [result.userId])).failed, 1);
    assert.equal(await db.user.count({ where: { id: result.userId, status: "ACTIVE" } }), 1);
    assert.equal(await db.passwordResetToken.count({ where: { userId: result.userId } }), 0);
  } finally {
    setEmailProviderForTests(mail);
  }
});
