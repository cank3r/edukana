import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { courseWhereForScope, type CourseScope } from "@/lib/course-scope";
import { createCourse } from "@/server/courses/course";
import { authenticateCredentials } from "@/server/login";
import {
  getIndependentHome,
  isIndependentInstitution,
  isIndependentSignupEnabled,
  registerIndependentTeacher,
  slugFromName,
} from "@/server/platform/independent";
import { A, ensureSeed } from "./setup";

const ALL: CourseScope = { kind: "all" };
const PASSWORD = "ClaveDocente2026";
const EMAILS = ["uno@independiente.test", "dos@independiente.test", "compartida@independiente.test", "apagado@independiente.test"];
const created: string[] = [];
let ipCounter = 0;
const nextIp = () => `10.11.0.${(ipCounter += 1)}`;

async function register(input: Parameters<typeof registerIndependentTeacher>[0]) {
  const result = await registerIndependentTeacher(input, nextIp());
  if (result.ok) created.push(result.institutionId);
  return result;
}

before(async () => {
  await ensureSeed();
});
beforeEach(() => {
  process.env.INDEPENDENT_SIGNUP_ENABLED = "true";
});
afterEach(() => {
  delete process.env.INDEPENDENT_SIGNUP_ENABLED;
});
after(async () => {
  await db.auditLog.deleteMany({ where: { institutionId: { in: created } } });
  await db.course.deleteMany({ where: { institutionId: { in: created } } });
  await db.institution.deleteMany({ where: { id: { in: created } } });
  await db.user.deleteMany({ where: { email: { in: EMAILS } } });
  await db.identity.deleteMany({ where: { email: { in: EMAILS } } });
  await db.loginAttempt.deleteMany();
  await db.$disconnect();
});

test("registro: crea cuenta, espacio independiente, administrador que enseña y período; entra a su espacio", async () => {
  const result = await register({ name: "Ana Pérez", email: " Uno@Independiente.test ", password: PASSWORD, spaceName: "" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.reusedAccount, false);

  const institution = await db.institution.findUniqueOrThrow({ where: { id: result.institutionId } });
  assert.equal(institution.name, "Cursos de Ana Pérez");
  assert.equal(institution.slug, result.slug);
  assert.equal(await isIndependentInstitution(institution.id), true);
  assert.equal(await isIndependentInstitution(A.institutionId), false);

  const user = await db.user.findUniqueOrThrow({ where: { id: result.userId }, include: { identity: true } });
  assert.equal(user.institutionId, institution.id);
  assert.equal(user.role, "ADMIN");
  assert.equal(user.status, "ACTIVE");
  assert.equal(user.email, "uno@independiente.test");
  assert.equal(user.identity?.email, "uno@independiente.test");
  assert.equal(await bcrypt.compare(PASSWORD, user.identity?.passwordHash ?? ""), true);

  const periods = await db.academicPeriod.findMany({ where: { institutionId: institution.id } });
  assert.equal(periods.length, 1);
  assert.equal(periods[0].isActive, true);

  const login = await authenticateCredentials({ email: "uno@independiente.test", password: PASSWORD, ip: nextIp(), institutionSlug: result.slug });
  assert.equal(login?.id, user.id);
  assert.equal(login?.institutionId, institution.id);

  // Puede crear su curso de inmediato, a su nombre y en su período.
  const actor = { id: user.id, institutionId: institution.id, role: "ADMIN" as const };
  const course = await createCourse(actor, ALL, { name: "Fotografía con el celular", teacherId: user.id, periodId: periods[0].id });
  assert.equal(course.ok, true);
  if (!course.ok) return;
  assert.equal((await db.course.findUniqueOrThrow({ where: { id: course.courseId } })).teacherId, user.id);

  const home = await getIndependentHome(institution.id);
  assert.equal(home?.slug, result.slug);
  assert.equal(home?.numbers.courses, 1);
  assert.equal(await getIndependentHome(A.institutionId), null);
});

test("registro: dos docentes independientes quedan aislados entre sí", async () => {
  const first = await db.user.findFirstOrThrow({ where: { email: "uno@independiente.test" } });
  const second = await register({ name: "Beto Gómez", email: "dos@independiente.test", password: PASSWORD, spaceName: "Clases de guitarra" });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  const secondActor = { id: second.userId, institutionId: second.institutionId, role: "ADMIN" as const };
  const ownPeriod = await db.academicPeriod.findFirstOrThrow({ where: { institutionId: second.institutionId } });

  const visible = await db.course.findMany({ where: courseWhereForScope(second.institutionId, ALL)!, select: { teacherId: true, institutionId: true } });
  assert.equal(visible.length, 0);
  assert.ok(!visible.some((course) => course.teacherId === first.id));

  // No puede poner a la otra persona como docente ni usar su período.
  const foreignTeacher = await createCourse(secondActor, ALL, { name: "Curso ajeno", teacherId: first.id, periodId: ownPeriod.id });
  assert.equal(foreignTeacher.ok, false);
  const firstPeriod = await db.academicPeriod.findFirstOrThrow({ where: { institutionId: first.institutionId } });
  const foreignPeriod = await createCourse(secondActor, ALL, { name: "Curso ajeno", teacherId: second.userId, periodId: firstPeriod.id });
  assert.equal(foreignPeriod.ok, false);
  assert.equal(await db.course.count({ where: { institutionId: second.institutionId } }), 0);

  // El nombre propio del espacio se respeta y la dirección no choca con la del otro.
  const institution = await db.institution.findUniqueOrThrow({ where: { id: second.institutionId } });
  assert.equal(institution.name, "Clases de guitarra");
  const firstInstitution = await db.institution.findUniqueOrThrow({ where: { id: first.institutionId } });
  assert.equal(institution.slug, "clases-de-guitarra");
  assert.notEqual(institution.slug, firstInstitution.slug);
});

test("institución normal: el administrador no puede ponerse a sí mismo como docente", async () => {
  const result = await createCourse(A.admin, ALL, { name: "Curso M11 sin docente", teacherId: A.admin.id, periodId: "a_period" });
  assert.equal(result.ok, false);
  assert.equal(await db.course.count({ where: { name: "Curso M11 sin docente" } }), 0);
});

test("correo existente: con contraseña errónea se rechaza; con la correcta se reutiliza la cuenta", async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  await db.identity.create({ data: { email: "compartida@independiente.test", passwordHash } });
  const institutionsBefore = await db.institution.count();

  const wrong = await register({ name: "Carla Ruiz", email: "compartida@independiente.test", password: "OtraClave2026", spaceName: "" });
  assert.equal(wrong.ok, false);
  if (!wrong.ok) assert.match(wrong.message, /contraseña no coincide/);
  assert.equal(await db.institution.count(), institutionsBefore);
  assert.equal(await db.user.count({ where: { email: "compartida@independiente.test" } }), 0);

  const right = await register({ name: "Carla Ruiz", email: "compartida@independiente.test", password: PASSWORD, spaceName: "" });
  assert.equal(right.ok, true);
  if (!right.ok) return;
  assert.equal(right.reusedAccount, true);
  const identity = await db.identity.findUniqueOrThrow({ where: { email: "compartida@independiente.test" } });
  assert.equal(identity.passwordHash, passwordHash);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: right.userId } })).identityId, identity.id);
});

