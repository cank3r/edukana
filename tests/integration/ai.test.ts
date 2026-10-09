import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { setInstitutionAiEnabled, takeAiAttempt } from "@/server/ai/access";
import { setAiClientForTests, type AiClient, type AiRequest } from "@/server/ai/client";
import { askCourse, generateQuestionDrafts, loadStudentCourseLessons, saveReviewedQuestions } from "@/server/ai/course";
import { NOT_IN_COURSE } from "@/server/ai/prompts";
import { A, B, ensureSeed } from "./setup";

// Curso A: capítulo publicado (lección publicada + borrador) y capítulo borrador (lección publicada que no cuenta).
// Curso A2 (el estudiante no está inscrito) y curso B (otra institución), cada uno con una lección publicada.
const SECTIONS = [
  { id: "ai_s1", courseId: A.courseId, institutionId: A.institutionId, order: 9301, isPublished: true },
  { id: "ai_s2", courseId: A.courseId, institutionId: A.institutionId, order: 9302, isPublished: false },
  { id: "ai_s3", courseId: A.course2Id, institutionId: A.institutionId, order: 9303, isPublished: true },
  { id: "ai_s4", courseId: B.courseId, institutionId: B.institutionId, order: 9304, isPublished: true },
];
const LONG = " La fotosíntesis transforma la luz del sol en energía química dentro de los cloroplastos de las hojas.";
const LESSONS = [
  { id: "ai_l1", sectionId: "ai_s1", isPublished: true, content: `SECRETO-PUBLICADO${LONG}` },
  { id: "ai_l2", sectionId: "ai_s1", isPublished: false, content: `SECRETO-BORRADOR${LONG}` },
  { id: "ai_l3", sectionId: "ai_s2", isPublished: true, content: `SECRETO-CAPITULO-BORRADOR${LONG}` },
  { id: "ai_l4", sectionId: "ai_s3", isPublished: true, content: `SECRETO-OTRO-CURSO${LONG}` },
  { id: "ai_l5", sectionId: "ai_s4", isPublished: true, content: `SECRETO-OTRA-INSTITUCION${LONG}` },
];
const LESSON_IDS = LESSONS.map((lesson) => lesson.id);
const SECTION_IDS = SECTIONS.map((section) => section.id);

class FakeAi implements AiClient {
  readonly model = "modelo-de-prueba";
  requests: AiRequest[] = [];
  reply = "{}";
  async complete(request: AiRequest) {
    this.requests.push(request);
    return { text: this.reply, inputTokens: 120, outputTokens: 40, model: this.model };
  }
}
const ai = new FakeAi();
const STUDENT_QUESTION = "PREGUNTA-PRIVADA ¿qué es la fotosíntesis?";
const mc = { type: "MULTIPLE_CHOICE", prompt: "¿Dónde ocurre la fotosíntesis?", options: ["Cloroplastos", "Raíz", "Núcleo"], correctIndex: 0, explanation: "Lo dice la lección." };
const sa = { type: "SHORT_ANSWER", prompt: "¿Qué produce la fotosíntesis?", answer: "Energía química." };
const bankCount = (courseId = A.courseId) => db.questionBankItem.count({ where: { courseId, prompt: { in: [mc.prompt, sa.prompt] } } });
let savedSettings: { a: unknown; b: unknown };

before(async () => {
  process.env.AUTH_SECRET ||= "integration-secret-at-least-32-characters-long";
  await ensureSeed();
  const institutions = await db.institution.findMany({ where: { id: { in: [A.institutionId, B.institutionId] } }, select: { id: true, settings: true } });
  savedSettings = { a: institutions.find((row) => row.id === A.institutionId)?.settings ?? {}, b: institutions.find((row) => row.id === B.institutionId)?.settings ?? {} };
  for (const section of SECTIONS) await db.courseSection.create({ data: { ...section, title: `Capítulo ${section.id}` } });
  for (const [index, lesson] of LESSONS.entries()) {
    const section = SECTIONS.find((item) => item.id === lesson.sectionId)!;
    await db.lesson.create({ data: { ...lesson, order: index + 1, institutionId: section.institutionId, courseId: section.courseId, title: `Lección ${lesson.id}` } });
  }
});
beforeEach(async () => {
  setAiClientForTests(ai);
  ai.requests.length = 0;
  await db.loginAttempt.deleteMany();
  await db.institution.update({ where: { id: A.institutionId }, data: { settings: savedSettings.a as Prisma.InputJsonValue } });
});
after(async () => {
  setAiClientForTests(undefined);
  await db.questionBankItem.deleteMany({ where: { prompt: { in: [mc.prompt, sa.prompt] } } });
  await db.lesson.deleteMany({ where: { id: { in: LESSON_IDS } } });
  await db.courseSection.deleteMany({ where: { id: { in: SECTION_IDS } } });
  await db.auditLog.deleteMany({ where: { action: { in: ["AI_USED", "AI_SETTING_UPDATED"] } } });
  await db.loginAttempt.deleteMany();
  await db.institution.update({ where: { id: A.institutionId }, data: { settings: savedSettings.a as Prisma.InputJsonValue } });
  await db.institution.update({ where: { id: B.institutionId }, data: { settings: savedSettings.b as Prisma.InputJsonValue } });
  await db.$disconnect();
});

