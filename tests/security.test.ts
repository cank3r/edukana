import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { canAccessDashboardPath, isPublicPath } from "../src/lib/access";
import { resolveEffectiveCapabilities } from "../src/lib/capabilities";
import type { EdukanaRole } from "../src/types/next-auth";
import { loginSchema } from "../src/lib/validation";

test("normaliza un login válido", () => {
  const result = loginSchema.parse({
    email: "  Admin@Demo.Edukana  ",
    password: "edukana2026",
  });

  assert.equal(result.email, "admin@demo.edukana");
  assert.equal(result.password, "edukana2026");
});

test("rechaza credenciales con formato inválido", () => {
  assert.equal(loginSchema.safeParse({ email: "correo-invalido", password: "123" }).success, false);
});

test("diagnostica cada rechazo de credenciales sin registrar secretos", () => {
  const source = ["src/lib/auth.ts", "src/server/login.ts"].map((file) => readFileSync(join(process.cwd(), file), "utf8")).join("\n");
  for (const reason of ["invalid_input", "too_many_attempts", "unknown_account", "account_suspended", "missing_password", "password_mismatch", "no_active_institution"]) {
    assert.match(source, new RegExp(`rejectCredentials\\(\\"${reason}\\"`));
  }
  const diagnosticCall = source.match(/console\.warn\([\s\S]*?\);/)?.[0] ?? "";
  assert.match(diagnosticCall, /\[auth\]\[credentials-rejected\]/);
  assert.doesNotMatch(diagnosticCall, /email|password|hash/i);
});

test("solo considera públicas las rutas de puesta en marcha, login y certificados verificables", () => {
  assert.equal(isPublicPath("/setup"), true);
  assert.equal(isPublicPath("/setup-extra"), false);
  assert.equal(isPublicPath("/login"), true);
  assert.equal(isPublicPath("/login/ayuda"), true);
  assert.equal(isPublicPath("/certificados/EDU-ABC123"), true);
  assert.equal(isPublicPath("/login-falso"), false);
  assert.equal(isPublicPath("/dashboard"), false);
});

test("aplica capacidades coherentes a rutas administrativas y académicas", () => {
  assert.equal(canAccessDashboardPath("/dashboard/gestion", "ADMIN"), true);
  assert.equal(canAccessDashboardPath("/dashboard/gestion/estudiante-1", "STUDENT"), false);
  assert.equal(canAccessDashboardPath("/dashboard/pagos", "COORDINATOR"), false);
  assert.equal(canAccessDashboardPath("/dashboard/analitica", "COORDINATOR"), false);
  assert.equal(canAccessDashboardPath("/dashboard/configuracion", "TEACHER"), false);
  assert.equal(canAccessDashboardPath("/dashboard/configuracion/unidades", "ADMIN"), true);
  assert.equal(canAccessDashboardPath("/dashboard/configuracion/unidades", "TEACHER"), false);
  assert.equal(canAccessDashboardPath("/dashboard/aula/curso-1", "STUDENT"), true);
  assert.equal(canAccessDashboardPath("/dashboard/aula/curso-1", "PARENT"), false);
  assert.equal(canAccessDashboardPath("/dashboard/calendario", "STUDENT"), true);
  assert.equal(canAccessDashboardPath("/dashboard/calendario", "PARENT"), false);
  assert.equal(canAccessDashboardPath("/dashboard/hijos", "PARENT"), true);
  assert.equal(canAccessDashboardPath("/dashboard/hijos", "STUDENT"), false);
  assert.equal(canAccessDashboardPath("/dashboard/configuracion/tutores", "ADMIN"), true);
  assert.equal(canAccessDashboardPath("/dashboard/configuracion/tutores", "COORDINATOR"), false);
});

test("reserva el portal personal para estudiantes", () => {
  assert.equal(canAccessDashboardPath("/dashboard/portal", "STUDENT"), true);
  assert.equal(canAccessDashboardPath("/dashboard/portal", "ADMIN"), false);
  assert.equal(canAccessDashboardPath("/dashboard/aula", "TEACHER"), true);
});



