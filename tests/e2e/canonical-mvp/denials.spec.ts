import { expect, test } from "@playwright/test";
import { activateInvitation, createPerson, readManifest } from "./helpers";
import {
  assetStatus, attachTeacherFile, captureAction, createForeignSpace, createOpenAssignment, createOpenExam,
  deniedAction, deniedPage, guardianCard, issuedLocalUrl, sessionPage, setGuardianFlag, setTeacherCourseAccess, waitForRealExpiry,
} from "./denial-helpers";

// Default (not serial): a failure restarts its worker but does not skip the remaining negative cases.
test.describe.configure({ mode: "default" });
test.setTimeout(180_000);

test("rutas ocultas deniegan acceso directo con sesiones reales de los tres roles", async ({ browser }) => {
  const m = await readManifest();
  for (const [user, paths] of [
    [m.users.teacher, ["/dashboard/configuracion", "/dashboard/gestion", "/dashboard/pagos"]],
    [m.users.student, ["/dashboard/configuracion", "/dashboard/gestion", `/dashboard/aula/${m.courseId}/estudiantes`]],
    [m.users.parent, ["/dashboard/aula", "/dashboard/configuracion", "/dashboard/gestion"]],
  ] as const) {
    const page = await sessionPage(browser, user);
    try { for (const path of paths) await test.step(`${user.name}: ${path}`, () => deniedPage(page, path)); }
    finally { await page.context().close(); }
  }
});

test("otra institución no accede a curso/persona/archivo ni altera unidad o vínculo de A", async ({ browser }) => {
  const m = await readManifest();
  const foreignContext = await browser.newContext({ baseURL: "http://127.0.0.1:3160" });
  const foreign = await foreignContext.newPage();
  const admin = await sessionPage(browser, m.users.admin);
  try {
    await test.step("Crear B por UI y comprobar su perfil y sesión propios", () => createForeignSpace(foreign));
    await test.step("B no puede leer curso, persona ni archivo de A", async () => {
      await deniedPage(foreign, `/dashboard/aula/${m.courseId}`, m.names.course);
      await deniedPage(foreign, `/dashboard/gestion/personas/${m.studentId}`, m.users.student.name);
      expect(await assetStatus(foreign, m.assetId)).toBe(404);
    });
    await admin.goto("/dashboard/configuracion/unidades");
    const unit = admin.locator("article").filter({ has: admin.locator(`input[name="unitId"][value="${m.unitId}"]`) });
    const request = await test.step("Capturar la acción propia de renombrar unidad de A", async () => {
      const action = await captureAction(admin, () => unit.getByRole("button", { name: "Guardar nombre", exact: true }).click());
      await expect(unit.getByRole("status")).toContainText("Unidad renombrada");
      return action;
    });
    await test.step("Reproducir renombrado con sesión B y verificar unidad intacta", async () => {
      await deniedAction(foreign, request, /Unidad no encontrada/, [m.names.unit, "Cambio externo prohibido"]);
      await admin.reload();
      await expect(admin.locator(`input[id="unit-name-${m.unitId}"]`)).toHaveValue(m.names.unit);
    });
    await admin.goto("/dashboard/configuracion/tutores");
    const card = guardianCard(admin, m.guardianId);
    const flag = card.getByRole("checkbox", { name: "Horario", exact: true });
    const before = await flag.isChecked();
    try {
      await flag.setChecked(!before);
      const update = await test.step("Capturar cambio autorizado del vínculo en A", async () => {
        const action = await captureAction(admin, () => card.getByRole("button", { name: "Guardar permisos", exact: true }).click());
        await expect(card.getByRole("status")).toContainText("Permisos del vínculo actualizados");
        await admin.reload();
        await expect(flag).toBeChecked({ checked: !before });
        return action;
      });
      await test.step("B intenta el valor contrario y el vínculo de A permanece intacto", async () => {
        await deniedAction(foreign, update, /Vínculo no encontrado o revocado/, [
          JSON.stringify([{ flag: "canViewSchedule", enabled: !before }]),
          JSON.stringify([{ flag: "canViewSchedule", enabled: before }]),
        ]);
        await admin.reload();
        await expect(flag).toBeChecked({ checked: !before });
      });
    } finally {
      await admin.goto("/dashboard/configuracion/tutores");
      await setGuardianFlag(guardianCard(admin, m.guardianId), "Horario", before);
    }
  } finally { await Promise.allSettled([foreignContext.close(), admin.context().close()]); }
});

