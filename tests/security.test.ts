import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canAccessDashboardPath, canModifyCourseEnrollment, isPublicPath } from "../src/lib/access";
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

test("aplica RBAC a las áreas administrativas", () => {
  assert.equal(canAccessDashboardPath("/dashboard/gestion", "ADMIN"), true);
  assert.equal(canAccessDashboardPath("/dashboard/gestion/estudiante-1", "STUDENT"), false);
  assert.equal(canAccessDashboardPath("/dashboard/pagos", "COORDINATOR"), false);
  assert.equal(canAccessDashboardPath("/dashboard/configuracion", "TEACHER"), false);
});

test("reserva el portal personal para estudiantes", () => {
  assert.equal(canAccessDashboardPath("/dashboard/portal", "STUDENT"), true);
  assert.equal(canAccessDashboardPath("/dashboard/portal", "ADMIN"), false);
  assert.equal(canAccessDashboardPath("/dashboard/aula", "TEACHER"), true);
});

test("permite escribir solo en matrículas activas", () => {
  assert.equal(canModifyCourseEnrollment("ACTIVE"), true);
  assert.equal(canModifyCourseEnrollment("COMPLETED"), false);
  assert.equal(canModifyCourseEnrollment("WITHDRAWN"), false);
  assert.equal(canModifyCourseEnrollment(null), false);
});

test("usa cargas directas firmadas y restringe quién puede prepararlas", () => {
  const route = readFileSync(join(process.cwd(), "src", "app", "api", "assets", "route.ts"), "utf8");
  const form = readFileSync(join(process.cwd(), "src", "components", "dashboard", "AcademicForms.tsx"), "utf8");
  assert.match(route, /createPrivateAssetUpload/);
  assert.match(route, /staffRoles\.has\(user\.role\)/);
  assert.doesNotMatch(route, /request\.formData\(\)/);
  assert.match(form, /intent\.uploadUrl/);
  assert.match(form, /method: "PATCH"/);
});