test("usa cargas directas firmadas y restringe quién puede prepararlas", async () => {
  const { loadWithStubs } = createRequire(import.meta.url)("./helpers/load-with-stubs.cjs");
  let user: { id: string; institutionId: string; role: EdukanaRole } | null = {
    id: "teacher-a", institutionId: "institution-a", role: "TEACHER",
  };
  let capabilities = resolveEffectiveCapabilities("TEACHER");
  const writes: Record<string, unknown>[] = [];
  const signatures: unknown[] = [];
  type Row = Record<string, unknown>;
  const course = { id: "course-a", institutionId: "institution-a", teacherId: "teacher-a",
    enrollments: [{ studentId: "student-a", status: "ACTIVE" }] };
  const submission = { id: "submission-a", studentId: "student-a", assignmentId: "assignment-a",
    assignment: { courseId: course.id, course } };
  const matches = (row: Row, where: Row): boolean => Object.entries(where).every(([key, expected]) => {
    const actual = row[key];
    if (expected === null || typeof expected !== "object") return actual === expected;
    if ("some" in expected) return Array.isArray(actual) && actual.some((item) => matches(item, expected.some as Row));
    return actual !== null && typeof actual === "object" && matches(actual as Row, expected as Row);
  });
  // Keep validation and course policy real; simulate only session, DB and private storage boundaries.
  const route: typeof import("../src/app/api/assets/route") = loadWithStubs("src/app/api/assets/route.ts", {
    "@/lib/auth": { auth: async () => user ? { user } : null },
    "@/lib/authorization": { getEffectiveCapabilities: async (institutionId: string, role: EdukanaRole) => {
      assert.equal(institutionId, user?.institutionId);
      assert.equal(role, user?.role);
      return capabilities;
    } },
    "@/lib/db": { db: {
      course: { findFirst: async ({ where }: { where: Row }) => matches(course, where) ? course : null },
      submission: { findFirst: async ({ where }: { where: Row }) => matches(submission, where) ? submission : null },
      lesson: { findFirst: async ({ where }: { where: { id: string; institutionId: string; course: Record<string, unknown> } }) =>
        where.id === "lesson-a" && where.institutionId === course.institutionId && matches(course, where.course)
          ? { courseId: course.id } : null },
      storageAsset: { create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push(data);
        return { id: "asset-a", ...data };
      } },
    } },
    "@/lib/storage": { createPrivateAssetUpload: async (input: unknown) => {
      signatures.push(input);
      return { bucket: "fixture-private", objectPath: "institution-a/course-a/fixture.pdf",
        signedUrl: "https://storage.example.invalid/fixture-upload" };
    } },
  });
  const post = (fields: Record<string, unknown> = {}) => route.POST(new Request("https://app.example.invalid/api/assets", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "fixture.pdf", type: "application/pdf", size: 32, kind: "DOCUMENT",
      courseId: "course-a", ...fields }),
  }));
  const denied = async (status: number, fields: Record<string, unknown> = {}) => {
    assert.equal((await post(fields)).status, status);
    assert.deepEqual(signatures, [], "denied requests must not issue upload signatures");
    assert.deepEqual(writes, [], "denied requests must not reserve asset metadata");
  };
  user = null;
  await denied(401);
  user = { id: "student-a", institutionId: "institution-a", role: "STUDENT" };
  capabilities = resolveEffectiveCapabilities("STUDENT");
  await denied(403, { submissionId: "submission-a" });
  await denied(403);
  user = { ...user, id: "teacher-a", role: "TEACHER" };
  capabilities = resolveEffectiveCapabilities("TEACHER");
  await denied(403, { submissionId: "submission-a" });
  for (const revoked of ["course.view", "course.manage"]) {
    capabilities = new Set([...resolveEffectiveCapabilities("TEACHER")].filter((capability) => capability !== revoked));
    await denied(403);
  }
  capabilities = resolveEffectiveCapabilities("TEACHER");
  user.institutionId = "institution-b";
  await denied(403);
  user.institutionId = "institution-a";
  user.id = "other-teacher";
  await denied(403);
  user.id = "teacher-a";
  const response = await post({ lessonId: "lesson-a" });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { assetId: "asset-a", uploadUrl: "https://storage.example.invalid/fixture-upload",
    retrievalUrl: "/api/assets/asset-a" });
  assert.deepEqual(signatures, [{ institutionId: "institution-a", courseId: "course-a", fileName: "fixture.pdf" }]);
  assert.deepEqual(writes, [{ institutionId: "institution-a", courseId: "course-a", lessonId: "lesson-a",
    assignmentId: null, submissionId: null, uploaderId: "teacher-a", bucket: "fixture-private",
    objectPath: "institution-a/course-a/fixture.pdf", originalName: "fixture.pdf", mimeType: "application/pdf",
    sizeBytes: 32, kind: "DOCUMENT", visibility: "COURSE" }]);
});


