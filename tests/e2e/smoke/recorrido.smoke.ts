import { expect, test, type Page } from "@playwright/test";
import { Tour } from "./harness";
import { demoDayKey, loadSeed, SMOKE_ACCOUNTS } from "./shared";

/**
 * Recorrido en navegador de las pantallas del curso completo, con la semilla de `seed.ts`.
 *
 * Tres recorridos independientes (administrador, docente, estudiante). Cada uno entra por el
 * formulario real de `/login`. Lo que cada recorrido crea lleva el nombre del proyecto
 * (móvil / escritorio) para que las dos pasadas no choquen sobre la misma base; el estudiante
 * del proyecto móvil es Ana y el del escritorio es Pedro.
 */

const seed = loadSeed();
const course = `/dashboard/aula/${seed.courseId}`;

/** Hay texto repetido en partes ocultas (menú móvil cerrado, tabla o tarjetas según el ancho): solo cuenta lo visible. */
const visible = (page: Page, text: string | RegExp) => expect(page.getByText(text).filter({ visible: true }).first()).toBeVisible();
const heading = (page: Page, name: string | RegExp) => expect(page.getByRole("heading", { name }).first()).toBeVisible();
/** Mensaje de éxito de una acción (los formularios lo muestran con role="status"). */
const done = (page: Page, text: RegExp) => expect(page.getByRole("status").filter({ hasText: text }).first()).toBeVisible();

test("administrador", async ({ page }, info) => {
  const tag = info.project.name;
  const tour = new Tour(page, info, "administrador", 1);
  try {
    await tour.login(SMOKE_ACCOUNTS.admin);
  } catch (error) {
    await tour.aborted(`No se pudo iniciar sesión: ${String(error).slice(0, 200)}`);
    tour.finish();
    return;
  }

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
  await tour.open("importar e invitar", "/dashboard/gestion/accesos", () => heading(page, "Personas y acceso"));
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
  tour.finish();
});

test("docente", async ({ page }, info) => {
  const tag = info.project.name;
  const tour = new Tour(page, info, "docente", 30);
  try {
    await tour.login(SMOKE_ACCOUNTS.teacher);
  } catch (error) {
    await tour.aborted(`No se pudo iniciar sesión: ${String(error).slice(0, 200)}`);
    tour.finish();
    return;
  }

  await tour.open("inicio", "/dashboard", async () => {
    await heading(page, "¿Qué tengo hoy?");
    await visible(page, "Matemática Básica");
  });
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
    await page.getByRole("button", { name: `Publicar lección ${lesson}` }).click();
    await expect(page.getByRole("button", { name: `Ocultar lección ${lesson}` })).toBeVisible();
    await page.getByRole("button", { name: `Publicar capítulo ${chapter}` }).click();
    await expect(page.getByRole("button", { name: `Ocultar capítulo ${chapter}` })).toBeVisible();
  });

  await tour.open("estudiantes", `${course}/estudiantes`, () => visible(page, "Ana Rodríguez"));

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

  await tour.open("banco de preguntas", `${course}/preguntas`, () => visible(page, "¿Cuánto es 27 + 15?"));
  await tour.open("pregunta nueva", `${course}/preguntas/nueva`);
  await tour.open("examenes", `${course}/examenes`, () => visible(page, "Prueba corta: suma y resta"));
  await tour.step("examen sembrado", async () => {
    await page.getByRole("link", { name: "Editar" }).first().click();
    await page.waitForURL(new RegExp(`/examenes/${seed.examId}$`));
    await visible(page, /Prueba corta|suma y resta/);
  });
  await tour.open("examen resultados", `${course}/examenes/${seed.examId}/resultados`);

  await tour.open("calificaciones", `${course}/calificaciones`, async () => {
    const simple = page.getByRole("button", { name: "Usar configuración sencilla" });
    if (await simple.isVisible().catch(() => false)) {
      await simple.click();
      await done(page, /Listo/);
    }
    await heading(page, "Notas de 2 estudiantes");
    await visible(page, "Ana Rodríguez");
  });

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
  await tour.open("avisos", "/dashboard/comunidad", () => visible(page, "Bienvenidos al nuevo período"));
  await tour.open("calendario", "/dashboard/calendario", () => heading(page, "Calendario"));
  await tour.open("mi perfil", "/dashboard/perfil", async () => {
    await heading(page, "Mi perfil");
    await visible(page, SMOKE_ACCOUNTS.teacher);
  });
  tour.finish();
});

test("estudiante", async ({ page }, info) => {
  const mobile = info.project.name === "movil";
  const email = mobile ? SMOKE_ACCOUNTS.student1 : SMOKE_ACCOUNTS.student2;
  const tour = new Tour(page, info, "estudiante", 60);
  try {
    await tour.login(email);
  } catch (error) {
    await tour.aborted(`No se pudo iniciar sesión: ${String(error).slice(0, 200)}`);
    tour.finish();
    return;
  }

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
  tour.finish();
});
