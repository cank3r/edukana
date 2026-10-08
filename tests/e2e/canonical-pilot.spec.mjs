import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  getPreviewProtectionHeadersForUrl,
  loadCanonicalPilotConfig,
} from "../../scripts/canonical-pilot-config.mjs";

const pilot = loadCanonicalPilotConfig();
const period = { name: "Año escolar piloto", start: "2026-09-01", end: "2027-06-30" };
const course = { name: "Curso Piloto", code: "PIL-101" };
const announcementTitle = "Aviso del curso piloto";

function personEmailOptionLabel(user) {
  return `${user.name} · ${user.email}`;
}

function personRoleOptionLabel(user, role) {
  return `${user.name} · ${role}`;
}

test.beforeEach(async ({ page }) => {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const protectionHeaders = getPreviewProtectionHeadersForUrl(request.url(), pilot.expectedHost);
    if (!Object.keys(protectionHeaders).length) {
      await route.continue();
      return;
    }
    await route.continue({ headers: { ...request.headers(), ...protectionHeaders } });
  });
});

async function gotoApp(page, path) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response, `Sin respuesta al abrir ${path}`).not.toBeNull();
  expect(response.status(), `HTTP ${response.status()} al abrir ${path}`).toBeLessThan(500);
  await expect(page.getByText(/Authentication Required|Log in to Vercel/i)).toHaveCount(0);
}

function formWithButton(page, name) {
  return page.locator("form").filter({ has: page.getByRole("button", { name, exact: true }) });
}

