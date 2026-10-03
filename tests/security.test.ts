import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canAccessDashboardPath, isPublicPath } from "../src/lib/access";
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

test("solo considera públicas las rutas de login y certificados verificables", () => {
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
  assert.equal(canAccessDashboardPath("/dashboard/aula/curso-1", "STUDENT"), true);
  assert.equal(canAccessDashboardPath("/dashboard/aula/curso-1", "PARENT"), false);
  assert.equal(canAccessDashboardPath("/dashboard/calendario", "STUDENT"), true);
  assert.equal(canAccessDashboardPath("/dashboard/calendario", "PARENT"), false);
});

test("reserva el portal personal para estudiantes", () => {
  assert.equal(canAccessDashboardPath("/dashboard/portal", "STUDENT"), true);
  assert.equal(canAccessDashboardPath("/dashboard/portal", "ADMIN"), false);
  assert.equal(canAccessDashboardPath("/dashboard/aula", "TEACHER"), true);
});



test("usa cargas directas firmadas y restringe quién puede prepararlas", () => {
  const route = readFileSync(join(process.cwd(), "src", "app", "api", "assets", "route.ts"), "utf8");
  const form = readFileSync(join(process.cwd(), "src", "components", "dashboard", "AcademicForms.tsx"), "utf8");
  assert.match(route, /createPrivateAssetUpload/);
  assert.match(route, /hasCapability\(user\.role, "course\.manage"\)/);
  assert.match(route, /studentId: user\.id, status: "ACTIVE"/);
  assert.doesNotMatch(route, /staffRoles/);
  assert.doesNotMatch(route, /request\.formData\(\)/);
  assert.match(form, /intent\.uploadUrl/);
  assert.match(form, /method: "PATCH"/);
});


test("minimiza los datos del curso para estudiantes y bloquea cursos completados", () => {
  const classroom = readFileSync(join(process.cwd(), "src", "app", "dashboard", "aula", "page.tsx"), "utf8");
  const course = readFileSync(join(process.cwd(), "src", "app", "dashboard", "aula", "[courseId]", "page.tsx"), "utf8");
  assert.match(classroom, /!hasCapability\(user\.role, "course\.view"\)/);
  assert.match(classroom, /hasCapability\(user\.role, "course\.roster\.view"\) && <span/);
  assert.match(course, /studentId: user\.id, status: \{ in: \["ACTIVE", "COMPLETED"\]/);
  assert.match(course, /questionBank: \{ where: canManage \? \{\} : \{ id: "__restricted__" \}/);
  assert.doesNotMatch(course, /bankItem: true/);
  assert.match(course, /canViewRoster && <section id="estudiantes">/);
  assert.match(course, /isReadOnlyStudent = ownEnrollment\?\.status === "COMPLETED"/);
  assert.match(course, /Curso completado: la entrega está disponible solo para consulta/);
  assert.match(course, /Curso completado: los exámenes están disponibles solo para consulta/);
});


test("aísla finanzas y horarios en todas las capas visibles", () => {
  const analytics = readFileSync(join(process.cwd(), "src", "app", "dashboard", "analitica", "page.tsx"), "utf8");
  const studentDetail = readFileSync(join(process.cwd(), "src", "app", "dashboard", "gestion", "estudiantes", "[studentId]", "page.tsx"), "utf8");
  const calendar = readFileSync(join(process.cwd(), "src", "app", "dashboard", "calendario", "page.tsx"), "utf8");
  const dashboard = readFileSync(join(process.cwd(), "src", "app", "dashboard", "page.tsx"), "utf8");
  assert.match(analytics, /hasCapability\(user\.role, "analytics\.view"\)/);
  assert.match(studentDetail, /canViewFinance = hasCapability\(user\.role, "finance\.manage"\)/);
  assert.match(studentDetail, /\{canViewFinance && <section>/);
  assert.match(calendar, /if \(!hasCapability\(user\.role, "schedule\.view"\)\) notFound\(\)/);
  assert.match(dashboard, /OR: \[\{ audience: "ALL" \}, \{ audience: "ROLE", audienceId: user\.role \}\]/);
  assert.doesNotMatch(dashboard, /title: "Consultar calendario"/);
  assert.match(dashboard, /Comunicaciones dirigidas a tutores/);
});


test("las acciones del servidor usan el registro central de capacidades", () => {
  const actions = readFileSync(join(process.cwd(), "src", "app", "dashboard", "actions.ts"), "utf8");
  const academicActions = readFileSync(join(process.cwd(), "src", "app", "dashboard", "academico", "actions.ts"), "utf8");
  for (const source of [actions, academicActions]) {
    assert.match(source, /hasCapability\(user\.role, capability\)/);
    assert.doesNotMatch(source, /requireUser\(\[/);
  }
  assert.match(actions, /requireUser\("finance\.manage"\)/);
  assert.match(academicActions, /requireUser\("course\.participate"\)/);
});