test("IA contexto: solo lecciones publicadas de capítulos publicados del curso inscrito", async () => {
  const course = await loadStudentCourseLessons(A.student, A.courseId);
  const ids = course?.lessons.map((lesson) => lesson.id).filter((id) => LESSON_IDS.includes(id));
  assert.deepEqual(ids, ["ai_l1"]);
  assert.equal(await loadStudentCourseLessons(A.student, A.course2Id), null, "curso no inscrito");
  assert.equal(await loadStudentCourseLessons(A.student, B.courseId), null, "curso de otra institución");
  assert.equal(await loadStudentCourseLessons(B.student, A.courseId), null, "estudiante de otra institución");
  assert.equal(await loadStudentCourseLessons({ ...A.student, institutionId: B.institutionId }, A.courseId), null, "sesión con otra institución");
});

test("IA pregunta: responde con el curso, cita solo lecciones enviadas y no guarda el texto", async () => {
  ai.reply = JSON.stringify({ found: true, answer: "Ocurre en los cloroplastos.", lessonIds: ["ai_l1", "ai_l5", "ai_l2"] });
  const result = await askCourse(A.student, { courseId: A.courseId, lessonId: "ai_l1", question: STUDENT_QUESTION });
  assert.deepEqual(result, { ok: true, found: true, answer: "Ocurre en los cloroplastos.", sources: [{ id: "ai_l1", title: "Lección ai_l1" }] });

  const [request] = ai.requests;
  assert.match(request.prompt, /SECRETO-PUBLICADO/);
  for (const hidden of ["SECRETO-BORRADOR", "SECRETO-CAPITULO-BORRADOR", "SECRETO-OTRO-CURSO", "SECRETO-OTRA-INSTITUCION"]) assert.doesNotMatch(request.prompt, new RegExp(hidden));
  assert.doesNotMatch(request.system, /PREGUNTA-PRIVADA/, "la pregunta del estudiante nunca va en las instrucciones");
  assert.match(request.prompt, /<pregunta_del_estudiante>\nPREGUNTA-PRIVADA/);

  const logs = await db.auditLog.findMany({ where: { action: "AI_USED", userId: A.student.id } });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].institutionId, A.institutionId);
  assert.doesNotMatch(JSON.stringify(logs[0].changes), /PREGUNTA-PRIVADA|cloroplastos|SECRETO/);
});

test("IA pregunta: si no está en el curso o no cita, dice que le pregunte al docente", async () => {
  ai.reply = JSON.stringify({ found: false, answer: "", lessonIds: [] });
  assert.deepEqual(await askCourse(A.student, { courseId: A.courseId, question: "¿Quién ganó el mundial?" }), { ok: true, found: false, answer: NOT_IN_COURSE, sources: [] });
  ai.reply = JSON.stringify({ found: true, answer: "Inventado.", lessonIds: ["ai_l5"] });
  assert.deepEqual(await askCourse(A.student, { courseId: A.courseId, question: "¿Algo?" }), { ok: true, found: false, answer: NOT_IN_COURSE, sources: [] });
});

test("IA pregunta: sin acceso al curso no llama a la IA", async () => {
  for (const [actor, courseId] of [[A.student, A.course2Id], [B.student, A.courseId], [A.student, B.courseId]] as const) {
    const result = await askCourse(actor, { courseId, question: "¿Qué es esto?" });
    assert.equal(result.ok, false);
  }
  assert.equal(ai.requests.length, 0);
});

test("IA: sin clave o apagada por la institución queda desactivada y no se llama", async () => {
  setAiClientForTests(null);
  const off = await askCourse(A.student, { courseId: A.courseId, question: "¿Qué es esto?" });
  assert.deepEqual(off, { ok: false, message: "El asistente de IA no está activado en esta plataforma." });

  setAiClientForTests(ai);
  assert.equal((await setInstitutionAiEnabled(A.teacher, false)).ok, false, "un docente no puede apagarla");
  assert.deepEqual(await setInstitutionAiEnabled(A.admin, false), { ok: true });
  const institution = await db.institution.findUniqueOrThrow({ where: { id: A.institutionId }, select: { settings: true } });
  assert.deepEqual((institution.settings as { ai?: unknown }).ai, { enabled: false });
  assert.deepEqual(await askCourse(A.student, { courseId: A.courseId, question: "¿Qué es esto?" }), { ok: false, message: "Tu institución apagó el asistente de IA." });
  const drafts = await generateQuestionDrafts(A.teacher, { courseId: A.courseId, source: "lesson:ai_l1", count: 3, kind: "MIXED" });
  assert.deepEqual(drafts, { ok: false, message: "Tu institución apagó el asistente de IA." });
  assert.equal(ai.requests.length, 0);
  // La institución B no se ve afectada.
  ai.reply = JSON.stringify({ found: false, answer: "", lessonIds: [] });
  assert.equal((await askCourse(B.student, { courseId: B.courseId, question: "¿Qué es esto?" })).ok, true);
});