async function login(page, email) {
  await gotoApp(page, "/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(pilot.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\/|$)/);
}

async function logout(page) {
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
}

async function createPilotUser(page, user, role) {
  const form = formWithButton(page, "Crear usuario");
  await form.getByLabel("Nombre completo").fill(user.name);
  await form.getByLabel("Correo").fill(user.email);
  await form.getByLabel("Rol").selectOption(role);
  await form.getByLabel("Contraseña temporal").fill(pilot.password);
  await form.getByRole("button", { name: "Crear usuario" }).click();
  await expect(page.getByText("Usuario creado. Ya puede iniciar sesión con estas credenciales.").last()).toBeVisible();
}

async function openCourse(page) {
  await gotoApp(page, "/dashboard/aula");
  await page.getByRole("link", { name: new RegExp(course.name) }).click();
  await expect(page.getByRole("heading", { name: course.name, level: 1 })).toBeVisible();
}

async function assertDenied(page, path) {
  await gotoApp(page, path);
  await expect(page).not.toHaveURL(new RegExp(`${path.replaceAll("/", "\\/")}(?:\\?|$)`));
}

test("piloto canónico desplegado funciona de extremo a extremo", async ({ page }) => {
  test.setTimeout(900_000);

  await test.step("base vacía, institución y administrador", async () => {
    await gotoApp(page, "/setup");
    await expect(page.getByRole("button", { name: "Crear institución" })).toBeVisible();
    await page.getByLabel("Nombre de la institución").fill(pilot.institution.name);
    await page.getByLabel("Identificador del espacio").fill(pilot.institution.slug);
    await page.getByLabel("Nombre del administrador").fill(pilot.users.admin.name);
    await page.getByLabel("Correo del administrador").fill(pilot.users.admin.email);
    await page.getByLabel("Contraseña").fill(pilot.password);
    await page.getByRole("button", { name: "Crear institución" }).click();
    await expect(page.getByText(/Institución creada/)).toBeVisible();
    await gotoApp(page, "/setup");
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await login(page, pilot.users.admin.email);
    await logout(page);
    await login(page, pilot.users.admin.email);
  });

  await test.step("cuentas, período y departamento", async () => {
    await gotoApp(page, "/dashboard/configuracion/puesta-en-marcha");
    await createPilotUser(page, pilot.users.teacher, "TEACHER");
    await createPilotUser(page, pilot.users.student, "STUDENT");
    await createPilotUser(page, pilot.users.parent, "PARENT");

    const periodForm = formWithButton(page, "Crear período");
    await periodForm.getByLabel("Nombre").fill(period.name);
    await periodForm.getByLabel("Inicio").fill(period.start);
    await periodForm.getByLabel("Fin").fill(period.end);
    await periodForm.getByRole("button", { name: "Crear período" }).click();
    await expect(page.getByText("Período académico creado y activado.")).toBeVisible();

    await gotoApp(page, "/dashboard/configuracion/unidades");
    await page.getByLabel("Nombre de la unidad").fill("Departamento Académico");
    await page.getByRole("button", { name: "Crear unidad" }).click();
    await expect(page.getByText("Unidad creada.")).toBeVisible();
    const unit = page.locator("article").filter({ hasText: "Departamento Académico" });
    await unit.getByLabel("Asignar persona").selectOption({ label: personRoleOptionLabel(pilot.users.teacher, "Docente") });
    await unit.getByRole("button", { name: "Asignar" }).click();
    await expect(page.getByText("Miembro asignado.")).toBeVisible();
  });

  await test.step("docente crea curso, contenido y evaluación", async () => {
    await logout(page);
    await login(page, pilot.users.teacher.email);
    await assertDenied(page, "/dashboard/configuracion/puesta-en-marcha");
    await gotoApp(page, "/dashboard/aula");
    const courseForm = formWithButton(page, "Crear curso");
    await courseForm.getByLabel("Período activo").selectOption({ label: period.name });
    await courseForm.getByLabel("Nombre del curso").fill(course.name);
    await courseForm.getByLabel("Código").fill(course.code);
    await courseForm.getByLabel("Descripción").fill("Curso real y acotado para validar el MVP completo.");
    await courseForm.getByRole("button", { name: "Crear curso" }).click();
    await expect(page.getByText(/Curso creado/i).last()).toBeVisible();
    await openCourse(page);

    await page.getByText("Nueva sección", { exact: true }).click();
    const sectionForm = formWithButton(page, "Crear sección");
    await sectionForm.getByLabel("Título de la sección").fill("Fundamentos");
    await sectionForm.getByLabel("Descripción").fill("Primera sección del piloto");
    await sectionForm.getByRole("button", { name: "Crear sección" }).click();
    await expect(page.getByRole("heading", { name: "Fundamentos" })).toBeVisible();

    await page.getByText("Agregar lección", { exact: true }).click();
    const lessonForm = formWithButton(page, "Crear lección");
    await lessonForm.getByLabel("Título de la lección").fill("Actividad inicial");
    await lessonForm.getByLabel("Resumen").fill("Actividad verificable");
    await lessonForm.getByLabel("Tipo").selectOption("ACTIVITY");
    await lessonForm.getByLabel("Contenido").fill("Completa esta actividad para registrar tu progreso.");
    await lessonForm.getByRole("button", { name: "Crear lección" }).click();
    await expect(page.getByText("Actividad inicial").last()).toBeVisible();

    const gradebookForm = formWithButton(page, "Crear libro de calificaciones");
    await gradebookForm.getByRole("button", { name: "Crear libro de calificaciones" }).click();
    await expect(page.getByText("Primer período").last()).toBeVisible();

    await page.getByText("Nueva asignación", { exact: true }).click();
    const assignmentForm = formWithButton(page, "Crear tarea");
    await assignmentForm.getByLabel("Título").fill("Entrega del piloto");
    await assignmentForm.getByLabel("Categoría").selectOption({ label: "Asignaciones" });
    await assignmentForm.getByLabel("Instrucciones").fill("Entrega una reflexión breve sobre la actividad inicial.");
    await assignmentForm.getByLabel("Entrega").fill("2026-11-01T12:00");
    await assignmentForm.getByRole("button", { name: "Crear tarea" }).click();
    await expect(page.getByRole("heading", { name: "Entrega del piloto" })).toBeVisible();
  });

  await test.step("administración matricula y activa tutor", async () => {
    await logout(page);
    await login(page, pilot.users.admin.email);
    await openCourse(page);
    await page.getByText("Matricular estudiante", { exact: true }).click();
    const enrollmentForm = formWithButton(page, "Matricular estudiante");
    await enrollmentForm.getByLabel("Estudiante").selectOption({ label: pilot.users.student.name });
    await enrollmentForm.getByRole("button", { name: "Matricular estudiante" }).click();
    await expect(page.getByText(pilot.users.student.email)).toBeVisible();

    await gotoApp(page, "/dashboard/configuracion/tutores");
    const guardianForm = formWithButton(page, "Crear pendiente");
    await guardianForm.getByLabel("Tutor").selectOption({ label: personEmailOptionLabel(pilot.users.parent) });
    await guardianForm.getByLabel("Estudiante").selectOption({ label: personEmailOptionLabel(pilot.users.student) });
    await guardianForm.getByLabel("Académico y calificaciones publicadas").check();
    await guardianForm.getByLabel("Asistencia").check();
    await guardianForm.getByLabel("Avisos relevantes").check();
    await guardianForm.getByRole("button", { name: "Crear pendiente" }).click();
    await expect(page.getByText(/Vínculo creado como pendiente/)).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Activar vínculo" }).click();
    await expect(page.getByText("Vínculo activado explícitamente.")).toBeVisible();
  });

  await test.step("asistencia, entrega, persistencia y nota", async () => {
    await logout(page);
    await login(page, pilot.users.teacher.email);
    await openCourse(page);
    await page.getByText("Tomar asistencia", { exact: true }).click();
    const attendanceForm = formWithButton(page, "Registrar asistencia");
    await attendanceForm.getByLabel("Fecha").fill("2026-10-07");
    await attendanceForm.getByLabel(`Asistencia de ${pilot.users.student.name}`).selectOption("PRESENT");
    await attendanceForm.getByRole("button", { name: "Registrar asistencia" }).click();
    await expect(page.getByText(/Asistencia registrada/i).last()).toBeVisible();

    await logout(page);
    await login(page, pilot.users.student.email);
    await openCourse(page);
    await page.getByRole("button", { name: "Marcar como completada" }).click();
    const submissionForm = formWithButton(page, "Entregar tarea");
    await submissionForm.getByLabel("Tu entrega").fill("Reflexión persistente del estudiante piloto.");
    await submissionForm.getByRole("button", { name: "Entregar tarea" }).click();
    await expect(page.getByText(/entrega.*registrada|tarea.*entregada/i).last()).toBeVisible();
    await logout(page);
    await login(page, pilot.users.student.email);
    await openCourse(page);
    await expect(page.getByText("Reflexión persistente del estudiante piloto.")).toBeVisible();

    await logout(page);
    await login(page, pilot.users.teacher.email);
    await openCourse(page);
    const reviewForm = formWithButton(page, "Calificar entrega");
    await reviewForm.getByLabel(/Nota \/ 100/).fill("92");
    await reviewForm.getByLabel("Retroalimentación").fill("Trabajo aprobado");
    await reviewForm.getByRole("button", { name: "Calificar entrega" }).click();
    await expect(page.getByText(/Entrega calificada/i).last()).toBeVisible();
    const periodCard = page.locator("article").filter({ hasText: "Primer período" }).last();
    await periodCard.getByRole("button", { name: "Publicar" }).click();
    await expect(page.getByText(/publicad/i).last()).toBeVisible();
    await page.getByRole("button", { name: "Finalizar curso" }).click();
    await expect(page.getByText(/curso finalizado|matrícula completada/i).last()).toBeVisible();

    await logout(page);
    await login(page, pilot.users.student.email);
    await openCourse(page);
    await expect(page.getByText(/92\/100|92%/).first()).toBeVisible();
    await expect(page.getByText("Curso completado.")).toBeVisible();
  });

  await test.step("tutor ve solo al estudiante vinculado", async () => {
    await logout(page);
    await login(page, pilot.users.parent.email);
    await gotoApp(page, "/dashboard/hijos");
    await expect(page.getByText(pilot.users.student.name)).toBeVisible();
    await expect(page.getByText(course.name)).toBeVisible();
    await assertDenied(page, "/dashboard/aula");
    await assertDenied(page, "/dashboard/configuracion");
  });

  await test.step("anuncio multimedia persiste para la audiencia autorizada", async () => {
    await logout(page);
    await login(page, pilot.users.admin.email);
    await gotoApp(page, "/dashboard/comunidad");
    await page.getByText("Crear anuncio", { exact: true }).click();
    await page.getByLabel("Título").fill(announcementTitle);
    await page.getByLabel("Mensaje").fill("## Información importante\n\n- Revisa la actividad del curso piloto.\n- Conserva este aviso para referencia.");
    const targetCourses = page.locator("fieldset").filter({ hasText: "Cursos destinatarios" });
    await targetCourses.getByRole("checkbox", { name: new RegExp(course.name) }).check();
    const relatedCourses = page.locator("fieldset").filter({ hasText: "Cursos relacionados" });
    await relatedCourses.getByRole("checkbox", { name: new RegExp(course.name) }).check();
    await page.getByLabel("Botón o enlace destacado").fill("https://example.com/piloto");
    await page.getByLabel("Insertar una mención en el mensaje").selectOption({ label: personRoleOptionLabel(pilot.users.teacher, "Docente") });

    const fixtureDir = join(pilot.scratch, "edukana-canonical-pilot-fixtures");
    await mkdir(fixtureDir, { recursive: true });
    const imagePath = join(fixtureDir, "aviso-piloto.png");
    await writeFile(imagePath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nH0AAAAASUVORK5CYII=", "base64"));
    await page.locator('input[type="file"][accept*="image/png"]').setInputFiles(imagePath);
    await expect(page.getByRole("button", { name: "Retirar" })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Revisar anuncio" }).click();
    await expect(page.getByRole("heading", { name: "Confirma antes de publicar" })).toBeVisible();
    await page.getByRole("button", { name: "Confirmar publicación" }).click();
    await expect(page.getByText("Anuncio publicado correctamente.")).toBeVisible();

    for (const user of [pilot.users.teacher, pilot.users.student, pilot.users.parent]) {
      await logout(page);
      await login(page, user.email);
      await gotoApp(page, "/dashboard/comunidad");
      await expect(page.getByRole("heading", { name: announcementTitle })).toBeVisible();
      await expect(page.getByAltText("aviso-piloto.png")).toBeVisible();
    }
  });

  console.log("PASS: piloto desplegado completo. Pendientes fuera de este runner: segundo tenant y destinatario externo a la audiencia.");
});