test("registro: contraseña débil y datos incompletos se rechazan sin crear nada", async () => {
  const before = await db.institution.count();
  assert.equal((await register({ name: "Dina", email: "apagado@independiente.test", password: "corta", spaceName: "" })).ok, false);
  assert.equal((await register({ name: "Dina", email: "no-es-correo", password: PASSWORD, spaceName: "" })).ok, false);
  assert.equal(await db.institution.count(), before);
});

test("límite de intentos: el mismo correo no puede registrar sin fin", async () => {
  await db.loginAttempt.deleteMany();
  const ip = "10.12.0.1";
  const results = [];
  for (let index = 0; index < 6; index += 1) {
    results.push(await registerIndependentTeacher({ name: "Eva Díaz", email: "dos@independiente.test", password: "Equivocada2026", spaceName: "" }, ip));
  }
  const last = results.at(-1)!;
  assert.equal(last.ok, false);
  if (!last.ok) assert.match(last.message, /demasiados intentos/);
  await db.loginAttempt.deleteMany();
});

test("variable apagada: el alta se niega y la página /ensenar responde 404", async () => {
  process.env.INDEPENDENT_SIGNUP_ENABLED = "false";
  const before = await db.institution.count();
  const result = await register({ name: "Fede Luna", email: "apagado@independiente.test", password: PASSWORD, spaceName: "" });
  assert.equal(result.ok, false);
  assert.equal(await db.institution.count(), before);
  assert.equal(await db.identity.count({ where: { email: "apagado@independiente.test" } }), 0);

  const { default: TeachPage } = await import("@/app/ensenar/page");
  assert.throws(() => TeachPage(), (error: unknown) => String((error as { digest?: string }).digest ?? "").endsWith(";404"));
  process.env.INDEPENDENT_SIGNUP_ENABLED = "true";
  assert.doesNotThrow(() => TeachPage());
});

test("variable: activa por omisión en todos los entornos; solo false/0 la apaga", () => {
  assert.equal(isIndependentSignupEnabled({ NODE_ENV: "development" }), true);
  assert.equal(isIndependentSignupEnabled({ NODE_ENV: "production" }), true);
  assert.equal(isIndependentSignupEnabled({ NODE_ENV: "production", VERCEL_ENV: "preview" }), true);
  assert.equal(isIndependentSignupEnabled({ NODE_ENV: "production", VERCEL_ENV: "production" }), true);
  assert.equal(isIndependentSignupEnabled({ NODE_ENV: "production", INDEPENDENT_SIGNUP_ENABLED: "false" }), false);
  assert.equal(isIndependentSignupEnabled({ NODE_ENV: "production", INDEPENDENT_SIGNUP_ENABLED: "true" }), true);
  assert.equal(isIndependentSignupEnabled({ NODE_ENV: "development", INDEPENDENT_SIGNUP_ENABLED: "0" }), false);
  assert.equal(slugFromName("Cursos de Ñandú Pérez"), "cursos-de-nandu-perez");
  assert.equal(slugFromName("¡!"), "docente");
});
