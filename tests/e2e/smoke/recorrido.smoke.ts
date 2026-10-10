import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { Tour } from "./harness";
import { exerciseInstitutionSuspension } from "./fragments/backoffice-suspension";
import { supportSmoke } from "./fragments/support";
import { backofficeBillingSmoke } from "./fragments/backoffice-billing";
import { checkPlatformFeatures } from "./fragments/platform-features";
import { platformAnnouncementsSmoke, platformAnnouncementsDeniedSmoke } from "./platform-announcements.fragment";
import { demoDayKey, loadSeed, SMOKE_ACCOUNTS, SMOKE_PASSWORD } from "./shared";

/**
 * Recorrido en navegador de toda la plataforma, con la semilla de `seed.ts`.
 *
 * Recorridos independientes por rol (administrador de una institución nueva, administrador,
 * docente, estudiante, tutor, coordinador y visitante sin sesión). Cada uno entra por el
 * formulario real de `/login`. Lo que cada recorrido crea lleva el nombre del proyecto
 * (móvil / escritorio) para que las dos pasadas no choquen sobre la misma base; el estudiante
 * del proyecto móvil es Ana y el del escritorio es Pedro. El docente califica a Rosa en móvil
 * y a Juan en escritorio (los dos tienen entrega y examen sembrados).
 *
 * Numeración de capturas: 001 institución nueva, 010 administrador, 100 docente, 200 estudiante,
 * 300 tutor, 350 coordinador, 400 público.
 */

const seed = loadSeed();
const course = `/dashboard/aula/${seed.courseId}`;

/** Hay texto repetido en partes ocultas (menú móvil cerrado, tabla o tarjetas según el ancho): solo cuenta lo visible. */
const visible = (page: Page, text: string | RegExp) => expect(page.getByText(text).filter({ visible: true }).first()).toBeVisible();
const heading = (page: Page, name: string | RegExp) => expect(page.getByRole("heading", { name }).first()).toBeVisible();
/** Mensaje de éxito de una acción (los formularios lo muestran con role="status"). */
const done = (page: Page, text: RegExp) => expect(page.getByRole("status").filter({ hasText: text }).first()).toBeVisible();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Inicia sesión o deja constancia de que el recorrido no pudo empezar. */
async function start(tour: Tour, email: string) {
  try {
    await tour.login(email);
    return true;
  } catch (error) {
    await tour.aborted(`No se pudo iniciar sesión: ${String(error).slice(0, 200)}`);
    tour.finish();
    return false;
  }
}

test("administrador institucion nueva", async ({ page }, info) => {
  const tour = new Tour(page, info, "admin nuevo", 1);
  if (!(await start(tour, SMOKE_ACCOUNTS.newAdmin))) return;

  await tour.open("inicio primeros pasos", "/dashboard", async () => {
    await heading(page, "Primeros pasos");
    await heading(page, "Colegio Nuevo Amanecer");
  });
  await tour.open("personas vacio", "/dashboard/gestion", () => heading(page, "Personas"));
  await tour.open("cursos vacio", "/dashboard/aula", () => heading(page, "Cursos"));
  await tour.open("periodos vacio", "/dashboard/configuracion/periodos", () => heading(page, "Períodos académicos"));
  await tour.open("cobros vacio", "/dashboard/pagos", () => heading(page, "Cobros"));
  await tour.open("admisiones vacio", "/dashboard/admisiones", () => heading(page, "Admisiones"));
  await tour.open("reportes vacio", "/dashboard/analitica", () => heading(page, "Reportes"));
  tour.finish();
});

