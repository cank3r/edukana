import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { breadcrumbLabel, navigationForRole, roleLabel, spanishLabel } from "../src/lib/ux";

test("muestra módulos claros y propios de cada rol", () => {
  assert.deepEqual(navigationForRole("STUDENT").map((item) => item.label), ["Inicio", "Mi aprendizaje", "Cursos", "Avisos", "Calendario"]);
  assert.equal(navigationForRole("TEACHER").some((item) => item.href === "/dashboard/gestion"), false);
  assert.equal(navigationForRole("PARENT").some((item) => item.href === "/dashboard/aula"), false);
  assert.equal(navigationForRole("PARENT").some((item) => item.href === "/dashboard/calendario"), false);
  assert.equal(navigationForRole("PARENT").some((item) => item.href === "/dashboard/hijos"), true);
  assert.ok(navigationForRole("ADMIN").some((item) => item.label === "Cobros"));
  assert.equal(navigationForRole("COORDINATOR").some((item) => item.href === "/dashboard/pagos"), false);
  assert.equal(navigationForRole("COORDINATOR").some((item) => item.href === "/dashboard/analitica"), false);
});

test("localiza estados visibles y conserva un fallback legible", () => {
  assert.equal(spanishLabel("SUBMITTED"), "Entregado");
  assert.equal(spanishLabel("PRESENT"), "Presente");
  assert.equal(spanishLabel("CUSTOM_STATUS"), "Custom status");
  assert.equal(roleLabel("ADMIN"), "Administrador");
  assert.equal(roleLabel("TEACHER"), "Docente");
  assert.equal(roleLabel("PARENT"), "Tutor");
  assert.equal(breadcrumbLabel("analitica"), "Reportes");
});

test("el login conserva las credenciales fuera de la URL sin JavaScript", () => {
  const login = readFileSync(join(process.cwd(), "src", "app", "login", "page.tsx"), "utf8");
  assert.match(login, /method="post"/);
  assert.match(login, /action="\/api\/auth\/callback\/credentials"/);
  assert.doesNotMatch(login, /method="get"/i);
});

test("el layout expone salto al contenido y destino principal", () => {
  const layout = readFileSync(join(process.cwd(), "src", "app", "dashboard", "layout.tsx"), "utf8");
  assert.match(layout, /href="#contenido-principal"/);
  assert.match(layout, /id="contenido-principal"/);
});



test("la navegación móvil muestra destinos con etiquetas legibles", () => {
  const sidebar = readFileSync(join(process.cwd(), "src", "components", "dashboard", "Sidebar.tsx"), "utf8");
  assert.match(sidebar, /Navegación móvil/);
  assert.match(sidebar, /<span>\{item\.label\}<\/span>/);
  assert.match(sidebar, /> Menú/);
});

test("el dashboard oculta pendientes en cero y usa el término Cobros", () => {
  const dashboard = readFileSync(join(process.cwd(), "src", "app", "dashboard", "page.tsx"), "utf8");
  const payments = readFileSync(join(process.cwd(), "src", "app", "dashboard", "pagos", "page.tsx"), "utf8");
  assert.match(dashboard, /Todo al día/);
  assert.match(dashboard, /pendingTasks > 0/);
  assert.match(dashboard, /pendingPayments > 0/);
  assert.match(payments, />Cobros<\/h1>/);
});


test("el curso no duplica la navegación Volver que ya ofrece el breadcrumb", () => {
  const course = readFileSync(join(process.cwd(), "src", "app", "dashboard", "aula", "[courseId]", "page.tsx"), "utf8");
  assert.doesNotMatch(course, /Volver a cursos/);
});


test("Aula conserva visibles los cursos completados del estudiante", () => {
  const classroom = readFileSync(join(process.cwd(), "src", "app", "dashboard", "aula", "page.tsx"), "utf8");
  assert.match(classroom, /status: \{ in: \["ACTIVE", "COMPLETED"\] \}/);
});