test("IA genera: el docente del curso recibe borradores validados; nada se guarda", async () => {
  ai.reply = JSON.stringify({ questions: [mc, sa] });
  const before = await bankCount();
  const result = await generateQuestionDrafts(A.teacher, { courseId: A.courseId, source: "lesson:ai_l2", count: 3, kind: "MIXED" });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.questions.length, 2);
  assert.match(ai.requests[0].prompt, /SECRETO-BORRADOR/, "el docente puede usar sus borradores");
  assert.equal(await bankCount(), before);

  ai.reply = "{\"questions\": [{\"type\": \"MULTIPLE_CHOICE\"}]}";
  const bad = await generateQuestionDrafts(A.teacher, { courseId: A.courseId, source: "chapter:ai_s1", count: 3, kind: "MULTIPLE_CHOICE" });
  assert.equal(bad.ok, false);
  assert.match(bad.ok ? "" : bad.message, /preguntas incompletas \(pregunta 1/);

  const requests = ai.requests.length;
  for (const actor of [A.student, B.teacher, A.teacher2]) {
    const denied = await generateQuestionDrafts(actor, { courseId: A.courseId, source: "lesson:ai_l1", count: 3, kind: "MIXED" });
    assert.deepEqual(denied, { ok: false, message: "No encontramos ese curso o no tienes permiso para gestionarlo." });
  }
  const foreignSource = await generateQuestionDrafts(A.teacher, { courseId: A.courseId, source: "lesson:ai_l5", count: 3, kind: "MIXED" });
  assert.equal(foreignSource.ok, false, "una lección de otra institución no sirve de fuente");
  assert.equal((await generateQuestionDrafts(A.teacher, { courseId: A.courseId, source: "lesson:ai_l1", count: 11, kind: "MIXED" })).ok, false);
  assert.equal(ai.requests.length, requests);
});

test("IA guarda: las revisadas entran al banco por el camino existente y respetan permisos", async () => {
  const drafts = [{ ...mc, points: 2 }, { ...sa, points: 1 }];
  for (const actor of [B.teacher, A.teacher2, A.student]) {
    assert.equal((await saveReviewedQuestions(actor, A.courseId, drafts)).ok, false);
  }
  assert.equal((await saveReviewedQuestions({ ...A.teacher, institutionId: B.institutionId }, A.courseId, drafts)).ok, false);
  assert.equal(await bankCount(), 0);

  const invalid = await saveReviewedQuestions(A.teacher, A.courseId, [drafts[0], { ...mc, correctIndex: undefined, points: 1 }]);
  assert.deepEqual(invalid, { ok: false, message: "Pregunta 2: Marca cuál opción es la correcta." });
  assert.equal(await bankCount(), 0, "si una falla no se guarda ninguna");

  assert.deepEqual(await saveReviewedQuestions(A.teacher, A.courseId, drafts), { ok: true, saved: 2, courseId: A.courseId });
  const rows = await db.questionBankItem.findMany({ where: { courseId: A.courseId, prompt: { in: [mc.prompt, sa.prompt] } }, orderBy: { prompt: "asc" } });
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.institutionId === A.institutionId));
  const choice = rows.find((row) => row.type === "MULTIPLE_CHOICE")!;
  assert.equal(choice.answerKey, "Cloroplastos");
  assert.equal(choice.defaultPoints, 2);
  assert.equal(rows.find((row) => row.type === "SHORT_ANSWER")?.answerKey, "Energía química.");
});

test("IA límite: cuenta por persona y por hora", async () => {
  const now = new Date();
  assert.equal(await takeAiAttempt(A.student.id, now, 2), true);
  assert.equal(await takeAiAttempt(A.student.id, now, 2), true);
  assert.equal(await takeAiAttempt(A.student.id, now, 2), false);
  assert.equal(await takeAiAttempt(A.student2.id, now, 2), true, "otra persona tiene su propio límite");
  assert.equal(await takeAiAttempt(A.student.id, new Date(now.getTime() + 61 * 60_000), 2), true, "pasada la hora vuelve a poder");
});
