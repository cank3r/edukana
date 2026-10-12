import { test, expect } from "@playwright/test";
import { BASE_URL, IMAGE, NAMES, PASSWORD, USERS, day, emptyManifest } from "./fixtures";
import {
  activateInvitation, announcementPersists, coursePath, createPerson, formWith, freshLogin,
  hiddenId, idFromPath, login, logout, open, saveManifest,
} from "./helpers";

test("los seis bloques canónicos nacen en la interfaz y persisten entre sesiones", async ({ browser }) => {
  test.setTimeout(900_000);
  const contexts = await Promise.all(Object.keys(USERS).map(() => browser.newContext({
    baseURL: BASE_URL, locale: "es-DO", timezoneId: "UTC", viewport: { width: 1280, height: 900 },
  })));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  const [admin, teacher, student, parent] = pages;
  const manifest = emptyManifest();
  const done = async (block: number) => { manifest.completedBlocks.push(block); await saveManifest(manifest); };
  try {
    await test.step("1. Base vacía: setup protegido, institución y administrador persistentes", async () => {
      const denied = await admin.goto("/setup");
      expect(denied?.status()).toBe(404);
      const token = process.env.SETUP_TOKEN;
      if (!token || token.trim().length < 24) throw new Error("The isolated harness requires its synthetic SETUP_TOKEN.");
      await admin.goto(`/setup?token=${encodeURIComponent(token)}`);
      await admin.getByLabel("Nombre de la institución").fill(NAMES.institution);
      await admin.getByLabel("Identificador del espacio").fill(NAMES.slug);
      await admin.getByLabel("Nombre del administrador").fill(USERS.admin.name);
      await admin.getByLabel("Correo del administrador").fill(USERS.admin.email);
      await admin.getByLabel(/^Contraseña/).fill(PASSWORD);
      await admin.getByRole("button", { name: "Crear institución", exact: true }).click();
      await expect(admin.getByText(/Institución creada/)).toBeVisible();
      await admin.goto("/setup");
      await expect(admin).toHaveURL(/\/login(?:\?|$)/);
      await login(admin, USERS.admin);
      await freshLogin(admin, USERS.admin);
      await expect(admin.getByRole("heading", { name: NAMES.institution, exact: true })).toBeVisible();
      await done(1);
    });

    await test.step("2. Configuración, personas invitadas, período, permisos y departamento", async () => {
      await open(admin, "/dashboard/configuracion/institucion");
      await admin.getByLabel(/^Nombre de la institución/).fill(NAMES.institution);
      await admin.getByLabel("Zona horaria").selectOption("UTC");
      await admin.getByRole("button", { name: /^Guardar( cambios| y cambiar la zona horaria)$/ }).click();
      await expect(admin.getByRole("status").filter({ hasText: "Datos guardados." })).toBeVisible();
      await admin.reload();
      await expect(admin.getByLabel("Zona horaria")).toHaveValue("UTC");
      for (const [key, page, role] of [["teacher", teacher, "TEACHER"], ["student", student, "STUDENT"],
        ["parent", parent, "PARENT"]] as const) {
        manifest[`${key}Id`] = await createPerson(admin, USERS[key], role);
        await activateInvitation(page, USERS[key].email);
        await login(page, USERS[key]);
        await freshLogin(page, USERS[key]);
      }
      await open(admin, "/dashboard/configuracion/periodos");
      if (!(await admin.getByLabel("Nombre del período").isVisible())) {
        await admin.getByRole("button", { name: "Crear período", exact: true }).click();
      }
      await admin.getByLabel("Nombre del período").fill(NAMES.period);
      await admin.getByLabel("Empieza el").fill(day(-7));
      await admin.getByLabel("Termina el").fill(day(90));
      await admin.getByRole("button", { name: "Crear período", exact: true }).click();
      const period = admin.getByRole("listitem").filter({ has: admin.getByRole("heading", { name: NAMES.period }) });
      await expect(period).toBeVisible();
      if (await period.getByRole("button", { name: "Marcar como período actual" }).isVisible()) {
        await period.getByRole("button", { name: "Marcar como período actual" }).click();
        manifest.periodId = await hiddenId(period, "periodId");
        await period.getByRole("button", { name: "Sí, marcar como actual" }).click();
      }
      await open(admin, "/dashboard/configuracion/roles");
      await admin.getByLabel("Rol institucional").selectOption("TEACHER");
      for (const name of [/^Ver cursos\s/, /^Gestionar cursos\s/, /^Ver listas de estudiantes\s/, /^Ver horarios\s/]) {
        await expect(admin.getByRole("checkbox", { name })).toBeChecked();
      }
      await admin.getByLabel("Rol institucional").selectOption("PARENT");
      for (const name of [/^Ver cursos\s/, /^Ver personas\s/]) await expect(admin.getByRole("checkbox", { name })).not.toBeChecked();
      await open(admin, "/dashboard/configuracion/unidades");
      await admin.getByLabel("Nombre de la unidad", { exact: true }).fill(NAMES.unit);
      await admin.getByRole("button", { name: "Crear unidad", exact: true }).click();
      const unit = admin.locator("article").filter({ has: admin.getByLabel(`Nombre de ${NAMES.unit}`, { exact: true }) });
      manifest.unitId = await hiddenId(unit, "unitId");
      await unit.getByLabel("Asignar persona").selectOption(manifest.teacherId);
      await unit.getByRole("button", { name: "Asignar", exact: true }).click();
      await expect(unit.getByText(USERS.teacher.name, { exact: true })).toBeVisible();
      await admin.reload();
      await expect(admin.getByText(USERS.teacher.name, { exact: true })).toBeVisible();
      await done(2);
    });

    await test.step("3. Docente crea y publica curso, capítulo, actividad y tarea calificable", async () => {
      await open(teacher, "/dashboard/aula/nuevo");
      await teacher.getByLabel("Nombre del curso").fill(NAMES.course);
      const coursePeriod = teacher.getByRole("combobox", { name: /^Período/ });
      await coursePeriod.selectOption({ label: NAMES.period });
      manifest.periodId = await coursePeriod.inputValue();
      await teacher.getByText("Opciones avanzadas", { exact: true }).click();
      await teacher.getByLabel(/^Código/).fill(NAMES.courseCode);
      await teacher.getByRole("button", { name: "Crear curso", exact: true }).click();
      await teacher.waitForURL(/\/aula\/(?!nuevo)[^/?#]+$/);
      manifest.courseId = idFromPath(teacher.url(), "/aula/");
      await open(teacher, coursePath(manifest.courseId, "contenido"));
      await teacher.getByRole("button", { name: "Agregar el primer capítulo" }).click();
      await teacher.getByLabel("Título del capítulo").fill(NAMES.chapter);
      await teacher.getByRole("button", { name: "Guardar capítulo" }).click();
      const chapter = teacher.getByRole("listitem").filter({ has: teacher.getByRole("heading", { name: NAMES.chapter }) });
      await chapter.getByRole("button", { name: "Agregar lección" }).click();
      manifest.chapterId = await hiddenId(chapter, "chapterId");
      await teacher.getByLabel("Título de la lección").fill(NAMES.lesson);
      await teacher.getByLabel("Tipo de lección").selectOption("ACTIVITY");
      await teacher.getByLabel("Contenido", { exact: true }).fill("Lee esta actividad y escribe una reflexión personal.");
      await teacher.getByRole("button", { name: "Guardar lección" }).click();
      await teacher.getByLabel(`Más acciones de la lección ${NAMES.lesson}`, { exact: true }).click();
      await teacher.getByRole("button", { name: `Publicar lección ${NAMES.lesson}`, exact: true }).click();
      await expect(teacher.getByRole("button", { name: `Ocultar lección ${NAMES.lesson}`, exact: true })).toBeVisible();
      await teacher.getByLabel(`Más acciones del capítulo ${NAMES.chapter}`, { exact: true }).click();
      await teacher.getByRole("button", { name: `Publicar capítulo ${NAMES.chapter}`, exact: true }).click();
      await expect(teacher.getByRole("button", { name: `Ocultar capítulo ${NAMES.chapter}`, exact: true })).toBeVisible();
      await open(teacher, coursePath(manifest.courseId, "editar"));
      await teacher.getByRole("button", { name: "Publicar", exact: true }).click();
      await teacher.getByRole("button", { name: "Sí, publicar", exact: true }).click();
      await expect(teacher.getByRole("button", { name: "Pasar a borrador", exact: true })).toBeVisible();
      await open(teacher, coursePath(manifest.courseId, "calificaciones"));
      await teacher.getByRole("button", { name: "Usar configuración sencilla" }).click();
      await expect(teacher.getByText(/^Todavía no hay actividades calificables\./)).toBeVisible();
      await open(teacher, coursePath(manifest.courseId, "tareas"));
      await teacher.getByRole("button", { name: "Crear tarea", exact: true }).click();
      await teacher.getByLabel("Título", { exact: true }).fill(NAMES.assignment);
      await teacher.getByLabel("Instrucciones", { exact: true }).fill("Escribe una reflexión sobre la actividad canónica.");
      await teacher.getByLabel(/^Fecha y hora límite/).fill(`${day(7)}T12:00`);
      await teacher.getByLabel("¿Cuenta para la nota del curso?").selectOption({ label: "Notas del curso · General" });
      await teacher.getByLabel(/^Publicar ahora/).check();
      await teacher.getByRole("button", { name: "Guardar tarea", exact: true }).click();
      const assignment = teacher.getByRole("link", { name: NAMES.assignment, exact: true });
      await expect(assignment).toBeVisible();
      manifest.assignmentId = idFromPath((await assignment.getAttribute("href"))!, "/tareas/");
      await done(3);
    });

    await test.step("4. Administración inscribe y activa explícitamente el vínculo pendiente", async () => {
      await open(admin, coursePath(manifest.courseId, "estudiantes"));
      if (!(await admin.getByLabel("Busca por nombre o correo").isVisible())) {
        await admin.getByRole("button", { name: "Inscribir estudiantes", exact: true }).click();
      }
      await admin.getByLabel("Busca por nombre o correo").fill(USERS.student.email);
      await admin.getByRole("checkbox", { name: new RegExp(USERS.student.name) }).check();
      await admin.getByRole("button", { name: "Continuar con 1 estudiante", exact: true }).click();
      await admin.getByRole("button", { name: "Sí, inscribir a 1 estudiante", exact: true }).click();
      const enrollment = admin.locator(`a[href^="${coursePath(manifest.courseId, "estudiantes")}/"]`).first();
      await expect(enrollment).toBeVisible();
      manifest.enrollmentId = idFromPath((await enrollment.getAttribute("href"))!, "/estudiantes/");
      await open(admin, "/dashboard/configuracion/tutores");
      const form = formWith(admin, "Crear pendiente");
      await form.getByRole("combobox", { name: /^Tutor/ }).selectOption(manifest.parentId);
      await form.getByRole("combobox", { name: /^Estudiante/ }).selectOption(manifest.studentId);
      for (const label of ["Académico y calificaciones publicadas", "Asistencia", "Avisos relevantes"]) {
        await form.getByLabel(label, { exact: true }).check();
      }
      await expect(form.getByLabel("Finanzas del estudiante")).not.toBeChecked();
      await form.getByRole("button", { name: "Crear pendiente" }).click();
      const link = admin.locator("article").filter({ hasText: USERS.parent.name });
      manifest.guardianId = await hiddenId(link, "id");
      await open(parent, "/dashboard/hijos");
      await expect(parent.getByRole("heading", { name: "Todavía no tienes hijos vinculados" })).toBeVisible();
      await open(parent, `/dashboard/hijos/${manifest.studentId}`);
      await expect(parent.getByRole("heading", { name: "Recurso no encontrado", exact: true })).toBeVisible();
      await expect(parent.getByRole("heading", { name: USERS.student.name, exact: true })).toHaveCount(0);
      await expect(parent.getByRole("heading", { name: "Cursos y avance", exact: true })).toHaveCount(0);
      admin.once("dialog", (dialog) => dialog.accept());
      await link.getByRole("button", { name: "Activar vínculo", exact: true }).click();
      await expect(link.getByText("Vínculo activado explícitamente.")).toBeVisible();
      await parent.reload();
      await expect(parent.getByRole("heading", { name: USERS.student.name, exact: true })).toBeVisible();
      await done(4);
    });

    await test.step("5. Asistencia, progreso, entrega y nota sobreviven al cambio de sesión", async () => {
      const course = coursePath(manifest.courseId);
      await open(teacher, `${course}/asistencia?fecha=${manifest.attendanceDate}`);
      await teacher.getByRole("group", { name: USERS.student.name, exact: true }).getByRole("radio", { name: "Presente" }).check();
      await teacher.getByRole("button", { name: "Guardar asistencia", exact: true }).click();
      await expect(teacher.getByRole("heading", { name: "Corregir asistencia" })).toBeVisible();
      await freshLogin(teacher, USERS.teacher);
      await open(teacher, `${course}/asistencia?fecha=${manifest.attendanceDate}`);
      await expect(teacher.getByRole("group", { name: USERS.student.name, exact: true })
        .getByRole("radio", { name: "Presente", exact: true })).toBeChecked();
      await open(student, course);
      await student.getByRole("link", { name: new RegExp(NAMES.lesson) }).first().click();
      await student.waitForURL(/\/leccion\/[^/?#]+$/);
      manifest.lessonId = idFromPath(student.url(), "/leccion/");
      await student.getByRole("button", { name: "Terminar", exact: true }).click();
      await expect(student).toHaveURL(`${BASE_URL}${course}?completado=1`);
      await open(student, `${course}/tareas/${manifest.assignmentId}`);
      await student.getByRole("textbox", { name: /^Tu respuesta/ }).fill(NAMES.submission);
      await student.getByRole("button", { name: "Entregar tarea", exact: true }).click();
      await student.getByRole("button", { name: "Sí, entregar", exact: true }).click();
      await expect(student.getByText(/Entregada el/)).toBeVisible();
      await freshLogin(student, USERS.student);
      await open(student, `${course}/tareas/${manifest.assignmentId}`);
      await expect(student.getByRole("textbox", { name: /^Tu respuesta/ })).toHaveValue(NAMES.submission);
      await open(student, `${course}/leccion/${manifest.lessonId}`);
      await expect(student.getByText(/Completada el/)).toBeVisible();
      await open(teacher, `${course}/tareas/${manifest.assignmentId}`);
      await teacher.getByRole("link", { name: "Calificar", exact: true }).click();
      await teacher.waitForURL((url) => url.searchParams.has("entrega"));
      manifest.submissionId = new URL(teacher.url()).searchParams.get("entrega")!;
      await expect(teacher.getByText(NAMES.submission, { exact: true })).toBeVisible();
      await teacher.getByLabel(/^Nota \(de 0 a 100\)/).fill("92");
      await teacher.getByLabel("Comentario para el estudiante (opcional)").fill(NAMES.feedback);
      await teacher.getByRole("button", { name: "Guardar nota", exact: true }).click();
      await expect(teacher.getByRole("status")).toContainText(/Nota guardada/);
      await open(teacher, `${course}/calificaciones`);
      const item = teacher.getByRole("region", { name: "Actividades calificables", exact: true })
        .getByRole("listitem").filter({ hasText: NAMES.assignment });
      manifest.gradeItemId = await hiddenId(item, "gradeItemId");
      // A published assignment initially publishes its grade item too. Exercise the separate visibility control.
      await item.getByRole("button", { name: "Ocultar notas", exact: true }).click();
      await item.getByRole("button", { name: "Sí, ocultar", exact: true }).click();
      await expect(item.getByRole("button", { name: "Publicar notas", exact: true })).toBeVisible();
      await open(student, `${course}/mis-notas`);
      await expect(student).toHaveURL(`${BASE_URL}${course}/mis-notas`);
      await expect(student.getByRole("heading", { name: "Mis notas", exact: true })).toBeVisible();
      await expect(student.getByText(NAMES.feedback)).toHaveCount(0);
      await expect(student.getByText(NAMES.assignment, { exact: true })).toHaveCount(0);
      await expect(student.getByText(/\b92\b/)).toHaveCount(0);
      await open(parent, `/dashboard/hijos/${manifest.studentId}`);
      await expect(parent).toHaveURL(`${BASE_URL}/dashboard/hijos/${manifest.studentId}`);
      await expect(parent.getByRole("heading", { name: USERS.student.name, exact: true })).toBeVisible();
      const parentGrades = parent.getByRole("region", { name: "Notas", exact: true });
      await expect(parentGrades).toBeVisible();
      // The assignment can remain in Tareas, but its hidden grade item cannot appear in Notas.
      await expect(parentGrades.getByText(NAMES.assignment, { exact: true })).toHaveCount(0);
      await expect(parent.getByText(NAMES.feedback)).toHaveCount(0);
      await expect(parent.getByText(/\b92\b/)).toHaveCount(0);
      await item.getByRole("button", { name: "Publicar notas", exact: true }).click();
      await item.getByRole("button", { name: "Sí, publicar", exact: true }).click();
      await expect(item.getByRole("button", { name: "Ocultar notas", exact: true })).toBeVisible();
      await freshLogin(student, USERS.student);
      await open(student, `${course}/mis-notas`);
      await expect(student.getByText(NAMES.feedback)).toBeVisible();
      await expect(student.getByText(/92/).first()).toBeVisible();
      await open(student, `${course}/asistencia`);
      await expect(student.getByText("100 %", { exact: true })).toBeVisible();
      await freshLogin(parent, USERS.parent);
      await open(parent, `/dashboard/hijos/${manifest.studentId}`);
      await expect(parent.getByRole("progressbar", { name: `Avance en ${NAMES.course}` })).toHaveAttribute("aria-valuenow", "100");
      await expect(parent.locator('section[aria-labelledby="notas"]')).toContainText("92 / 100");
      await expect(parent.locator('section[aria-labelledby="asistencia"]')).toContainText("100 %");
      await done(5);
    });

    await test.step("6. Aviso segmentado, formato y archivo privado persisten para los cuatro roles", async () => {
      await open(admin, "/dashboard/comunidad");
      await admin.getByText("Publicar un aviso", { exact: true }).click();
      await admin.getByLabel("Título", { exact: true }).fill(NAMES.announcement);
      await admin.getByLabel("Mensaje", { exact: true }).fill("**Información importante**\n\n- Revisa tu actividad.\n- Conserva este aviso.");
      await admin.getByRole("radio", { name: /^Un curso/ }).check();
      await admin.getByLabel("¿Cuál curso?").selectOption(manifest.courseId);
      await admin.getByText("Opciones avanzadas", { exact: true }).click();
      await admin.getByLabel("Botón o enlace destacado").fill("https://example.test/piloto");
      await admin.locator('input[type="file"]').setInputFiles({ name: NAMES.image, mimeType: "image/png", buffer: IMAGE });
      await expect(admin.getByRole("button", { name: "Retirar", exact: true })).toBeVisible();
      await admin.getByRole("button", { name: "Revisar y publicar", exact: true }).click();
      await admin.getByRole("button", { name: "Publicar aviso", exact: true }).click();
      const card = admin.locator("article").filter({ has: admin.getByRole("heading", { name: NAMES.announcement, exact: true }) });
      await expect(card).toBeVisible();
      manifest.assetId = idFromPath((await card.getByAltText(NAMES.image).getAttribute("src"))!, "/api/assets/");
      await card.getByRole("button", { name: "Editar", exact: true }).click();
      manifest.announcementId = await hiddenId(card, "id");
      await card.getByRole("button", { name: "Cancelar", exact: true }).click();
      for (const [page, user] of [[admin, USERS.admin], [teacher, USERS.teacher], [student, USERS.student], [parent, USERS.parent]] as const) {
        await freshLogin(page, user);
        await announcementPersists(page, manifest.assetId);
      }
      await done(6);
    });
    expect(manifest.completedBlocks).toEqual([1, 2, 3, 4, 5, 6]);
    for (const page of pages) await logout(page);
  } catch (error) {
    // Keep the actual failing UI before disposing the isolated sessions.
    // Attachments stay in the harness's private evidence directory.
    await Promise.allSettled(pages.map(async (page, index) => {
      if (page.isClosed() || page.url() === "about:blank") return;
      await test.info().attach(`core-failure-${Object.keys(USERS)[index]}`, {
        body: await page.screenshot({ fullPage: true, animations: "disabled" }),
        contentType: "image/png",
      });
    }));
    throw error;
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