test("audiencia del curso, privacidad entre compañeros y tutor sin vínculo", async ({ browser }) => {
  const m = await readManifest();
  const tag = Date.now();
  const outsider = { name: "Estudiante fuera del curso", email: `outsider-${tag}@canonical.example.test` };
  const admin = await sessionPage(browser, m.users.admin);
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:3160" });
  const page = await context.newPage();
  try {
    const outsiderId = await createPerson(admin, outsider, "STUDENT");
    await activateInvitation(page, outsider.email);
    // The invitation helper finishes password activation, not an assumed authenticated session.
    const { login } = await import("./helpers");
    await login(page, outsider);
    await page.goto("/dashboard/comunidad");
    await expect(page.getByRole("heading", { name: m.names.announcement, exact: true })).toHaveCount(0);
    expect(await assetStatus(page, m.assetId)).toBe(403);
    await deniedPage(page, `/dashboard/aula/${m.courseId}`, m.names.course);

    // Establish a real second classmate before checking that the original student's views hide it.
    await admin.goto(`/dashboard/aula/${m.courseId}/estudiantes`);
    if (!(await admin.getByLabel("Busca por nombre o correo").isVisible())) {
      await admin.getByRole("button", { name: "Inscribir estudiantes", exact: true }).click();
    }
    await admin.getByLabel("Busca por nombre o correo").fill(outsider.email);
    await admin.getByRole("checkbox", { name: new RegExp(outsider.name) }).check();
    await admin.getByRole("button", { name: "Continuar con 1 estudiante", exact: true }).click();
    await admin.getByRole("button", { name: "Sí, inscribir a 1 estudiante", exact: true }).click();
    const enrolled = admin.getByRole("region", { name: /^Inscritos \(/ });
    await expect(enrolled.getByText(outsider.email, { exact: true })).toBeVisible();
    await admin.reload();
    await expect(enrolled.getByText(outsider.name, { exact: true })).toBeVisible();
    await expect(enrolled.getByText(outsider.email, { exact: true })).toBeVisible();
    await page.goto(`/dashboard/aula/${m.courseId}`);
    await expect(page.getByRole("heading", { name: m.names.course, exact: true })).toBeVisible();

    const original = await sessionPage(browser, m.users.student);
    const parent = await sessionPage(browser, m.users.parent);
    try {
      for (const [suffix, heading] of [["", m.names.course], ["/mis-notas", "Mis notas"], ["/asistencia", "Mi asistencia"]] as const) {
        await test.step(`El estudiante original no ve datos del compañero en ${suffix || "curso"}`, async () => {
          await original.goto(`/dashboard/aula/${m.courseId}${suffix}`);
          await expect(original.getByRole("heading", { name: heading, exact: true })).toBeVisible();
          await expect.soft(original.locator("body")).not.toContainText(outsider.name);
          await expect.soft(original.locator("body")).not.toContainText(outsider.email);
        });
      }
      await parent.goto(`/dashboard/hijos/${m.studentId}`);
      await expect(parent.getByRole("heading", { name: m.users.student.name, exact: true })).toBeVisible();
      await deniedPage(parent, `/dashboard/hijos/${outsiderId}`, outsider.name);
      await expect.soft(parent.locator("body")).not.toContainText(outsider.email);
    } finally { await original.context().close(); await parent.context().close(); }
  } finally { await context.close(); await admin.context().close(); }
});

test("finalizar matrícula rechaza formularios abiertos de tarea, progreso y examen sin alterar evidencia", async ({ browser }) => {
  const m = await readManifest();
  const teacher = await sessionPage(browser, m.users.teacher);
  const student = await sessionPage(browser, m.users.student);
  const lesson = await student.context().newPage();
  const exam = await student.context().newPage();
  const resubmission = await student.context().newPage();
  try {
    const assignmentPath = await createOpenAssignment(teacher, m.courseId);
    const resubmissionPath = await createOpenAssignment(teacher, m.courseId);
    const examId = await createOpenExam(teacher, m.courseId);
    const initialAnswer = "Esta primera entrega sin calificar debe conservarse después de finalizar el curso.";
    const rejectedAnswer = "Este reenvío posterior al cierre no debe reemplazar la entrega ni crear una versión.";
    await resubmission.goto(resubmissionPath);
    await resubmission.getByRole("textbox", { name: /^Tu respuesta/ }).fill(initialAnswer);
    await resubmission.getByRole("button", { name: "Entregar tarea", exact: true }).click();
    await resubmission.getByRole("button", { name: "Sí, entregar", exact: true }).click();
    await expect(resubmission.locator("main").getByRole("status")).toHaveText("Tarea entregada. Tu docente ya puede verla.");
    await resubmission.reload();
    const ownDelivery = resubmission.getByRole("region", { name: "Tu entrega", exact: true });
    await expect(ownDelivery.getByRole("textbox", { name: /^Tu respuesta/ })).toHaveValue(initialAnswer);
    const ownDeliveryMetadata = ownDelivery.locator("p").filter({ hasText: /^Entregada el / });
    const originalStudentMetadata = await ownDeliveryMetadata.innerText();
    expect(originalStudentMetadata).not.toContain("La has cambiado");
    await teacher.goto(resubmissionPath);
    const deliveredStudent = teacher.getByRole("region", { name: "Estudiantes", exact: true }).locator("li")
      .filter({ has: teacher.getByText(m.users.student.name, { exact: true }) });
    const gradeLink = deliveredStudent.getByRole("link", { name: "Calificar", exact: true });
    const originalGradeHref = await gradeLink.getAttribute("href");
    expect(originalGradeHref).toBeTruthy();
    await gradeLink.click();
    const teacherDelivery = teacher.getByRole("region", { name: `Entrega de ${m.users.student.name}`, exact: true });
    const originalSubmissionId = await teacherDelivery.locator('input[name="submissionId"]').inputValue();
    expect(originalSubmissionId).toMatch(/^[a-z0-9]+$/i);
    expect(new URL(originalGradeHref!, teacher.url()).searchParams.get("entrega")).toBe(originalSubmissionId);
    await expect(teacherDelivery.getByText(initialAnswer, { exact: true })).toBeVisible();
    const teacherDeliveryMetadata = teacherDelivery.locator("p").filter({ hasText: /^Entregada el / });
    const originalTeacherMetadata = await teacherDeliveryMetadata.innerText();
    expect(originalTeacherMetadata).not.toContain("El estudiante la cambió");
    await ownDelivery.getByRole("textbox", { name: /^Tu respuesta/ }).fill(rejectedAnswer);
    await ownDelivery.getByRole("button", { name: "Volver a entregar", exact: true }).click();
    await expect(ownDelivery.getByRole("alertdialog", { name: "Confirmar entrega", exact: true })).toBeVisible();
    await student.goto(assignmentPath);
    await student.getByLabel("Tu respuesta", { exact: true }).fill("Esta escritura debe ser rechazada por matrícula finalizada.");
    await student.getByRole("button", { name: "Entregar tarea", exact: true }).click();
    await lesson.goto(`/dashboard/aula/${m.courseId}/leccion/${m.lessonId}`);
    await lesson.getByRole("button", { name: "Marcar como no completada", exact: true }).click();
    await expect(lesson.getByRole("button", { name: "Terminar", exact: true })).toBeVisible();
    await exam.goto(`/dashboard/aula/${m.courseId}/presentar/${examId}`);
    await exam.getByRole("button", { name: "Iniciar examen", exact: true }).click();
    await exam.getByRole("radio", { name: "Verdadero", exact: true }).check();
    await exam.getByRole("button", { name: "Enviar examen", exact: true }).click();
    await teacher.goto(`/dashboard/aula/${m.courseId}/certificados`);
    const row = teacher.locator("li").filter({ hasText: m.users.student.name });
    await row.getByRole("button", { name: "Marcar curso como completado", exact: true }).click();
    await row.getByRole("button", { name: "Sí, marcar como completado", exact: true }).click();
    await expect(row.getByRole("button", { name: "Quitar el completado", exact: true })).toBeVisible();
    await student.getByRole("button", { name: "Sí, entregar", exact: true }).click();
    await expect.soft(student.locator("main").getByRole("alert")).toHaveText("Esta tarea no está disponible para ti.");
    await resubmission.getByRole("button", { name: "Sí, entregar", exact: true }).click();
    await expect.soft(ownDelivery.getByRole("alert")).toHaveText("Esta tarea no está disponible para ti.");
    await lesson.getByRole("button", { name: "Terminar", exact: true }).click();
    await expect.soft(lesson.locator("main").getByRole("alert")).toHaveText("Este curso ya terminó: puedes consultarlo, pero tu avance ya no cambia.");
    await captureAction(exam, () => exam.getByRole("button", { name: "Sí, enviar examen", exact: true }).click());
    // The rejected action revalidates the course: the server replaces the runner with its read-only view.
    await expect.soft(exam.locator("main").getByRole("status")).toHaveText("Ya terminaste este curso. El examen queda solo para consultar tu resultado.");
    await expect.soft(exam.getByRole("button", { name: /Iniciar examen|Enviar examen|Sí, enviar examen|Intentar enviar de nuevo/ })).toHaveCount(0);
    await expect.soft(exam.getByRole("radio")).toHaveCount(0);
    await lesson.reload();
    await expect.soft(lesson.getByRole("button", { name: /Terminar|Marcar como/ })).toHaveCount(0);
    await expect.soft(lesson.getByRole("progressbar", { name: "Avance del curso" }).first()).toHaveAttribute("aria-valuenow", "0");
    await student.reload();
    await expect(student.getByRole("heading", { name: "Tu entrega", exact: true })).toBeVisible();
    await expect.soft(student.getByRole("button", { name: /Entregar tarea|Volver a entregar/ })).toHaveCount(0);
    await expect.soft(student.getByText("Aún no has entregado esta tarea.", { exact: true })).toBeVisible();
    await teacher.goto(assignmentPath);
    const rejectedSubmission = teacher.getByRole("region", { name: "Estudiantes", exact: true }).locator("li")
      .filter({ has: teacher.getByText(m.users.student.name, { exact: true }) });
    await expect(rejectedSubmission).toHaveCount(1);
    await expect.soft(rejectedSubmission.getByText("Sin entregar", { exact: true })).toBeVisible();
    await expect.soft(rejectedSubmission.getByRole("link", { name: /Calificar|Ver o corregir/ })).toHaveCount(0);
    await resubmission.reload();
    await expect(ownDelivery.getByRole("heading", { name: "Tu entrega", exact: true })).toBeVisible();
    await expect.soft(ownDelivery.getByText(initialAnswer, { exact: true })).toBeVisible();
    await expect.soft(ownDelivery).not.toContainText(rejectedAnswer);
    await expect.soft(ownDeliveryMetadata).toHaveText(originalStudentMetadata);
    await expect.soft(ownDelivery.getByRole("button", { name: /Entregar tarea|Volver a entregar/ })).toHaveCount(0);
    await teacher.goto(resubmissionPath);
    await expect.soft(gradeLink).toHaveAttribute("href", originalGradeHref!);
    await gradeLink.click();
    await expect.soft(teacherDelivery.locator('input[name="submissionId"]')).toHaveValue(originalSubmissionId);
    await expect.soft(teacherDelivery.getByText(initialAnswer, { exact: true })).toBeVisible();
    await expect.soft(teacherDelivery).not.toContainText(rejectedAnswer);
    await expect.soft(teacherDeliveryMetadata).toHaveText(originalTeacherMetadata);
    await teacher.goto(`/dashboard/aula/${m.courseId}/tareas/${m.assignmentId}?entrega=${m.submissionId}#entrega`);
    await expect.soft(teacher.locator(`input[name="submissionId"][value="${m.submissionId}"]`)).toHaveCount(1);
    await teacher.goto(`/dashboard/aula/${m.courseId}/examenes/${examId}/resultados`);
    const attempt = teacher.locator("li").filter({ has: teacher.getByRole("heading", { name: m.users.student.name, exact: true }) });
    await expect.soft(attempt).toContainText("Lo está presentando");
    await expect.soft(attempt).toContainText("No lo ha enviado");
    await expect.soft(attempt).toContainText("Todavía no hay nota");
    await expect.soft(attempt.locator("summary").filter({ hasText: "Ver sus respuestas" })).toHaveCount(0);
    const fresh = await sessionPage(browser, m.users.student);
    try {
      await fresh.goto(`/dashboard/aula/${m.courseId}`);
      await expect(fresh.getByRole("heading", { name: m.names.course, exact: true })).toBeVisible();
      await expect(fresh.getByText("Ya completaste este curso.", { exact: true })).toBeVisible();
      await fresh.goto(`/dashboard/aula/${m.courseId}/leccion/${m.lessonId}`);
      await expect(fresh.getByRole("heading", { name: m.names.lesson, exact: true })).toBeVisible();
      await expect.soft(fresh.getByRole("button", { name: /Terminar|Marcar como/ })).toHaveCount(0);
      await expect.soft(fresh.getByRole("progressbar", { name: "Avance del curso" }).first()).toHaveAttribute("aria-valuenow", "0");
      await fresh.goto(`/dashboard/aula/${m.courseId}/tareas/${m.assignmentId}`);
      await expect.soft(fresh.getByText(m.names.submission, { exact: true })).toBeVisible();
      await expect.soft(fresh.getByRole("button", { name: /Entregar tarea|Volver a entregar/ })).toHaveCount(0);
      await fresh.goto(`/dashboard/aula/${m.courseId}/mis-notas`);
      await expect(fresh.getByRole("heading", { name: "Mis notas", exact: true })).toBeVisible();
      await expect.soft(fresh.getByText(m.names.feedback)).toBeVisible();
      await expect.soft(fresh.getByText(/92/).first()).toBeVisible();
    } finally { await fresh.context().close(); }
  } finally { await teacher.context().close(); await student.context().close(); }
});

test("revocar capacidad docente corta menú, página, acción y nuevas URLs propias; respeta TTL 60/300", async ({ browser }) => {
  test.setTimeout(420_000);
  const m = await readManifest();
  const teacher = await sessionPage(browser, m.users.teacher);
  const admin = await sessionPage(browser, m.users.admin);
  let revoked = false;
  try {
    const ownAsset = await attachTeacherFile(teacher, m.courseId, m.names.lesson);
    const ownVideo = await attachTeacherFile(teacher, m.courseId, m.names.lesson, "video");
    await teacher.getByRole("button", { name: `Editar lección ${m.names.lesson}`, exact: true }).click();
    const editForm = teacher.locator("form").filter({ has: teacher.locator(`input[name="lessonId"][value="${m.lessonId}"]`) });
    await expect(editForm).toHaveCount(1);
    const content = editForm.getByRole("textbox", { name: /^Contenido/ });
    const originalContent = await content.inputValue();
    expect(originalContent.length, "El control debe cargar contenido real antes de intentar cambiarlo").toBeGreaterThan(0);
    const changed = "Contenido rechazado después de revocar permiso";
    await content.fill(changed);
    const previousDocument = await issuedLocalUrl(teacher, ownAsset, 60);
    const previousVideo = await issuedLocalUrl(teacher, ownVideo, 300);
    await setTeacherCourseAccess(admin, false);
    revoked = true;
    await editForm.getByRole("button", { name: "Guardar cambios", exact: true }).click();
    await expect.soft(editForm.getByRole("alert")).toContainText(/permiso|encontr/);
    // The known owner bypass must fail this assertion, not xfail or silently skip the case.
    expect.soft(await assetStatus(teacher, ownAsset), "No deben emitirse nuevas URLs al uploader sin course.view").toBe(403);
    expect.soft(await assetStatus(teacher, ownVideo), "Tampoco deben emitirse nuevas URLs de vídeo al uploader sin course.view").toBe(403);
    expect.soft((await teacher.request.get(previousDocument.location)).status(), "El documento emitido conserva su ventana residual de 60 s").toBe(200);
    expect.soft((await teacher.request.get(previousVideo.location)).status(), "El vídeo emitido conserva su ventana residual de 300 s").toBe(200);
    await deniedPage(teacher, `/dashboard/aula/${m.courseId}/contenido`, "Contenido del curso");
    await teacher.goto("/dashboard");
    await expect.soft(teacher.locator('nav a[href="/dashboard/aula"]')).toHaveCount(0);
    await admin.goto(`/dashboard/aula/${m.courseId}/leccion/${m.lessonId}`);
    await expect(admin.getByRole("heading", { name: m.names.lesson, exact: true })).toBeVisible();
    await expect.soft(admin.locator("main")).toContainText(originalContent);
    await expect.soft(admin.getByText(changed, { exact: true })).toHaveCount(0);
    await waitForRealExpiry(teacher, previousDocument);
    await waitForRealExpiry(teacher, previousVideo);
    expect.soft(await assetStatus(teacher, ownAsset)).toBe(403);
    expect.soft(await assetStatus(teacher, ownVideo)).toBe(403);
  } finally {
    if (revoked) await setTeacherCourseAccess(admin, true);
    await teacher.context().close(); await admin.context().close();
  }
});

test("banderas y revocación terminal del tutor cortan nuevas consultas y la URL anterior vence realmente", async ({ browser }) => {
  const m = await readManifest();
  const admin = await sessionPage(browser, m.users.admin);
  const parent = await sessionPage(browser, m.users.parent);
  try {
    await admin.goto("/dashboard/configuracion/tutores");
    const card = guardianCard(admin, m.guardianId);
    await parent.goto(`/dashboard/hijos/${m.studentId}`);
    await expect(parent.getByRole("heading", { name: "Cursos y avance", exact: true })).toBeVisible();
    await expect(parent.getByRole("heading", { name: "Asistencia", exact: true })).toBeVisible();
    for (const [flag, headings] of [
      ["Académico y calificaciones publicadas", ["Cursos y avance", "Tareas", "Notas"]],
      ["Asistencia", ["Asistencia"]],
    ] as const) {
      try {
        await setGuardianFlag(card, flag, false);
        await parent.reload();
        await expect(parent.getByRole("heading", { name: m.users.student.name, exact: true })).toBeVisible();
        for (const heading of headings) await expect.soft(parent.getByRole("heading", { name: heading, exact: true })).toHaveCount(0);
        if (flag === "Académico y calificaciones publicadas") {
          await expect.soft(parent.locator('section[aria-labelledby="cursos"], section[aria-labelledby="tareas"], section[aria-labelledby="notas"]')).toHaveCount(0);
          await expect.soft(parent.getByText(m.names.feedback)).toHaveCount(0);
          await expect.soft(parent.getByText(m.names.assignment, { exact: true })).toHaveCount(0);
        } else {
          await expect.soft(parent.locator('section[aria-labelledby="asistencia"]')).toHaveCount(0);
          await expect.soft(parent.getByText("Sin ausencias ni tardanzas.", { exact: true })).toHaveCount(0);
        }
      } finally {
        await setGuardianFlag(card, flag, true);
        await parent.reload();
        await expect(parent.getByRole("heading", { name: m.users.student.name, exact: true })).toBeVisible();
        for (const heading of headings) await expect(parent.getByRole("heading", { name: heading, exact: true })).toBeVisible();
        if (flag === "Académico y calificaciones publicadas") {
          await expect(parent.getByText(m.names.feedback).first()).toBeVisible();
          await expect(parent.locator('section[aria-labelledby="notas"]')).toContainText("92 / 100");
        } else {
          await expect(parent.locator('section[aria-labelledby="asistencia"]')).toContainText("100 %");
        }
      }
    }
    try {
      await setGuardianFlag(card, "Avisos relevantes", false);
      await parent.goto("/dashboard/comunidad");
      await expect.soft(parent.getByRole("heading", { name: m.names.announcement, exact: true })).toHaveCount(0);
      expect.soft(await assetStatus(parent, m.assetId)).toBe(403);
    } finally {
      await setGuardianFlag(card, "Avisos relevantes", true);
      await parent.goto("/dashboard/comunidad");
      await expect(parent.getByRole("heading", { name: m.names.announcement, exact: true })).toBeVisible();
      expect(await assetStatus(parent, m.assetId)).toBe(302);
    }
    const previousImage = await issuedLocalUrl(parent, m.assetId, 60);
    admin.once("dialog", (dialog) => dialog.accept());
    await card.getByRole("button", { name: "Revocar vínculo", exact: true }).click();
    await expect(card.getByRole("status").filter({ hasText: "Vínculo revocado" })).toBeVisible();
    await deniedPage(parent, `/dashboard/hijos/${m.studentId}`, m.users.student.name);
    await parent.goto("/dashboard/comunidad");
    await expect.soft(parent.getByRole("heading", { name: m.names.announcement, exact: true })).toHaveCount(0);
    expect.soft(await assetStatus(parent, m.assetId)).toBe(403);
    expect.soft((await parent.request.get(previousImage.location)).status(), "La URL emitida conserva solamente su ventana residual").toBe(200);
    await waitForRealExpiry(parent, previousImage);
    await parent.reload();
    expect(await assetStatus(parent, m.assetId)).toBe(403);
  } finally { await admin.context().close(); await parent.context().close(); }
});
