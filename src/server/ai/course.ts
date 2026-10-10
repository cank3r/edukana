import { db } from "@/lib/db";
import { createQuestion, findManagedCourse, normalizeQuestion, type QuestionInput } from "@/server/assessment/question-bank";
import { AI_LIMIT_MESSAGE, getAiAvailability, recordAiUsage, takeAiAttempt, type AiActor } from "./access";
import { MAX_GENERATED, MIN_GENERATED, parseCourseAnswer, parseGeneratedQuestions, type GeneratedQuestion } from "./parse";
import { ASK_SYSTEM, askPrompt, buildCourseContext, GENERATE_SYSTEM, generatePrompt, lessonText, NOT_IN_COURSE, type ContextLesson, type GenerateKind } from "./prompts";

const NO_COURSE = "No encontramos ese curso o no tienes permiso para gestionarlo.";
const AI_FAILED = "El asistente no respondió. Intenta de nuevo en un momento.";

// --- Contexto del estudiante ----------------------------------------------------------

/**
 * Lecciones que el estudiante puede leer: curso de su institución, publicado y sin archivar,
 * con su matrícula activa o completada; solo capítulos y lecciones publicados. Null si no tiene acceso.
 */
export async function loadStudentCourseLessons(actor: AiActor, courseId: string): Promise<{ courseId: string; lessons: ContextLesson[] } | null> {
  if (!actor.id || !actor.institutionId || !courseId) return null;
  const enrollment = await db.enrollment.findFirst({
    where: {
      studentId: actor.id,
      courseId,
      status: { in: ["ACTIVE", "COMPLETED"] },
      course: { institutionId: actor.institutionId, isPublished: true, archivedAt: null },
    },
    select: { courseId: true },
  });
  if (!enrollment) return null;
  const rows = await db.lesson.findMany({
    where: { institutionId: actor.institutionId, courseId: enrollment.courseId, isPublished: true, section: { isPublished: true } },
    orderBy: [{ section: { order: "asc" } }, { order: "asc" }, { id: "asc" }],
    select: { id: true, title: true, summary: true, content: true, section: { select: { title: true } } },
  });
  return {
    courseId: enrollment.courseId,
    lessons: rows.map((row) => ({ id: row.id, title: row.title, summary: row.summary, content: row.content, sectionTitle: row.section.title })),
  };
}

export type AskResult = { ok: true; found: boolean; answer: string; sources: { id: string; title: string }[] } | { ok: false; message: string };

/** «Pregúntale al curso»: responde solo con el contenido publicado del curso y cita la lección. No guarda historial. */
export async function askCourse(actor: AiActor, input: { courseId: string; lessonId?: string; question: string }): Promise<AskResult> {
  const question = String(input.question ?? "").trim();
  if (question.length < 3) return { ok: false, message: "Escribe tu duda." };
  if (question.length > 1000) return { ok: false, message: "Tu duda es muy larga. Escríbela en menos de 1000 letras." };

  const availability = await getAiAvailability(actor);
  if (!availability.ok) return { ok: false, message: availability.message };
  const course = await loadStudentCourseLessons(actor, input.courseId);
  if (!course) return { ok: false, message: "No encontramos ese curso entre los tuyos." };
  const context = buildCourseContext(course.lessons, { currentLessonId: input.lessonId });
  if (!context.included.length) return { ok: true, found: false, answer: NOT_IN_COURSE, sources: [] };
  if (!(await takeAiAttempt(actor.id))) return { ok: false, message: AI_LIMIT_MESSAGE };

  const { client } = availability;
  let usage = { model: client.model, inputTokens: 0, outputTokens: 0 };
  try {
    const response = await client.complete({ system: ASK_SYSTEM, prompt: askPrompt(context.text, question), maxTokens: 800 });
    usage = { model: response.model, inputTokens: response.inputTokens, outputTokens: response.outputTokens };
    const parsed = parseCourseAnswer(response.text);
    if (!parsed.ok) {
      await recordAiUsage(actor, { feature: "ask-course", courseId: course.courseId, ...usage, outcome: "invalid-output" });
      return parsed;
    }
    await recordAiUsage(actor, { feature: "ask-course", courseId: course.courseId, ...usage, outcome: "ok" });
    // Solo se citan lecciones que de verdad se enviaron como contexto; sin cita no hay respuesta.
    const allowed = new Map(context.included.map((lesson) => [lesson.id, lesson.title]));
    const sources = [...new Set(parsed.data.lessonIds)].filter((id) => allowed.has(id)).map((id) => ({ id, title: allowed.get(id)! }));
    if (!parsed.data.found || !sources.length) return { ok: true, found: false, answer: NOT_IN_COURSE, sources: [] };
    return { ok: true, found: true, answer: parsed.data.answer, sources };
  } catch (error) {
    console.error("askCourse failed", { error: error instanceof Error ? error.message : "unknown" });
    await recordAiUsage(actor, { feature: "ask-course", courseId: course.courseId, ...usage, outcome: "error" });
    return { ok: false, message: AI_FAILED };
  }
}

// --- Preguntas para el docente ---------------------------------------------------------

export type QuestionSource = { id: string; title: string; hasText: boolean; lessons: { id: string; title: string; hasText: boolean }[] };

