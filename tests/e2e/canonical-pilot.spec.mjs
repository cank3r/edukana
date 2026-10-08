import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  handlePreviewProtectionRoute,
  loadCanonicalPilotConfig,
} from "../../scripts/canonical-pilot-config.mjs";

const pilot = loadCanonicalPilotConfig();
const period = { name: pilot.artifacts.periodName, start: "2026-09-01", end: "2027-06-30" };
const course = { name: pilot.artifacts.courseName, code: pilot.artifacts.courseCode };
const announcementTitle = pilot.artifacts.announcementTitle;
const unitName = pilot.artifacts.unitName;
const sectionTitle = pilot.artifacts.sectionTitle;
const lessonTitle = pilot.artifacts.lessonTitle;
const assignmentTitle = pilot.artifacts.assignmentTitle;
let createdCourseId = "";

function personEmailOptionLabel(user) {
  return `${user.name} · ${user.email}`;
}

function personRoleOptionLabel(user, role) {
  return `${user.name} · ${role}`;
}

async function selectPickerCourseByCode(fieldset, code) {
  await fieldset.getByRole("searchbox").fill(code);
  const option = fieldset.locator("label").filter({ hasText: code });
  await expect(option, `El picker debe contener exactamente el curso ${code}.`).toHaveCount(1);
  await option.getByRole("checkbox").check();
}

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => handlePreviewProtectionRoute(route, pilot.expectedHost));
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
  await page.getByLabel("Contraseña").fill(email === pilot.users.admin.email ? pilot.adminPassword : pilot.userPassword);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\/|$)/);
}

