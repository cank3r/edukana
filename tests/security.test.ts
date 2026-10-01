import assert from "node:assert/strict";
import test from "node:test";
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

test("solo considera pública la ruta de login", () => {
  assert.equal(isPublicPath("/login"), true);
  assert.equal(isPublicPath("/login/ayuda"), true);
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