/** Capítulos y lecciones del curso que la persona gestiona, para elegir de dónde sacar preguntas. */
export async function listQuestionSources(actor: AiActor, courseId: string) {
  const course = await findManagedCourse(actor, courseId);
  if (!course) return null;
  const sections = await db.courseSection.findMany({
    where: { institutionId: actor.institutionId, courseId: course.id },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: {
      id: true,
      title: true,
      lessons: { orderBy: [{ order: "asc" }, { id: "asc" }], select: { id: true, title: true, summary: true, content: true } },
    },
  });
  const chapters: QuestionSource[] = sections.map((section) => {
    const lessons = section.lessons.map((lesson) => ({ id: lesson.id, title: lesson.title, hasText: Boolean(lessonText(lesson)) }));
    return { id: section.id, title: section.title, hasText: lessons.some((lesson) => lesson.hasText), lessons };
  });
  return { course: { id: course.id, name: course.name }, chapters };
}

async function loadSource(actor: AiActor, courseId: string, source: string) {
  const [kind, id] = source.split(":");
  if (!id) return null;
  const scope = { institutionId: actor.institutionId, courseId };
  if (kind === "lesson") {
    const lesson = await db.lesson.findFirst({ where: { ...scope, id }, select: { title: true, summary: true, content: true } });
    return lesson ? { title: lesson.title, text: lessonText(lesson) } : null;
  }
  if (kind === "chapter") {
    const section = await db.courseSection.findFirst({
      where: { ...scope, id },
      select: { title: true, lessons: { orderBy: [{ order: "asc" }, { id: "asc" }], select: { title: true, summary: true, content: true } } },
    });
    if (!section) return null;
    const text = section.lessons.map((lesson) => ({ title: lesson.title, body: lessonText(lesson) })).filter((lesson) => lesson.body).map((lesson) => `## ${lesson.title}\n${lesson.body}`).join("\n\n");
    return { title: section.title, text };
  }
  return null;
}

export type GenerateInput = { courseId: string; source: string; count: number; kind: string };
export type GenerateResult = { ok: true; sourceTitle: string; questions: GeneratedQuestion[] } | { ok: false; message: string };

const KINDS: GenerateKind[] = ["MULTIPLE_CHOICE", "SHORT_ANSWER", "MIXED"];

/** Propone preguntas a partir de una lección o capítulo. No guarda nada: el docente las revisa primero. */
export async function generateQuestionDrafts(actor: AiActor, input: GenerateInput): Promise<GenerateResult> {
  const count = Number(input.count);
  if (!Number.isInteger(count) || count < MIN_GENERATED || count > MAX_GENERATED) return { ok: false, message: `Elige entre ${MIN_GENERATED} y ${MAX_GENERATED} preguntas.` };
  const kind = KINDS.find((value) => value === input.kind);
  if (!kind) return { ok: false, message: "Elige el tipo de preguntas." };

  const course = await findManagedCourse(actor, input.courseId);
  if (!course) return { ok: false, message: NO_COURSE };
  const availability = await getAiAvailability(actor);
  if (!availability.ok) return { ok: false, message: availability.message };
  const source = await loadSource(actor, course.id, String(input.source ?? ""));
  if (!source) return { ok: false, message: "Elige la lección o el capítulo de donde sacar las preguntas." };
  if (source.text.length < 80) return { ok: false, message: "Ese contenido tiene muy poco texto para crear preguntas. Escribe más en la lección o elige otra." };
  if (!(await takeAiAttempt(actor.id))) return { ok: false, message: AI_LIMIT_MESSAGE };

  const { client } = availability;
  let usage = { model: client.model, inputTokens: 0, outputTokens: 0 };
  try {
    const response = await client.complete({ system: GENERATE_SYSTEM, prompt: generatePrompt(source, count, kind), maxTokens: 4000 });
    usage = { model: response.model, inputTokens: response.inputTokens, outputTokens: response.outputTokens };
    const parsed = parseGeneratedQuestions(response.text, count);
    await recordAiUsage(actor, { feature: "generate-questions", courseId: course.id, ...usage, outcome: parsed.ok ? "ok" : "invalid-output" });
    if (!parsed.ok) return parsed;
    return { ok: true, sourceTitle: source.title, questions: parsed.data };
  } catch (error) {
    console.error("generateQuestionDrafts failed", { error: error instanceof Error ? error.message : "unknown" });
    await recordAiUsage(actor, { feature: "generate-questions", courseId: course.id, ...usage, outcome: "error" });
    return { ok: false, message: AI_FAILED };
  }
}

export type SaveResult = { ok: true; saved: number; courseId: string } | { ok: false; message: string };

/**
 * Guarda en el banco las preguntas que el docente revisó. Usa el mismo camino que «Agregar pregunta»
 * (mismas validaciones y permisos). Primero valida todas: si una falla, no se guarda ninguna.
 */
export async function saveReviewedQuestions(actor: AiActor, courseId: string, drafts: QuestionInput[]): Promise<SaveResult> {
  if (!Array.isArray(drafts) || drafts.length === 0) return { ok: false, message: "No hay preguntas para guardar. Conserva al menos una." };
  if (drafts.length > MAX_GENERATED) return { ok: false, message: `Puedes guardar hasta ${MAX_GENERATED} preguntas a la vez.` };
  const course = await findManagedCourse(actor, courseId);
  if (!course) return { ok: false, message: NO_COURSE };
  for (const [index, draft] of drafts.entries()) {
    const checked = normalizeQuestion(draft);
    if (!checked.ok) return { ok: false, message: `Pregunta ${index + 1}: ${checked.message}` };
  }
  let saved = 0;
  for (const [index, draft] of drafts.entries()) {
    const result = await createQuestion(actor, course.id, draft);
    if (!result.ok) return saved ? { ok: false, message: `Se guardaron ${saved}. La pregunta ${index + 1} no se pudo guardar: ${result.message}` } : result;
    saved++;
  }
  return { ok: true, saved, courseId: course.id };
}