async function preflightExistingInstitution(page) {
  await login(page, pilot.users.admin.email);
  const result = await page.evaluate(async (input) => {
    const response = await fetch("/api/pilot-preflight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return { status: response.status, body: await response.json() };
  }, {
    institutionSlug: pilot.institution.slug,
    emails: [pilot.users.teacher.email, pilot.users.student.email, pilot.users.parent.email],
    unitName,
    courseName: course.name,
    courseCode: course.code,
  });

  expect(result.status, `Preflight aditivo rechazado: ${JSON.stringify(result.body)}`).toBe(200);
  expect(result.body).toEqual({
    safe: true,
    activePeriodCount: expect.any(Number),
    conflicts: { emails: [], unitName: false, courseName: false, courseCode: false },
  });
  expect(result.body.activePeriodCount).toBeGreaterThan(0);
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
  await form.getByLabel("Contraseña temporal").fill(pilot.userPassword);
  await form.getByRole("button", { name: "Crear usuario" }).click();
  await expect(page.getByText("Usuario creado. Ya puede iniciar sesión con estas credenciales.").last()).toBeVisible();
}

async function openCourse(page) {
  expect(createdCourseId, "El runner debe capturar el ID del curso antes de abrirlo.").not.toBe("");
  await gotoApp(page, `/dashboard/aula/${createdCourseId}`);
  await expect(page.getByRole("heading", { name: course.name, level: 1 })).toBeVisible();
}

async function assertDenied(page, path) {
  await gotoApp(page, path);
  await expect(page).not.toHaveURL(new RegExp(`${path.replaceAll("/", "\\/")}(?:\\?|$)`));
}

test("piloto canónico desplegado funciona de extremo a extremo", async ({ page }) => {
  test.setTimeout(900_000);

  await test.step(pilot.mode === "bootstrap" ? "base vacía, institución y administrador" : "institución existente verificada sin escrituras", async () => {
    if (pilot.mode === "existing") {
      await preflightExistingInstitution(page);
      return;
    }

    await gotoApp(page, "/setup");
    await expect(page.getByRole("button", { name: "Crear institución" })).toBeVisible();
    await page.getByLabel("Nombre de la institución").fill(pilot.institution.name);
    await page.getByLabel("Identificador del espacio").fill(pilot.institution.slug);
    await page.getByLabel("Nombre del administrador").fill(pilot.users.admin.name);
    await page.getByLabel("Correo del administrador").fill(pilot.users.admin.email);
    await page.getByLabel("Contraseña").fill(pilot.adminPassword);
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

    if (pilot.mode === "bootstrap") {
      const periodForm = formWithButton(page, "Crear período");
      await periodForm.getByLabel("Nombre").fill(period.name);
      await periodForm.getByLabel("Inicio").fill(period.start);
      await periodForm.getByLabel("Fin").fill(period.end);
      await periodForm.getByRole("button", { name: "Crear período" }).click();
      await expect(page.getByText("Período académico creado y activado.")).toBeVisible();
    }

    await gotoApp(page, "/dashboard/configuracion/unidades");
    await page.getByLabel("Nombre de la unidad").fill(unitName);
    await page.getByRole("button", { name: "Crear unidad" }).click();
    await expect(page.getByText("Unidad creada.")).toBeVisible();
    const unit = page.locator("article").filter({ hasText: unitName });
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
    const periodSelect = courseForm.getByLabel("Período activo");
    if (pilot.mode === "bootstrap") {
      await periodSelect.selectOption({ label: period.name });
    } else {
      expect(await periodSelect.locator("option:not([disabled])").count(), "Staging necesita al menos un período activo.").toBeGreaterThan(0);
      await periodSelect.selectOption({ index: 1 });
    }
    await courseForm.getByLabel("Nombre del curso").fill(course.name);
    await courseForm.getByLabel("Código").fill(course.code);
    await courseForm.getByLabel("Descripción").fill(`Curso real y acotado para validar el MVP completo${pilot.runId ? ` (${pilot.runId})` : ""}.`);
    await courseForm.getByRole("button", { name: "Crear curso" }).click();
    const courseStatus = courseForm.getByRole("status");
    await expect(courseStatus).toContainText(/Curso creado/i);
    const idMatch = (await courseStatus.textContent())?.match(/ID:\s*([A-Za-z0-9_-]+)/);
    expect(idMatch?.[1], "La creación del curso debe devolver su ID autoritativo.").toBeTruthy();
    createdCourseId = idMatch[1];
    await openCourse(page);

    await page.getByText("Nueva sección", { exact: true }).click();
    const sectionForm = formWithButton(page, "Crear sección");
    await sectionForm.getByLabel("Título de la sección").fill(sectionTitle);
    await sectionForm.getByLabel("Descripción").fill(`Primera sección del piloto${pilot.runId ? ` ${pilot.runId}` : ""}`);
    await sectionForm.getByRole("button", { name: "Crear sección" }).click();
    await expect(page.getByRole("heading", { name: sectionTitle })).toBeVisible();

    await page.getByText("Agregar lección", { exact: true }).click();
    const lessonForm = formWithButton(page, "Crear lección");
    await lessonForm.getByLabel("Título de la lección").fill(lessonTitle);
    await lessonForm.getByLabel("Resumen").fill(`Actividad verificable${pilot.runId ? ` ${pilot.runId}` : ""}`);
    await lessonForm.getByLabel("Tipo").selectOption("ACTIVITY");
    await lessonForm.getByLabel("Contenido").fill("Completa esta actividad para registrar tu progreso.");
    await lessonForm.getByRole("button", { name: "Crear lección" }).click();
    await expect(page.getByText(lessonTitle).last()).toBeVisible();

    const gradebookForm = formWithButton(page, "Crear libro de calificaciones");
    await gradebookForm.getByRole("button", { name: "Crear libro de calificaciones" }).click();
    await expect(page.getByText("Primer período").last()).toBeVisible();

    await page.getByText("Nueva asignación", { exact: true }).click();
    const assignmentForm = formWithButton(page, "Crear tarea");
    await assignmentForm.getByLabel("Título").fill(assignmentTitle);
    await assignmentForm.getByLabel("Categoría").selectOption({ label: "Asignaciones" });
    await assignmentForm.getByLabel("Instrucciones").fill(`Entrega una reflexión breve sobre ${lessonTitle}.`);
    await assignmentForm.getByLabel("Entrega").fill("2026-11-01T12:00");
    await assignmentForm.getByRole("button", { name: "Crear tarea" }).click();
    await expect(page.getByRole("heading", { name: assignmentTitle })).toBeVisible();
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
    const guardianshipCard = page.locator("article").filter({ hasText: `${pilot.users.parent.name} → ${pilot.users.student.name}` });
    await expect(guardianshipCard).toHaveCount(1);
    page.once("dialog", (dialog) => dialog.accept());
    await guardianshipCard.getByRole("button", { name: "Activar vínculo" }).click();
    await expect(guardianshipCard.getByText("Vínculo activado explícitamente.")).toBeVisible();
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
    await submissionForm.getByLabel("Tu entrega").fill(pilot.artifacts.submissionText);
    await submissionForm.getByRole("button", { name: "Entregar tarea" }).click();
    await expect(page.getByText(/entrega.*registrada|tarea.*entregada/i).last()).toBeVisible();
    await logout(page);
    await login(page, pilot.users.student.email);
    await openCourse(page);
    await expect(page.getByText(pilot.artifacts.submissionText)).toBeVisible();

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
    await selectPickerCourseByCode(targetCourses, course.code);
    const relatedCourses = page.locator("fieldset").filter({ hasText: "Cursos relacionados" });
    await selectPickerCourseByCode(relatedCourses, course.code);
    await page.getByLabel("Botón o enlace destacado").fill("https://example.com/piloto");
    await page.getByLabel("Insertar una mención en el mensaje").selectOption({ label: personRoleOptionLabel(pilot.users.teacher, "Docente") });

    const fixtureDir = join(pilot.scratch, "edukana-canonical-pilot-fixtures");
    await mkdir(fixtureDir, { recursive: true });
    const imagePath = join(fixtureDir, pilot.artifacts.imageName);
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
      await expect(page.getByAltText(pilot.artifacts.imageName)).toBeVisible();
    }
  });

  console.log("PASS: piloto desplegado completo. Pendientes fuera de este runner: segundo tenant y destinatario externo a la audiencia.");
});