test("administrador", async ({ page }, info) => {
  const tag = info.project.name;
  const tour = new Tour(page, info, "administrador", 10);
  if (!(await start(tour, SMOKE_ACCOUNTS.admin))) return;

  await tour.open("inicio", "/dashboard", () => heading(page, /Primeros pasos|Tu institución en números/));
  await tour.open("personas", "/dashboard/gestion", () => visible(page, "Ana Rodríguez"));
  await tour.step("personas agregar formulario", async () => {
    await page.getByRole("button", { name: "Agregar persona" }).click();
    await expect(page.getByRole("form", { name: "Agregar persona" })).toBeVisible();
  });
  await tour.step("personas agregar sin invitacion", async () => {
    const form = page.getByRole("form", { name: "Agregar persona" });
    await form.getByLabel("Nombre completo").fill(`Marta Prueba ${tag}`);
    await form.getByLabel("Correo").fill(`marta.${tag}@instituto-demo.test`);
    await form.getByLabel("Enviarle la invitación ahora").uncheck();
    await form.getByRole("button", { name: "Agregar persona" }).click();
    await done(page, /Persona agregada/);
    await visible(page, `Marta Prueba ${tag}`);
  });
  await tour.step("persona detalle", async () => {
    await page.goto("/dashboard/gestion");
    await page.getByRole("link", { name: "Ana Rodríguez" }).click();
    await page.waitForURL(new RegExp(`/gestion/personas/${seed.studentIds[0]}`));
    await visible(page, "Ana Rodríguez");
  });
  await tour.open("importar e invitar", "/dashboard/gestion/accesos", () => heading(page, "Importar e invitar"));
  await tour.open("programas", "/dashboard/gestion/programas", () => visible(page, "Bachillerato Técnico"));
  await tour.step("programa detalle", async () => {
    await page.getByRole("link", { name: /Bachillerato Técnico/ }).first().click();
    await page.waitForURL(new RegExp(`/programas/${seed.programId}`));
    await visible(page, "Matemática Básica");
  });
  await tour.open("grupos", "/dashboard/gestion/grupos", () => visible(page, "Grupo A – Mañana"));
  await tour.step("grupo detalle", async () => {
    await page.getByRole("link", { name: /Grupo A – Mañana/ }).first().click();
    await page.waitForURL(new RegExp(`/grupos/${seed.groupId}`));
    await visible(page, "Ana Rodríguez");
  });

  const notice = `Reunión de familias (${tag})`;
  const corrected = `Reunión de familias, corregido (${tag})`;
  await tour.open("avisos", "/dashboard/comunidad", () => visible(page, "Bienvenidos al nuevo período"));
  await tour.step("avisos revisar antes de publicar", async () => {
    await page.getByText("Publicar un aviso", { exact: true }).first().click();
    await page.getByLabel("Título", { exact: true }).first().fill(notice);
    await page.getByLabel("Mensaje", { exact: true }).first().fill("Los esperamos el viernes a las 6 de la tarde en el salón principal.");
    await page.getByRole("button", { name: "Revisar y publicar" }).click();
    await heading(page, "Revisa antes de publicar");
  });
  await tour.step("avisos publicado", async () => {
    await page.getByRole("button", { name: "Publicar aviso" }).click();
    await expect(page.getByRole("article").filter({ hasText: notice })).toBeVisible();
  });
  await tour.step("avisos editado", async () => {
    const card = page.getByRole("article").filter({ hasText: notice });
    await card.getByRole("button", { name: "Editar" }).click();
    await card.getByLabel("Título").fill(corrected);
    await card.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByRole("article").filter({ hasText: corrected })).toBeVisible();
  });
  await tour.step("avisos borrado", async () => {
    const card = page.getByRole("article").filter({ hasText: corrected });
    await card.getByRole("button", { name: "Borrar" }).click();
    await card.getByRole("button", { name: "Sí, borrar aviso" }).click();
    await expect(page.getByRole("article").filter({ hasText: corrected })).toHaveCount(0);
  });
  await tour.open("mi perfil", "/dashboard/perfil", async () => {
    await heading(page, "Mi perfil");
    await visible(page, SMOKE_ACCOUNTS.admin);
  });
  await tour.open("calendario", "/dashboard/calendario", () => heading(page, "Calendario"));
  await tour.open("configuracion", "/dashboard/configuracion", () => heading(page, /Configuración/i));
  await tour.open("cursos", "/dashboard/aula", () => visible(page, "Matemática Básica"));

  // --- qa: recorrido completo (administrador) ---
  const period = `Período de verano (${tag})`;
  await tour.open("periodos", "/dashboard/configuracion/periodos", () => heading(page, "Períodos académicos"));
  await tour.step("periodos crear", async () => {
    await page.getByRole("button", { name: "Crear período" }).click();
    await page.getByLabel("Nombre del período").fill(period);
    const year = Number(demoDayKey(0).slice(0, 4)) + 1;
    await page.getByLabel("Empieza el").fill(tag === "movil" ? `${year}-07-01` : `${year}-09-01`);
    await page.getByLabel("Termina el").fill(tag === "movil" ? `${year}-08-15` : `${year}-12-15`);
    await page.getByRole("button", { name: "Crear período" }).click();
    await done(page, /Período creado/);
    await heading(page, period);
  });
  await tour.open("datos de la institucion", "/dashboard/configuracion/institucion", () => heading(page, "Datos de la institución"));

  const charged = tag === "movil" ? "Ana Rodríguez" : "Pedro Jiménez";
  const concept = `Uniforme escolar (${tag})`;
  await tour.open("cobros", "/dashboard/pagos", async () => {
    await heading(page, "Cobros");
    await visible(page, "Inscripción del período");
  });
  await tour.step("cobros crear cargo formulario", async () => {
    if (!(await page.getByRole("heading", { name: "Crear cargo" }).isVisible().catch(() => false))) {
      await page.getByRole("button", { name: "Crear cargo" }).click();
    }
    await page.getByLabel("Estudiante", { exact: true }).fill(charged.split(" ")[0]);
    await page.getByRole("button", { name: new RegExp(charged) }).first().click();
    await page.getByLabel("Concepto").fill(concept);
    await page.getByLabel("Monto", { exact: true }).fill("2500.00");
    await page.getByLabel("Fecha de vencimiento").fill(demoDayKey(15));
  });
  await tour.step("cobros cargo creado", async () => {
    await page.getByRole("button", { name: "Crear cargo", exact: true }).click();
    await done(page, new RegExp(`Cargo creado para ${charged}`));
    await expect(page.getByRole("listitem").filter({ hasText: concept })).toBeVisible();
  });
  await tour.step("cobros pago parcial", async () => {
    const row = page.getByRole("listitem").filter({ hasText: concept });
    await row.getByRole("button", { name: "Registrar pago" }).click();
    await row.getByLabel("Monto recibido").fill("1000.00");
    await row.getByRole("button", { name: "Guardar pago" }).click();
    await expect(row.getByRole("status").filter({ hasText: /Pago registrado/ })).toBeVisible();
    await expect(row.getByText("Pago parcial", { exact: true })).toBeVisible();
  });

  const applicant = `Lucía Fernández (${tag})`;
  await tour.open("admisiones", "/dashboard/admisiones", async () => {
    await heading(page, "Admisiones");
    await visible(page, "Carmen Báez");
  });
  await tour.step("admisiones registrar solicitud", async () => {
    await page.getByRole("button", { name: "Registrar solicitud" }).click();
    await page.getByLabel("Nombre completo").fill(applicant);
    await page.getByLabel("Correo", { exact: true }).fill(`lucia.${tag}@correo.test`);
    await page.getByLabel("Programa de interés (opcional)").fill("Bachillerato Técnico");
    await page.getByRole("button", { name: "Registrar solicitud" }).click();
    await page.waitForURL(/\/admisiones\/[^/?#]+$/);
    await heading(page, applicant);
  });
  await tour.step("admisiones avanzar a admitido", async () => {
    for (const stage of ["Documentos", "En revisión", "Admitido"]) {
      await page.getByRole("button", { name: `Pasar a «${stage}»` }).click();
      await expect(page.getByRole("button", { name: `Pasar a «${stage}»` })).toHaveCount(0);
    }
    await expect(page.getByRole("button", { name: "Convertir en estudiante" })).toBeVisible();
  });
  await tour.step("admisiones convertir confirmar", async () => {
    await page.getByRole("button", { name: "Convertir en estudiante" }).click();
    await page.getByLabel(/Enviarle la invitación ahora/).uncheck();
    await expect(page.getByRole("button", { name: "Sí, convertir en estudiante" })).toBeVisible();
  });
  await tour.step("admisiones convertida", async () => {
    await page.getByRole("button", { name: "Sí, convertir en estudiante" }).click();
    await heading(page, "Ya es estudiante");
  });

  await tour.open("reportes", "/dashboard/analitica", () => heading(page, "Reportes"));
  await tour.step("reportes descargar csv de cursos", async () => {
    const response = await page.request.get("/dashboard/analitica/descargar?seccion=cursos");
    expect(response.status(), "La descarga del CSV de cursos debe responder 200").toBe(200);
    expect(response.headers()["content-type"] ?? "").toContain("text/csv");
    expect((await response.text()).length).toBeGreaterThan(0);
  });
  await tour.open("curso asistencia", `${course}/asistencia`, () => heading(page, "Asistencia"));
  await tour.open("curso certificados", `${course}/certificados`, () => heading(page, "Certificados"));
  // --- fin qa: recorrido completo (administrador) ---
  // --- M5 · pagos y recibos ---
  await tour.open("cobros historial", "/dashboard/pagos", () => heading(page, "Cobros"));
  await tour.step("cobros recibo", async () => {
    await page.getByText("Historial de pagos (1)").filter({ visible: true }).first().click();
    await page.getByRole("link", { name: "Ver recibo" }).filter({ visible: true }).first().click();
    await page.waitForURL(/\/dashboard\/pagos\/recibo\//);
    await heading(page, "Recibo de pago");
  });
  // --- fin M5 ---
  // --- tanda 4 (QA): ficha del docente, IA en la institución y verificar certificados ---
  await tour.open("ficha del docente", `/dashboard/gestion/personas/${seed.teacherId ?? ""}`, async () => {
    await heading(page, "Luis Peralta");
    await heading(page, "Cursos que enseña");
    await visible(page, "Matemática Básica");
  });
  await tour.open("institucion asistente de ia", "/dashboard/configuracion/institucion", async () => {
    await heading(page, "Datos de la institución");
    await heading(page, "Asistente de IA");
  });
  await tour.open("verificar certificado", "/certificados", () => expect(page.getByLabel("Código del certificado")).toBeVisible());
  // --- fin tanda 4 ---
  tour.finish();
});

test("docente", async ({ page }, info) => {
  const tag = info.project.name;
  const graded = tag === "movil" ? "Rosa Almonte" : "Juan Castillo";
  const tour = new Tour(page, info, "docente", 100);
  if (!(await start(tour, SMOKE_ACCOUNTS.teacher))) return;

  await tour.open("inicio", "/dashboard", async () => {
    await heading(page, "¿Qué tengo hoy?");
    await visible(page, "Matemática Básica");
  });
  // --- tanda 4 (QA): el examen sembrado tiene respuestas cortas de Rosa y Juan sin revisar ---
  await tour.step("inicio respuestas por revisar", async () => {
    await heading(page, "Por calificar");
    await visible(page, /respuestas por revisar/);
  });
  // --- fin tanda 4 ---
  await tour.open("mis cursos", "/dashboard/aula", () => visible(page, "Matemática Básica"));
  await tour.step("curso portada", async () => {
    await page.getByRole("link", { name: /Matemática Básica/ }).first().click();
    await page.waitForURL(new RegExp(`/aula/${seed.courseId}$`));
    await heading(page, "Matemática Básica");
  });

  const chapter = `Unidad de repaso (${tag})`;
  const lesson = `Repaso general (${tag})`;
  await tour.open("contenido", `${course}/contenido`, () => heading(page, "Unidad 1. Números naturales"));
  await tour.step("contenido capitulo nuevo", async () => {
    await page.getByRole("button", { name: "Agregar capítulo" }).click();
    await page.getByLabel("Título del capítulo").fill(chapter);
    await page.getByLabel("Descripción (opcional)").fill("Repaso antes de la prueba.");
    await page.getByRole("button", { name: "Guardar capítulo" }).click();
    await heading(page, chapter);
  });
  await tour.step("contenido leccion nueva publicada", async () => {
    const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: chapter }) });
    await card.getByRole("button", { name: "Agregar lección" }).click();
    await card.getByLabel("Título de la lección").fill(lesson);
    await card.getByLabel("Contenido").fill("Repasa las unidades 1 y 2 antes de la prueba corta.");
    await card.getByRole("button", { name: "Guardar lección" }).click();
    // Publicar/Ocultar está dentro de «Más» de cada elemento.
    await page.getByLabel(`Más acciones de la lección ${lesson}`).click();
    await page.getByRole("button", { name: `Publicar lección ${lesson}` }).click();
    await expect(page.getByRole("button", { name: `Ocultar lección ${lesson}` })).toBeVisible();
    await page.getByLabel(`Más acciones del capítulo ${chapter}`).click();
    await page.getByRole("button", { name: `Publicar capítulo ${chapter}` }).click();
    await expect(page.getByRole("button", { name: `Ocultar capítulo ${chapter}` })).toBeVisible();
  });

  await tour.open("estudiantes", `${course}/estudiantes`, () => visible(page, "Ana Rodríguez"));

  await tour.step("estudiante avance", async () => {
    await page.getByRole("link", { name: "Ana Rodríguez" }).first().click();
    await page.waitForURL(/\/estudiantes\/[a-z0-9]+$/);
    await heading(page, "Ana Rodríguez");
  });
  await tour.open("leccion vista previa", `${course}/leccion/${seed.lessonIds[1]}`, () => heading(page, "Video: contar de diez en diez"));

  const homework = `Ejercicios de repaso (${tag})`;
  await tour.open("tareas", `${course}/tareas`, () => visible(page, "Problemas de suma y resta"));
  await tour.step("tareas crear borrador", async () => {
    await page.getByRole("button", { name: "Crear tarea" }).click();
    await page.getByLabel("Título", { exact: true }).fill(homework);
    await page.getByLabel("Instrucciones").fill("Resuelve los ejercicios 1 al 5 de la guía y entrega tus respuestas aquí.");
    await page.getByLabel("Fecha y hora límite").fill(`${demoDayKey(5)}T17:00`);
    await page.getByRole("button", { name: "Guardar tarea" }).click();
    await done(page, /Tarea guardada como borrador/);
    await expect(page.getByRole("link", { name: homework })).toBeVisible();
  });
  await tour.step("tareas publicar", async () => {
    const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: homework }) });
    await row.getByRole("button", { name: "Publicar", exact: true }).click();
    await row.getByRole("button", { name: "Sí, publicar" }).click();
    await expect(row.getByText("Publicada", { exact: true })).toBeVisible();
  });
  await tour.open("tarea detalle docente", `${course}/tareas/${seed.assignmentId}`, () => visible(page, "Problemas de suma y resta"));
  // --- qa: recorrido completo (calificar la entrega sembrada) ---
  await tour.step("tarea abrir entrega", async () => {
    await page.getByRole("listitem").filter({ hasText: graded }).getByRole("link", { name: /Calificar|Ver o corregir/ }).click();
    await page.waitForURL(/entrega=/);
    await heading(page, `Entrega de ${graded}`);
  });
  await tour.step("tarea entrega calificada", async () => {
    await page.getByLabel(/^Nota \(de 0 a/).fill("85");
    await page.getByLabel("Comentario para el estudiante (opcional)").fill("Buen trabajo. Revisa el problema 3: faltó escribir el procedimiento.");
    await page.getByRole("button", { name: "Guardar nota" }).click();
    await done(page, /Nota (guardada|corregida)/);
  });
  // --- fin qa ---

  await tour.open("banco de preguntas", `${course}/preguntas`, () => visible(page, "¿Cuánto es 27 + 15?"));
  await tour.open("pregunta nueva", `${course}/preguntas/nueva`);
  await tour.open("examenes", `${course}/examenes`, () => visible(page, "Prueba corta: suma y resta"));
  await tour.step("examen sembrado", async () => {
    await page.getByRole("link", { name: "Editar" }).first().click();
    await page.waitForURL(new RegExp(`/examenes/${seed.examId}$`));
    await visible(page, /Prueba corta|suma y resta/);
  });
  await tour.open("examen resultados", `${course}/examenes/${seed.examId}/resultados`);
  // --- qa: recorrido completo (revisar la respuesta corta sembrada) ---
  await tour.step("examen respuesta corta revisada", async () => {
    const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: graded, exact: true }) });
    await card.getByLabel(/^Puntos \(de 0 a/).fill("3");
    await card.getByLabel(/^Comentario/).fill("Bien explicado.");
    await card.getByRole("button", { name: "Guardar revisión" }).click();
    await expect(card.getByText("Calificado", { exact: true })).toBeVisible();
  });
  // --- fin qa ---

  await tour.open("calificaciones", `${course}/calificaciones`, async () => {
    const simple = page.getByRole("button", { name: "Usar configuración sencilla" });
    if (await simple.isVisible().catch(() => false)) {
      await simple.click();
      await done(page, /Listo/);
    }
    await heading(page, /^Notas de \d+ estudiantes$/);
    await visible(page, "Ana Rodríguez");
  });
  // --- qa: recorrido completo (nota manual en Calificaciones) ---
  const activity = `Participación ${tag}`;
  await tour.step("calificaciones actividad nueva", async () => {
    await page.getByText("Agregar actividad calificable", { exact: true }).click();
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Agregar actividad" }) });
    await form.getByLabel("Título").fill(activity);
    await form.getByLabel("Puntaje máximo").fill("10");
    await form.getByRole("button", { name: "Agregar actividad" }).click();
    await visible(page, activity);
  });
  await tour.step("calificaciones nota manual abierta", async () => {
    if (tag === "movil") {
      const card = page.getByRole("listitem").filter({ has: page.locator("summary", { hasText: graded }) });
      await card.locator("summary").click();
      await card.getByRole("link", { name: new RegExp(escape(activity)) }).click();
    } else {
      await page.getByRole("link", { name: new RegExp(`^${escape(graded)}, ${escape(activity)}:`) }).click();
    }
    await page.waitForURL(/nota=/);
    await expect(page.getByLabel(/^Nota \(de 0 a 10\)/)).toBeVisible();
  });
  await tour.step("calificaciones nota manual guardada", async () => {
    await page.getByLabel(/^Nota \(de 0 a 10\)/).fill("9");
    await page.getByRole("button", { name: "Guardar nota" }).click();
    await page.waitForURL((url) => !url.search.includes("nota="));
    await heading(page, /^Notas de \d+ estudiantes$/);
  });
  // --- fin qa ---

  const liveClass = `Clase de dudas (${tag})`;
  await tour.open("clases en vivo", `${course}/clases`, () => visible(page, "Repaso de la unidad 1"));
  await tour.step("clases programar", async () => {
    await page.getByRole("button", { name: "Programar clase" }).click();
    await page.getByLabel("Título").fill(liveClass);
    await page.getByLabel("Fecha", { exact: true }).fill(demoDayKey(2));
    await page.getByLabel("Hora de inicio").fill(tag === "movil" ? "15:00" : "17:30");
    await page.getByLabel("Enlace de la reunión").fill("https://meet.example.com/clase-de-dudas");
    await page.getByRole("button", { name: "Programar clase" }).click();
    await visible(page, liveClass);
  });
  await tour.open("editar curso", `${course}/editar`);

  // --- qa: recorrido completo (asistencia y certificados) ---
  await tour.open("asistencia", `${course}/asistencia`, () => heading(page, "Asistencia"));
  await tour.step("asistencia de hoy con una ausencia", async () => {
    await page.getByRole("group", { name: new RegExp(graded) }).getByText("Ausente", { exact: true }).click();
    const correction = await page.getByRole("button", { name: "Guardar cambios" }).isVisible().catch(() => false);
    await page.getByRole("button", { name: /^(Guardar asistencia|Guardar cambios)$/ }).click();
    // Defecto conocido: la primera vez que se guarda un día el formulario se vuelve a montar y el mensaje
    // «Asistencia guardada» no llega a verse; lo único que cambia es el título a «Corregir asistencia».
    if (correction) await done(page, /Asistencia corregida/);
    else await heading(page, "Corregir asistencia");
  });
  await tour.open("certificados", `${course}/certificados`, () => heading(page, "Certificados"));
  await tour.step("certificados marcar completado", async () => {
    const row = page.getByRole("listitem").filter({ hasText: graded });
    await row.getByRole("button", { name: "Marcar curso como completado" }).click();
    await row.getByRole("button", { name: "Sí, marcar como completado" }).click();
    await expect(row.getByRole("button", { name: "Emitir certificado" })).toBeVisible();
  });
  await tour.step("certificados emitido", async () => {
    const row = page.getByRole("listitem").filter({ hasText: graded });
    await row.getByRole("button", { name: "Emitir certificado" }).click();
    await expect(row.getByRole("link", { name: "Ver certificado" })).toBeVisible();
  });
  // --- fin qa ---

  await tour.open("avisos", "/dashboard/comunidad", () => visible(page, "Bienvenidos al nuevo período"));
  await tour.open("calendario", "/dashboard/calendario", () => heading(page, "Calendario"));
  await tour.open("mi perfil", "/dashboard/perfil", async () => {
    await heading(page, "Mi perfil");
    await visible(page, SMOKE_ACCOUNTS.teacher);
  });
  // --- tanda 4 (QA): IA en el curso (en CI no hay clave: debe decir que está desactivada) ---
  await tour.open("generar preguntas con ia", `${course}/generar-preguntas`, async () => {
    await heading(page, "Generar preguntas con IA");
    await heading(page, "El asistente de IA no está disponible");
    await visible(page, /no está activado en esta plataforma/);
  });
  // --- fin tanda 4 ---
  tour.finish();
});

