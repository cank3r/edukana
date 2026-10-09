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
  // Las cuentas se crean en «Personas» y los períodos en «Períodos académicos» (la antigua puesta en marcha ya no existe).
  const peopleAction = source("src", "server", "actions", "people.ts");
  const people = source("src", "server", "people", "create.ts");
  const periods = source("src", "server", "academic", "periods.ts");
  assert.match(peopleAction, /capabilities\.has\("people\.manage"\)/);
  assert.match(periods, /\.has\("academic\.structure\.manage"\)/);
  assert.match(people, /institutionId: actor\.institutionId/);
  assert.match(periods, /institutionId: actor\.institutionId/);
  assert.match(people, /data\.role === "ADMIN" && !ADMIN_ROLES\.includes\(actor\.role\)/);
  assert.doesNotMatch(people, /z\.enum\(\[[^\]]*"SUPER_ADMIN"/);
  assert.match(people, /PERSON_CREATED/);
  assert.match(periods, /ACADEMIC_PERIOD_CREATED/);
});

test("el curso nace en la institución de la sesión y el docente no lo asigna a otra persona", () => {
  const courses = source("src", "server", "courses", "course.ts");
  const enrollment = source("src", "server", "courses", "enrollment.ts");
  assert.match(courses, /const teacherId = scope\.kind === "teacher" \? scope\.teacherId : data\.teacherId/);
  assert.match(courses, /data: \{ \.\.\.checked\.data, institutionId: actor\.institutionId, isPublished: false \}/);
  assert.match(courses, /COURSE_CREATED/);
  assert.match(enrollment, /courseWhereForScope\(actor\.institutionId, resolveCourseWriteScope\(actor, capabilities\)\)/);
  assert.match(enrollment, /institutionId: actor\.institutionId, role: "STUDENT", status: "ACTIVE"/);
  assert.equal(resolveEffectiveCapabilities("ADMIN").has("enrollment.manage"), true);
  assert.equal(resolveEffectiveCapabilities("TEACHER").has("enrollment.manage"), false);
});

test("el contrato conserva guardian, anuncios, storage y persistencia en el recorrido", () => {
  const guide = source("docs", "canonical-mvp-pilot.md");
  const guardian = source("src", "server", "family", "guardian-portal.ts");
  const announcements = source("src", "lib", "announcements.ts");
  // La autorización de lectura de `/api/assets/[assetId]` vive en `assetReadAccess` (M2 · archivos).
  const assets = source("src", "app", "api", "assets", "[assetId]", "route.ts") + source("src", "server", "courses", "uploads.ts");
  assert.match(guide, /cerrar sesión y volver a entrar/i);
  assert.match(guide, /imagen o video permitido/);
  assert.match(guardian, /status: "ACTIVE"/);
  assert.match(guardian, /if \(!access \|\| access\.student\.id !== studentId\) return null/);
  assert.match(announcements, /institutionId: recipient\.institutionId/);
  assert.match(assets, /institutionId: user\.institutionId/);
  assert.match(assets, /getCommunityAnnouncementWhere/);
});


test("el progreso de lecciones no finaliza la matrícula sin acción docente explícita", () => {
  const progress = source("src", "server", "courses", "lesson-progress.ts");
  const completion = source("src", "server", "courses", "certificates.ts");
  assert.match(progress, /tx\.enrollment\.update\(\{ where: \{ id: enrollment\.id \}, data: \{ progressPercent \} \}\)/);
  assert.doesNotMatch(progress, /status:\s*"COMPLETED"/);
  assert.match(completion, /export async function markCourseCompleted/);
  assert.match(completion, /COURSE_MARKED_COMPLETED/);
  assert.match(completion, /COURSE_COMPLETION_REOPENED/);
});


test("el preflight aditivo verifica tenant y conflictos sin escribir", () => {
  // El runner desplegado `tests/e2e/canonical-pilot.spec.mjs` quedó obsoleto (pantallas antiguas); la ruta sigue publicada.
  const config = source("scripts", "canonical-pilot-config.mjs");
  const preflight = source("src", "app", "api", "pilot-preflight", "route.ts");
  const ci = source(".circleci", "config.yml");
  assert.match(config, /PILOT_MODE debe ser bootstrap o existing/);
  assert.match(config, /mode === "existing" \? required\(env, "PILOT_RUN_ID"\)/);
  assert.match(preflight, /id: sessionUser\.id, institutionId: sessionUser\.institutionId, status: "ACTIVE"/);
  assert.match(preflight, /institutionId: actor\.institutionId, isActive: true/);
  assert.match(preflight, /institutionId: actor\.institutionId, email: \{ in: emails \}/);
  assert.match(preflight, /institutionId: actor\.institutionId, code: input\.courseCode\.toUpperCase\(\)/);
  assert.doesNotMatch(preflight, /\.(?:create|update|upsert|delete|executeRaw)\s*\(/);
  assert.match(ci, /cimg\/postgres:16\.4/);
  assert.match(ci, /npx prisma migrate deploy/);
});