test("minimiza los datos del curso para estudiantes y bloquea cursos completados", () => {
  const classroom = readFileSync(join(process.cwd(), "src", "app", "dashboard", "aula", "page.tsx"), "utf8");
  const course = readFileSync(join(process.cwd(), "src", "app", "dashboard", "aula", "[courseId]", "page.tsx"), "utf8");
  assert.match(classroom, /!capabilities\.has\("course\.view"\)/);
  assert.match(classroom, /const showRoster = capabilities\.has\("course\.roster\.view"\)/);
  assert.match(classroom, /courseListWhere\(user\.institutionId, readScope/);
  assert.match(course, /status: \{ in: \["ACTIVE", "COMPLETED"\] \}, \.\.\.\(isStudent \? \{ studentId: user\.id \}/);
  assert.match(course, /isStudent \? courseListWhere\(user\.institutionId, readScope\)/);
  assert.doesNotMatch(course, /bankItem|answerKey/);
  assert.match(course, /canViewRoster && <AreaCard href=\{`\$\{base\}\/estudiantes`\}/);
  assert.match(course, /readOnly = own\?\.status === "COMPLETED"/);
  assert.match(course, /Ya completaste este curso/);
});


test("aísla finanzas y horarios en todas las capas visibles", () => {
  const analytics = readFileSync(join(process.cwd(), "src", "app", "dashboard", "analitica", "page.tsx"), "utf8");
  const studentDetail = readFileSync(join(process.cwd(), "src", "app", "dashboard", "gestion", "estudiantes", "[studentId]", "page.tsx"), "utf8");
  const calendar = readFileSync(join(process.cwd(), "src", "app", "dashboard", "calendario", "page.tsx"), "utf8");
  const dashboard = readFileSync(join(process.cwd(), "src", "app", "dashboard", "page.tsx"), "utf8");
  assert.match(analytics, /getEffectiveCapabilities\(user\.institutionId, user\.role\)/);
  assert.match(analytics, /capabilities\.has\("analytics\.view"\)/);
  assert.match(studentDetail, /canViewFinance = capabilities\.has\("finance\.manage"\)/);
  // people-profile-ui.test.ts verifies finance query/render permission gates without relying on JSX whitespace or layout.
  assert.match(calendar, /if \(!capabilities\.has\("schedule\.view"\)\) notFound\(\)/);
  assert.match(dashboard, /getCommunityAnnouncementWhere\(user, \{ canManage:/);
  assert.doesNotMatch(dashboard, /title: "Consultar calendario"/);
  assert.match(dashboard, /Comunicaciones dirigidas a tutores/);
});


test("las acciones del servidor usan el registro central de capacidades", () => {
  const actions = readFileSync(join(process.cwd(), "src", "app", "dashboard", "actions.ts"), "utf8");
  const academicActions = readFileSync(join(process.cwd(), "src", "app", "dashboard", "academico", "actions.ts"), "utf8");
  const charges = readFileSync(join(process.cwd(), "src", "server", "finance", "charges.ts"), "utf8");
  const lessonProgress = readFileSync(join(process.cwd(), "src", "server", "courses", "lesson-progress.ts"), "utf8");
  assert.match(actions, /userHasCapability\(user, capability\)/);
  assert.match(academicActions, /getEffectiveCapabilities\(user\.institutionId, user\.role\)/);
  for (const source of [actions, academicActions]) {
    assert.doesNotMatch(source, /requireUser\(\[/);
  }
  assert.match(actions, /requireUser\("announcement\.publish"\)/);
  assert.match(academicActions, /requireUser\("course\.manage"\)/);
  assert.match(charges, /getEffectiveCapabilities\(actor\.institutionId, actor\.role\)\)\.has\("finance\.manage"\)/);
  assert.match(lessonProgress, /if \(!capabilities\.has\("course\.participate"\)\)/);
});


test("las 17 páginas del dashboard conservan defensa autoritativa en servidor", () => {
  const pages = [
    ["page.tsx"],
    ["admisiones", "page.tsx"],
    ["analitica", "page.tsx"],
    ["aula", "page.tsx"],
    ["aula", "[courseId]", "page.tsx"],
    ["calendario", "page.tsx"],
    ["comunidad", "page.tsx"],
    ["configuracion", "page.tsx"],
    ["configuracion", "puesta-en-marcha", "page.tsx"],
    ["configuracion", "roles", "page.tsx"],
    ["configuracion", "unidades", "page.tsx"],
    ["configuracion", "tutores", "page.tsx"],
    ["hijos", "page.tsx"],
    ["gestion", "page.tsx"],
    ["gestion", "estudiantes", "[studentId]", "page.tsx"],
    ["pagos", "page.tsx"],
    ["portal", "page.tsx"],
  ];
  assert.equal(pages.length, 17);
  for (const segments of pages) {
    const source = readFileSync(join(process.cwd(), "src", "app", "dashboard", ...segments), "utf8");
    assert.match(source, /getEffectiveCapabilities\(/, segments.join("/") + " debe resolver permisos en servidor");
  }
});

test("curso, assets y mutaciones comparten el alcance central", () => {
  const files = [
    join(process.cwd(), "src", "app", "dashboard", "aula", "page.tsx"),
    join(process.cwd(), "src", "app", "dashboard", "aula", "[courseId]", "page.tsx"),
    join(process.cwd(), "src", "app", "api", "assets", "route.ts"),
    // `/api/assets/[assetId]` autoriza con `assetReadAccess` (M2 · archivos).
    join(process.cwd(), "src", "server", "courses", "uploads.ts"),
    join(process.cwd(), "src", "app", "dashboard", "academico", "actions.ts"),
  ];
  for (const file of files) assert.match(readFileSync(file, "utf8"), /@\/lib\/course-scope/);
});