test("estudiante", async ({ page }, info) => {
  const mobile = info.project.name === "movil";
  const email = mobile ? SMOKE_ACCOUNTS.student1 : SMOKE_ACCOUNTS.student2;
  const tour = new Tour(page, info, "estudiante", 200);
  if (!(await start(tour, email))) return;

  await tour.open("inicio", "/dashboard", async () => {
    await heading(page, "¿Qué tengo hoy?");
    await visible(page, "Matemática Básica");
  });
  await tour.open("mi aprendizaje", "/dashboard/portal", () => heading(page, "Mis cursos"));
  await tour.open("mis cursos", "/dashboard/aula", () => visible(page, "Matemática Básica"));
  await tour.step("curso portada", async () => {
    await page.getByRole("link", { name: /Matemática Básica/ }).first().click();
    await page.waitForURL(new RegExp(`/aula/${seed.courseId}$`));
    await heading(page, "Matemática Básica");
  });

  await tour.open("leccion 1", `${course}/leccion/${seed.lessonIds[0]}`, () => heading(page, "Qué son los números naturales"));
  await tour.step("leccion completada y siguiente", async () => {
    await page.getByRole("button", { name: "Marcar como completada y seguir" }).click();
    await page.waitForURL(new RegExp(`/leccion/${seed.lessonIds[1]}`));
    await heading(page, "Video: contar de diez en diez");
  });
  await tour.open("curso con avance", course, () => heading(page, "Matemática Básica"));

  await tour.open("tareas", `${course}/tareas`, () => visible(page, "Problemas de suma y resta"));
  await tour.step("tarea abierta", async () => {
    await page.getByRole("link", { name: /Problemas de suma y resta/ }).first().click();
    await page.waitForURL(new RegExp(`/tareas/${seed.assignmentId}`));
    await expect(page.getByLabel("Tu respuesta")).toBeVisible();
  });
  await tour.step("tarea entregada", async () => {
    await page.getByLabel("Tu respuesta").fill("1) 42  2) 18  3) 105  4) 7  5) 60. Hice las sumas empezando por las unidades.");
    await page.getByRole("button", { name: "Entregar tarea" }).click();
    await page.getByRole("button", { name: "Sí, entregar" }).click();
    await done(page, /Tarea entregada/);
  });

  await tour.open("examenes", `${course}/presentar`, () => visible(page, "Prueba corta: suma y resta"));
  await tour.step("examen antes de iniciar", async () => {
    await page.getByRole("link", { name: "Presentar examen" }).first().click();
    await page.waitForURL(new RegExp(`/presentar/${seed.examId}$`));
    await expect(page.getByRole("button", { name: "Iniciar examen" })).toBeVisible();
  });
  await tour.step("examen en curso", async () => {
    await page.getByRole("button", { name: "Iniciar examen" }).click();
    await expect(page.getByRole("button", { name: "Enviar examen" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("radio", { name: "42", exact: true }).check();
    await page.getByRole("radio", { name: "Verdadero", exact: true }).check();
    await page.getByRole("textbox").fill("Es cuando la suma pasa de nueve y se pasa una decena a la columna siguiente.");
    await visible(page, "Respondidas 3 de 3");
  });
  await tour.step("examen confirmar envio", async () => {
    await page.getByRole("button", { name: "Enviar examen" }).click();
    await heading(page, "¿Enviar el examen ahora?");
  });
  await tour.step("examen resultado", async () => {
    await page.getByRole("button", { name: "Sí, enviar examen" }).click();
    await page.waitForURL(/\/resultado/, { timeout: 20_000 });
    await heading(page, /Resultado: Prueba corta/);
  });

  await tour.open("mis notas", `${course}/mis-notas`, () => heading(page, "Mis notas"));
  await tour.open("clases en vivo", `${course}/clases`, () => visible(page, "Repaso de la unidad 1"));
  await tour.open("avisos", "/dashboard/comunidad", () => visible(page, "Bienvenidos al nuevo período"));
  await tour.open("calendario", "/dashboard/calendario", () => heading(page, "Calendario"));
  await tour.open("mi perfil", "/dashboard/perfil", async () => {
    await heading(page, "Mi perfil");
    await visible(page, email);
  });

  // --- qa: recorrido completo (estudiante) ---
  await tour.open("mi asistencia", `${course}/asistencia`, () => heading(page, "Mi asistencia"));
  await tour.open("mi certificado curso en marcha", `${course}/certificados`, () => heading(page, "Mi certificado"));
  await tour.open("mi certificado curso terminado", `/dashboard/aula/${seed.finishedCourseId}/certificados`, () => heading(page, /Ya tienes tu certificado/));
  await tour.open("mis certificados", "/dashboard/mis-certificados", async () => {
    await heading(page, "Mis certificados");
    await visible(page, "Taller de Lectura");
  });
  await tour.open("mi estado de cuenta", "/dashboard/mi-cuenta", async () => {
    await heading(page, "Mi estado de cuenta");
    await visible(page, mobile ? "Inscripción del período" : "Mensualidad");
  });
  // --- fin qa ---
  // --- M5 · pagos y recibos ---
  await tour.open("mi cuenta recibos", "/dashboard/mi-cuenta", () => heading(page, "Mi estado de cuenta"));
  await tour.step("mi recibo", async () => {
    await page.getByRole("link", { name: "Ver recibo" }).filter({ visible: true }).first().click();
    await page.waitForURL(/\/dashboard\/mi-cuenta\/recibo\//);
    await heading(page, "Recibo de pago");
  });
  // --- fin M5 ---
  // --- M9 · video en lecciones ---
  await tour.open("leccion con video", `${course}/leccion/${seed.lessonIds[1]}`, async () => {
    await heading(page, "Video: contar de diez en diez");
    await expect(page.locator('iframe[title^="Video:"][src^="https://www.youtube-nocookie.com/embed/"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /Marcar como (no )?completada|Terminar/ }).first()).toBeVisible();
  });
  // --- fin M9 ---
  // --- tanda 4 (QA): Pregúntale al curso, Mi asistencia y preferencias de correo ---
  await tour.open("leccion preguntale al curso", `${course}/leccion/${seed.lessonIds[2]}`, async () => {
    await heading(page, "Sumar con llevadas");
    await heading(page, "Pregúntale al curso");
    await visible(page, /no está activado en esta plataforma/);
  });
  await tour.open("curso portada mi asistencia", course, async () => {
    await heading(page, "Matemática Básica");
    await visible(page, "Mi asistencia");
  });
  await tour.open("notificaciones", "/dashboard/notificaciones", () => heading(page, "Notificaciones"));
  await tour.step("preferencias de correo", async () => {
    await page.getByRole("link", { name: "Elegir qué me llega por correo" }).filter({ visible: true }).first().click();
    await page.waitForURL(/\/notificaciones\/preferencias$/);
    await heading(page, "Qué me llega por correo");
  });
  await tour.step("preferencias de correo guardadas", async () => {
    await page.getByRole("checkbox").first().setChecked(false);
    await page.getByRole("button", { name: "Guardar mis preferencias" }).click();
    await done(page, /^Listo\./);
  });
  // --- fin tanda 4 ---
  tour.finish();
});

// --- qa: recorrido completo (tutor, coordinador y público) ---
test("tutor", async ({ page }, info) => {
  const tour = new Tour(page, info, "tutor", 300);
  if (!(await start(tour, SMOKE_ACCOUNTS.parent))) return;

  await tour.open("inicio", "/dashboard", () => heading(page, "¿Cómo van mis hijos?"));
  // --- tanda 4 (QA): Ana tiene sembrada la «Inscripción del período» vencida con un abono ---
  await tour.step("inicio hijo con alerta", async () => {
    await heading(page, "Requiere tu atención");
    await expect(page.getByRole("link").filter({ hasText: "Ana Rodríguez" }).filter({ hasText: /cargos? vencidos? por pagar/ }).first()).toBeVisible();
    await heading(page, "Mis hijos");
  });
  // --- fin tanda 4 ---
  await tour.open("mis hijos", "/dashboard/hijos", async () => {
    await heading(page, "Mis hijos");
    await visible(page, "Pedro Jiménez");
  });
  await tour.step("resumen del hijo", async () => {
    await page.getByRole("link", { name: /Ana Rodríguez/ }).first().click();
    await page.waitForURL(new RegExp(`/hijos/${seed.studentIds[0]}`));
    await heading(page, "Ana Rodríguez");
  });
  await tour.open("estado de cuenta", "/dashboard/mi-cuenta", async () => {
    await heading(page, /Estado de cuenta de Ana Rodríguez/);
    await visible(page, "Inscripción del período");
  });
  await tour.open("estado de cuenta otro hijo", `/dashboard/mi-cuenta?estudiante=${seed.studentIds[1]}`, () => heading(page, /Estado de cuenta de Pedro Jiménez/));
  // El tutor no tiene «Calendario» en su menú (las fechas de cada hijo están en su resumen): no se visita.
  await tour.open("avisos", "/dashboard/comunidad", () => heading(page, "Avisos"));
  tour.finish();
});

test("coordinador", async ({ page }, info) => {
  const tour = new Tour(page, info, "coordinador", 350);
  if (!(await start(tour, SMOKE_ACCOUNTS.coordinator))) return;

  // Inicio propio de coordinación (CoordinatorHome): nombre de la institución, pendientes y docentes.
  await tour.open("inicio", "/dashboard", async () => {
    await heading(page, "Instituto Demo");
    await heading(page, "Requiere tu atención");
    await heading(page, "Docentes con más pendientes");
  });
  await tour.open("personas", "/dashboard/gestion", async () => {
    await heading(page, "Personas");
    await visible(page, "Ana Rodríguez");
  });
  await tour.open("cursos", "/dashboard/aula", () => visible(page, "Matemática Básica"));
  await tour.open("curso portada", course, () => heading(page, "Matemática Básica"));
  await tour.open("avisos", "/dashboard/comunidad", () => visible(page, "Bienvenidos al nuevo período"));
  await tour.open("admisiones", "/dashboard/admisiones", () => heading(page, "Admisiones"));
  await tour.open("calendario", "/dashboard/calendario", () => heading(page, "Calendario"));
  tour.finish();
});

test("publico", async ({ page }, info) => {
  const tour = new Tour(page, info, "publico", 400);
  await tour.open("entrar", "/login", () => heading(page, "Bienvenido"));
  await tour.open("recuperar contrasena", "/recuperar", () => expect(page.getByLabel(/Correo/).first()).toBeVisible());
  await tour.open("certificado publico", `/certificados/${seed.certificateCode}`, async () => {
    await heading(page, "Certificado de finalización");
    await visible(page, "Ana Rodríguez");
  });
  // Pantallas públicas que otras piezas están construyendo: se recorren cuando existan en la rama.
  if (existsSync(join(process.cwd(), "src/app/solicitud"))) await tour.open("solicitud de admision", "/solicitud");
  if (existsSync(join(process.cwd(), "src/app/cursos"))) await tour.open("catalogo de cursos", "/cursos");
  // --- tanda 4 (QA): alta de un docente independiente y su primer curso (al final: deja la sesión iniciada) ---
  const stamp = Date.now();
  const independentCourse = `Guitarra para principiantes (${info.project.name})`;
  await tour.open("ensena en edukana", "/ensenar", () => heading(page, "Enseña tus cursos en Edukana"));
  await tour.step("ensena espacio creado", async () => {
    await page.getByLabel("Tu nombre").fill("Elena Docente");
    await page.getByLabel("Correo electrónico").fill(`docente-${stamp}@demo.test`);
    await page.getByLabel("Contraseña").fill("ClaseLibre2026");
    await page.getByRole("button", { name: "Crear mi espacio de docente" }).click();
    await page.waitForURL(/\/dashboard\/?$/, { timeout: 30_000 });
    await visible(page, "Crear un curso");
  });
  await tour.step("docente independiente crea curso", async () => {
    await page.getByRole("link", { name: /Crear un curso/ }).filter({ visible: true }).first().click();
    await page.waitForURL(/\/dashboard\/aula\/nuevo$/);
    await page.getByLabel("Nombre del curso").fill(independentCourse);
    await page.getByRole("button", { name: "Crear curso", exact: true }).click();
    await page.waitForURL(/\/dashboard\/aula\/(?!nuevo)[^/?#]+$/, { timeout: 20_000 });
    await heading(page, independentCourse);
  });
  // --- fin tanda 4 ---
  tour.finish();
});
// --- fin qa ---

// Backoffice A: seeded newAdmin is the dedicated platform operator in CI.
test("operador backoffice A-F", async ({ page, browser }, info) => {
  const tour = new Tour(page, info, "operador", 500);
  if (!(await start(tour, SMOKE_ACCOUNTS.newAdmin))) return;
  await tour.open("tablero del negocio", "/operador/tablero", async () => {
    await heading(page, "Tablero del negocio");
    await heading(page, "Ventas del catálogo este mes");
    await heading(page, "Instituciones que requieren atención");
  });
  const target = seed.backofficeTargets[info.project.name === "movil" ? "movil" : "escritorio"];
  const memberContext = await browser.newContext({
    baseURL: info.project.use.baseURL,
    viewport: info.project.use.viewport,
    locale: "es-DO",
    timezoneId: "America/Santo_Domingo",
  });
  const memberPage = await memberContext.newPage();
  const memberTour = new Tour(memberPage, info, "miembro backoffice", 530);
  try {
    // The billing limit and live-session checks must precede mutation of this isolated target.
    await memberTour.login(target.memberEmail);
    await memberTour.open("limite informativo del plan", "/dashboard", async () => {
      await expect(memberPage.getByRole("status").filter({ hasText: "Llegaste al límite de tu plan" })).toContainText("30/30 estudiantes");
    });
    await memberTour.open("cursos disponibles al alcanzar limite", "/dashboard/aula", async () => {
      await expect(memberPage.getByRole("heading", { name: "Cursos", exact: true })).toBeVisible();
    });
    await tour.step("suspender y reactivar institucion", () => exerciseInstitutionSuspension({
      operatorPage: page, memberPage, ...target, password: SMOKE_PASSWORD,
    }));
    await tour.step("plan y pago manual", () => backofficeBillingSmoke(page, target));
    await tour.open("planes configurados", "/operador/planes", () => heading(page, "Planes"));
    await tour.step("interruptores y comision", () => checkPlatformFeatures(page, target.institutionId, target.institutionSlug));
    await tour.step("vista soporte y bitacora", () => supportSmoke(page, target.institutionId, target.institutionName, SMOKE_ACCOUNTS.newAdmin,
      () => tour.step("vista soporte solo lectura", async () => {})));
    await tour.step("avisos crear editar cerrar terminar", () => platformAnnouncementsSmoke(page, `${info.project.name}-${Date.now()}`));
    await tour.open("avisos de plataforma", "/operador/avisos", () => heading(page, "Avisos de Edukana"));
  } finally {
    await memberContext.close();
  }
  memberTour.finish();
  tour.finish();
});
test("administrador sin permiso operador", async ({ page }, info) => {
  const tour = new Tour(page, info, "sin permiso operador", 510);
  if (!(await start(tour, SMOKE_ACCOUNTS.admin))) return;
  const target = seed.backofficeTargets[info.project.name === "movil" ? "movil" : "escritorio"];
  for (const path of ["/operador", "/operador/tablero", "/operador/planes", "/operador/facturacion",
    "/operador/bitacora", "/operador/ventas", `/operador/${target.institutionId}`, `/operador/${target.institutionId}/vista`]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
  await platformAnnouncementsDeniedSmoke(page);
});
