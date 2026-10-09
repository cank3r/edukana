import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isPublicPath } from "../src/lib/access";
import { resolveEffectiveCapabilities } from "../src/lib/capabilities";

const root = process.cwd();
const source = (...segments: string[]) => readFileSync(join(root, ...segments), "utf8");

test("el recorrido canónico parte de una base vacía sin seed ni SQL manual", () => {
  const setupAction = source("src", "app", "setup", "actions.ts");
  const setupPage = source("src", "app", "setup", "page.tsx");
  const guide = source("docs", "canonical-mvp-pilot.md");
  assert.equal(isPublicPath("/setup"), true);
  assert.match(setupPage, /db\.institution\.count\(\)/);
  assert.match(setupAction, /TransactionIsolationLevel\.Serializable/);
  assert.match(setupAction, /if \(await tx\.institution\.count\(\)\)/);
  assert.match(setupAction, /role: "ADMIN"/);
  assert.match(setupAction, /bcrypt\.hash\(parsed\.data\.password, 12\)/);
  assert.match(guide, /no usa `prisma\/seed\.ts`, SQL manual ni datos preparados/);
});

test("el administrador crea cuentas y período con tenant derivado de sesión y auditoría", () => {
  const actions = source("src", "app", "dashboard", "configuracion", "puesta-en-marcha", "actions.ts");
  assert.match(actions, /requireActor\("people\.manage"\)/);
  assert.match(actions, /requireActor\("academic\.structure\.manage"\)/);
  assert.match(actions, /institutionId: actor\.institutionId/);
  assert.match(actions, /PILOT_USER_ROLES = \["TEACHER", "STUDENT", "PARENT"\]/);
  assert.match(actions, /role: z\.enum\(PILOT_USER_ROLES\)/);
  assert.doesNotMatch(actions, /z\.enum\(\[[^\]]*"ADMIN"/);
  assert.match(actions, /USER_CREATED/);
  assert.match(actions, /ACADEMIC_PERIOD_CREATED/);
});

test("solo el docente crea su curso y solo enrollment.manage matricula", () => {
  const actions = source("src", "app", "dashboard", "academico", "actions.ts");
  assert.match(actions, /user\.role !== "TEACHER"/);
  assert.match(actions, /institutionId: user\.institutionId, isActive: true/);
  assert.match(actions, /teacherId: user\.id/);
  assert.match(actions, /requireUser\("enrollment\.manage"\)/);
  assert.match(actions, /role: "STUDENT", status: "ACTIVE"/);
  assert.match(actions, /COURSE_CREATED/);
  assert.match(actions, /STUDENT_ENROLLED/);
  assert.equal(resolveEffectiveCapabilities("ADMIN").has("enrollment.manage"), true);
  assert.equal(resolveEffectiveCapabilities("TEACHER").has("enrollment.manage"), false);
});

test("el contrato conserva guardian, anuncios, storage y persistencia en el recorrido", () => {
  const guide = source("docs", "canonical-mvp-pilot.md");
  const guardian = source("src", "lib", "guardian-portal.ts");
  const announcements = source("src", "lib", "announcements.ts");
  const assets = source("src", "app", "api", "assets", "[assetId]", "route.ts");
  assert.match(guide, /cerrar sesión y volver a entrar/i);
  assert.match(guide, /imagen o video permitido/);
  assert.match(guardian, /status: "ACTIVE"/);
  assert.match(guardian, /if \(!guardianship\) return null/);
  assert.match(announcements, /institutionId: recipient\.institutionId/);
  assert.match(assets, /institutionId: user\.institutionId/);
  assert.match(assets, /getCommunityAnnouncementWhere/);
});


test("el progreso de lecciones no finaliza la matrícula sin acción docente explícita", () => {
  const actions = source("src", "app", "dashboard", "academico", "actions.ts");
  const progressBlock = actions.slice(actions.indexOf("export async function markLessonComplete"), actions.indexOf("export async function setEnrollmentCompletion"));
  assert.doesNotMatch(progressBlock, /status:\s*"COMPLETED"/);
  assert.match(actions, /export async function setEnrollmentCompletion/);
  assert.match(actions, /ENROLLMENT_COMPLETED/);
  assert.match(actions, /ENROLLMENT_REOPENED/);
});


test("el modo aditivo verifica tenant y conflictos sin crear períodos en staging", () => {
  const runner = source("tests", "e2e", "canonical-pilot.spec.mjs");
  const config = source("scripts", "canonical-pilot-config.mjs");
  const preflight = source("src", "app", "api", "pilot-preflight", "route.ts");
  const ci = source(".circleci", "config.yml");
  assert.match(config, /PILOT_MODE debe ser bootstrap o existing/);
  assert.match(config, /mode === "existing" \? required\(env, "PILOT_RUN_ID"\)/);
  assert.match(runner, /fetch\("\/api\/pilot-preflight"/);
  assert.match(runner, /if \(pilot\.mode === "existing"\) \{\s*await preflightExistingInstitution\(page\);\s*return;/);
  assert.match(runner, /if \(pilot\.mode === "bootstrap"\) \{\s*const periodForm/);
  assert.match(runner, /await periodSelect\.selectOption\(\{ index: 1 \}\)/);
  assert.match(runner, /gotoApp\(page, `\/dashboard\/aula\/\$\{createdCourseId\}`\)/);
  assert.match(runner, /selectPickerCourseByCode\(targetCourses, course\.code\)/);
  assert.match(runner, /guardianshipCard\.getByRole\("button", \{ name: "Activar vínculo" \}\)/);
  assert.match(preflight, /id: sessionUser\.id, institutionId: sessionUser\.institutionId, status: "ACTIVE"/);
  assert.match(preflight, /institutionId: actor\.institutionId, isActive: true/);
  assert.match(preflight, /institutionId: actor\.institutionId, email: \{ in: emails \}/);
  assert.match(preflight, /institutionId: actor\.institutionId, code: input\.courseCode\.toUpperCase\(\)/);
  assert.doesNotMatch(preflight, /\.(?:create|update|upsert|delete|executeRaw)\s*\(/);
  assert.match(ci, /cimg\/postgres:16\.4/);
  assert.match(ci, /npx prisma migrate deploy/);
});
