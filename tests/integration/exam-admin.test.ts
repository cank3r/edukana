import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import {
  LOCKED_MESSAGE,
  createExam,
  dateToZonedInput,
  deleteExam,
  getExamForm,
  getExamResults,
  listExams,
  reviewExamAttempt,
  setExamPublished,
  updateExam,
  zonedInputToDate,
  type ExamInput,
} from "@/server/assessment/exam-admin";
import { createQuestion, deleteQuestion, getQuestion, listQuestions, updateQuestion } from "@/server/assessment/question-bank";
import { startExamAttempt, submitExamAttempt } from "@/server/exams";
import { A, B, ensureSeed } from "./setup";

const TAG = "ITEA";
const PERIOD = "it_ea_period";
const CATEGORY = "it_ea_category";
const student = { id: A.student.id, institutionId: A.institutionId };
const outsiders = [A.teacher2, A.student, A.parent, B.teacher, B.admin, B.coordinator];

async function question(kind: "mc" | "tf" | "open", courseId = A.courseId, actor = A.teacher) {
  const input = {
    mc: { type: "MULTIPLE_CHOICE", prompt: `${TAG} ¿Cuánto es 2 + 2?`, options: ["3", " 4 ", "", "5"], correctIndex: 1, points: 2 },
    tf: { type: "TRUE_FALSE", prompt: `${TAG} El agua moja.`, answer: "Verdadero", points: 1 },
    open: { type: "SHORT_ANSWER", prompt: `${TAG} Explica el ciclo del agua.`, answer: "Evaporación, condensación y lluvia", points: 3 },
  }[kind];
  const result = await createQuestion(actor, courseId, input);
  assert.ok(result.ok, !result.ok ? result.message : "");
  if (!result.ok) throw new Error(result.message);
  return result.id;
}

function examInput(questions: ExamInput["questions"], extra: Partial<ExamInput> = {}): ExamInput {
  return { title: `${TAG} Examen`, instructions: "Lee con calma.", questions, durationMinutes: 30, maxAttempts: 2, showReview: true, ...extra };
}

async function exam(questions: ExamInput["questions"], extra: Partial<ExamInput> = {}) {
  const result = await createExam(A.teacher, A.courseId, examInput(questions, extra));
  assert.ok(result.ok, !result.ok ? result.message : "");
  if (!result.ok) throw new Error(result.message);
  return result.id;
}

before(async () => {
  await ensureSeed();
  const base = { institutionId: A.institutionId, courseId: A.courseId };
  await db.gradingPeriod.create({
    data: {
      id: PERIOD,
      ...base,
      academicPeriodId: "a_period",
      name: "Período de prueba de armado de exámenes",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-12-31"),
      categories: { create: { id: CATEGORY, ...base, name: "Exámenes armados", weight: 100 } },
    },
  });
});

after(async () => {
  await db.exam.deleteMany({ where: { title: { startsWith: TAG } } });
  await db.gradingPeriod.deleteMany({ where: { id: PERIOD } });
  await db.questionBankItem.deleteMany({ where: { prompt: { startsWith: TAG } } });
  await db.auditLog.deleteMany({ where: { action: "EXAM_DELETED" } });
  await db.$disconnect();
});

test("fechas: la hora del reloj de la institución se convierte al instante real y vuelve igual", () => {
  const date = zonedInputToDate("2026-10-09T08:30", "America/Santo_Domingo");
  assert.equal(date?.toISOString(), "2026-10-09T12:30:00.000Z");
  assert.equal(dateToZonedInput(date, "America/Santo_Domingo"), "2026-10-09T08:30");
  assert.equal(zonedInputToDate("2026-07-01T09:00", "America/New_York")?.toISOString(), "2026-07-01T13:00:00.000Z");
  assert.equal(zonedInputToDate("2026-12-01T09:00", "America/New_York")?.toISOString(), "2026-12-01T14:00:00.000Z");
  assert.equal(zonedInputToDate("2026-02-30T09:00", "America/Santo_Domingo"), null);
  assert.equal(zonedInputToDate("mañana", "America/Santo_Domingo"), null);
  assert.equal(dateToZonedInput(null, "America/Santo_Domingo"), "");
});

test("banco: crear guarda cada tipo en el formato que califica el examen", async () => {
  const [mc, tf, open] = [await question("mc"), await question("tf"), await question("open")];
  const rows = await db.questionBankItem.findMany({ where: { id: { in: [mc, tf, open] } } });
  const byId = new Map(rows.map((row) => [row.id, row]));
  assert.deepEqual(byId.get(mc)?.options, ["3", "4", "5"]);
  assert.equal(byId.get(mc)?.answerKey, "4");
  assert.equal(byId.get(mc)?.defaultPoints, 2);
  assert.deepEqual(byId.get(tf)?.options, ["Verdadero", "Falso"]);
  assert.equal(byId.get(tf)?.answerKey, "Verdadero");
  assert.equal(byId.get(open)?.options, null);
  assert.equal(byId.get(open)?.answerKey, "Evaporación, condensación y lluvia");
  assert.ok(rows.every((row) => row.institutionId === A.institutionId && row.courseId === A.courseId));
});

test("banco: rechaza preguntas incompletas con un mensaje claro", async () => {
  const base = { type: "MULTIPLE_CHOICE", prompt: `${TAG} incompleta`, points: 1 };
  const cases: Array<[Parameters<typeof createQuestion>[2], RegExp]> = [
    [{ ...base, options: ["sola"], correctIndex: 0 }, /al menos dos opciones/],
    [{ ...base, options: ["a", "b", "c", "d", "e", "f", "g"], correctIndex: 0 }, /hasta seis/],
    [{ ...base, options: ["a", "b"] }, /cuál opción es la correcta/],
    [{ ...base, options: ["a", ""], correctIndex: 1 }, /al menos dos opciones/],
    [{ ...base, options: ["Sí", " si "], correctIndex: 0 }, /dos opciones iguales/],
    [{ ...base, type: "TRUE_FALSE", answer: "quizás" }, /Verdadero o Falso/],
    [{ ...base, type: "SHORT_ANSWER", answer: "  " }, /respuesta esperada/],
    [{ ...base, options: ["a", "b"], correctIndex: 0, points: 0 }, /mayores que cero/],
    [{ ...base, type: "ENSAYO", options: ["a", "b"], correctIndex: 0 }, /tipo de pregunta/],
    [{ ...base, prompt: " ", options: ["a", "b"], correctIndex: 0 }, /Escribe la pregunta/],
  ];
  for (const [input, expected] of cases) {
    const result = await createQuestion(A.teacher, A.courseId, input);
    assert.equal(result.ok, false);
    assert.match(!result.ok ? result.message : "", expected);
  }
  assert.equal(await db.questionBankItem.count({ where: { prompt: { contains: "incompleta" } } }), 0);
});

test("banco: buscar, filtrar por tipo, editar y borrar", async () => {
  const id = await question("tf");
  const updated = await updateQuestion(A.teacher, id, { type: "SHORT_ANSWER", prompt: `${TAG} Pregunta zafiro corregida`, answer: "azul", explanation: " Es una piedra azul. ", points: 4 });
  assert.equal(updated.ok, true);
  const row = await db.questionBankItem.findUniqueOrThrow({ where: { id } });
  assert.deepEqual([row.type, row.options, row.answerKey, row.explanation, row.defaultPoints], ["SHORT_ANSWER", null, "azul", "Es una piedra azul.", 4]);

  const found = await listQuestions(A.teacher, A.courseId, { q: "ZAFIRO" });
  assert.deepEqual(found?.questions.map((item) => item.id), [id]);
  assert.ok((found?.total ?? 0) >= 1);
  const byType = await listQuestions(A.coordinator, A.courseId, { type: "SHORT_ANSWER" });
  assert.ok(byType?.questions.some((item) => item.id === id));
  assert.ok(byType?.questions.every((item) => item.type === "SHORT_ANSWER"));
  const other = await listQuestions(A.teacher, A.courseId, { q: "zafiro", type: "TRUE_FALSE" });
  assert.deepEqual(other?.questions, []);

  assert.equal((await deleteQuestion(A.admin, id)).ok, true);
  assert.equal(await db.questionBankItem.count({ where: { id } }), 0);
});

test("permisos: docente ajeno, estudiante, tutor y usuarios de otra institución son rechazados", async () => {
  const mc = await question("mc");
  const examId = await exam([{ bankItemId: mc, points: 2 }]);
  const edit = { type: "TRUE_FALSE", prompt: `${TAG} cambiada por un intruso`, answer: "Falso", points: 9 };
  for (const actor of outsiders) {
    const label = `${actor.id}`;
    assert.equal((await createQuestion(actor, A.courseId, edit)).ok, false, label);
    assert.equal((await updateQuestion(actor, mc, edit)).ok, false, label);
    assert.equal((await deleteQuestion(actor, mc)).ok, false, label);
    assert.equal(await listQuestions(actor, A.courseId), null, label);
    assert.equal(await getQuestion(actor, mc), null, label);
    assert.equal((await createExam(actor, A.courseId, examInput([{ bankItemId: mc, points: 1 }]))).ok, false, label);
    assert.equal((await updateExam(actor, examId, examInput([], { title: `${TAG} tomado` }))).ok, false, label);
    assert.equal((await setExamPublished(actor, examId, true)).ok, false, label);
    assert.equal((await deleteExam(actor, examId, "porque sí, motivo largo")).ok, false, label);
    assert.equal(await listExams(actor, A.courseId), null, label);
    assert.equal(await getExamForm(actor, A.courseId, examId), null, label);
    assert.equal(await getExamResults(actor, examId), null, label);
  }
  const untouched = await db.questionBankItem.findUniqueOrThrow({ where: { id: mc } });
  assert.equal(untouched.answerKey, "4");
  const sameExam = await db.exam.findUniqueOrThrow({ where: { id: examId }, include: { questions: true } });
  assert.deepEqual([sameExam.title, sameExam.isPublished, sameExam.questions.length], [`${TAG} Examen`, false, 1]);
  assert.equal(await db.questionBankItem.count({ where: { prompt: { contains: "intruso" } } }), 0);
  // Quien sí gestiona el curso: su docente y la coordinación o administración de la misma institución.
  assert.ok(await listExams(A.teacher, A.courseId));
  assert.ok(await getExamForm(A.admin, A.courseId, examId));
});

test("examen: no admite preguntas de otro curso ni de otra institución, ni repetidas", async () => {
  const own = await question("mc");
  const otherCourse = await question("tf", A.course2Id, A.teacher2);
  const otherInstitution = await question("tf", B.courseId, B.teacher);
  try {
    for (const foreign of [otherCourse, otherInstitution]) {
      for (const actor of [A.teacher, A.admin]) {
        const created = await createExam(actor, A.courseId, examInput([{ bankItemId: own, points: 1 }, { bankItemId: foreign, points: 1 }], { title: `${TAG} con pregunta ajena` }));
        assert.equal(created.ok, false);
        assert.match(!created.ok ? created.message : "", /no pertenece al banco de este curso/);
      }
    }
    assert.equal(await db.exam.count({ where: { title: `${TAG} con pregunta ajena` } }), 0);

    const examId = await exam([{ bankItemId: own, points: 1 }]);
    const updated = await updateExam(A.teacher, examId, examInput([{ bankItemId: own, points: 1 }, { bankItemId: otherCourse, points: 1 }]));
    assert.equal(updated.ok, false);
    assert.equal(await db.examQuestion.count({ where: { examId } }), 1);

    const repeated = await createExam(A.teacher, A.courseId, examInput([{ bankItemId: own, points: 1 }, { bankItemId: own, points: 2 }]));
    assert.match(!repeated.ok ? repeated.message : "", /repetida/);
  } finally {
    await db.questionBankItem.deleteMany({ where: { id: { in: [otherCourse, otherInstitution] } } });
  }
});

test("examen: se crea como borrador y no se publica sin preguntas ni con cero puntos", async () => {
  const mc = await question("mc");
  const emptyId = await exam([], { title: `${TAG} vacío` });
  const draft = await db.exam.findUniqueOrThrow({ where: { id: emptyId } });
  assert.equal(draft.isPublished, false);
  const noQuestions = await setExamPublished(A.teacher, emptyId, true);
  assert.match(!noQuestions.ok ? noQuestions.message : "", /al menos una pregunta/);

  const zeroId = await exam([{ bankItemId: mc, points: 0 }], { title: `${TAG} sin puntos` });
  const noPoints = await setExamPublished(A.teacher, zeroId, true);
  assert.match(!noPoints.ok ? noPoints.message : "", /más de 0 puntos/);
  assert.equal(await db.exam.count({ where: { id: { in: [emptyId, zeroId] }, isPublished: true } }), 0);

  // Un borrador no se puede presentar.
  const hidden = await startExamAttempt(student, zeroId);
  assert.equal(hidden.ok, false);

  const invalid: Array<[Partial<ExamInput>, RegExp]> = [
    [{ title: "ab" }, /título/],
    [{ maxAttempts: 0 }, /al menos 1 intento/],
    [{ durationMinutes: 0 }, /al menos 1 minuto/],
    [{ durationMinutes: 12.5 }, /entero/],
    [{ opensAt: "2026-10-10T10:00", closesAt: "2026-10-10T09:00" }, /después de la apertura/],
    [{ closesAt: "pronto" }, /fecha de cierre/],
  ];
  for (const [extra, expected] of invalid) {
    const result = await createExam(A.teacher, A.courseId, examInput([{ bankItemId: mc, points: 1 }], extra));
    assert.equal(result.ok, false);
    assert.match(!result.ok ? result.message : "", expected);
  }
});

test("examen: guarda reglas, fechas en la hora de la institución, orden y puntos; se reordena mientras no tenga intentos", async () => {
  const [mc, tf, open] = [await question("mc"), await question("tf"), await question("open")];
  const examId = await exam(
    [{ bankItemId: tf, points: 1.5 }, { bankItemId: mc, points: 4 }],
    { title: `${TAG} Parcial`, durationMinutes: null, maxAttempts: 3, showReview: false, opensAt: "2026-10-09T08:00", closesAt: "2026-10-09T10:00", gradeCategoryId: CATEGORY },
  );
  const saved = await db.exam.findUniqueOrThrow({ where: { id: examId }, include: { questions: { orderBy: { order: "asc" } }, gradeItem: true } });
  assert.deepEqual(
    [saved.durationMinutes, saved.maxAttempts, saved.showReview, saved.isPublished, saved.opensAt?.toISOString(), saved.closesAt?.toISOString()],
    [null, 3, false, false, "2026-10-09T12:00:00.000Z", "2026-10-09T14:00:00.000Z"],
  );
  assert.deepEqual(saved.questions.map((item) => [item.bankItemId, item.order, item.points]), [[tf, 0, 1.5], [mc, 1, 4]]);
  assert.deepEqual(saved.questions[1].snapshot, { type: "MULTIPLE_CHOICE", prompt: `${TAG} ¿Cuánto es 2 + 2?`, options: ["3", "4", "5"], answerKey: "4", points: 4 });
  assert.deepEqual([saved.gradeItem?.maxScore, saved.gradeItem?.categoryId, saved.gradeItem?.isPublished, saved.gradeItem?.title], [5.5, CATEGORY, false, `${TAG} Parcial`]);

  const form = await getExamForm(A.teacher, A.courseId, examId);
  assert.deepEqual([form?.exam?.opensAt, form?.exam?.closesAt, form?.exam?.attemptCount], ["2026-10-09T08:00", "2026-10-09T10:00", 0]);

  // Corregir la pregunta en el banco no toca la copia del examen, ni siquiera al rearmarlo.
  await updateQuestion(A.teacher, mc, { type: "MULTIPLE_CHOICE", prompt: `${TAG} ¿Cuánto es 3 + 3?`, options: ["6", "7"], correctIndex: 0, points: 2 });
  const rearranged = await updateExam(
    A.teacher,
    examId,
    examInput([{ bankItemId: open, points: 3 }, { bankItemId: mc, points: 2 }], { title: `${TAG} Parcial corregido`, durationMinutes: 45, maxAttempts: 1, showReview: true }),
  );
  assert.ok(rearranged.ok, !rearranged.ok ? rearranged.message : "");
  const rebuilt = await db.exam.findUniqueOrThrow({ where: { id: examId }, include: { questions: { orderBy: { order: "asc" } }, gradeItem: true } });
  assert.deepEqual(rebuilt.questions.map((item) => [item.bankItemId, item.order, item.points]), [[open, 0, 3], [mc, 1, 2]]);
  assert.deepEqual(rebuilt.questions[1].snapshot, { type: "MULTIPLE_CHOICE", prompt: `${TAG} ¿Cuánto es 2 + 2?`, options: ["3", "4", "5"], answerKey: "4", points: 2 });
  assert.deepEqual([rebuilt.title, rebuilt.durationMinutes, rebuilt.maxAttempts, rebuilt.showReview, rebuilt.opensAt, rebuilt.closesAt], [`${TAG} Parcial corregido`, 45, 1, true, null, null]);
  assert.deepEqual([rebuilt.gradeItem?.maxScore, rebuilt.gradeItem?.title], [5, `${TAG} Parcial corregido`]);

  const listed = (await listExams(A.teacher, A.courseId))?.exams.find((item) => item.id === examId);
  assert.deepEqual([listed?.status, listed?.questionCount, listed?.totalPoints, listed?.submittedAttempts], ["DRAFT", 2, 5, 0]);

  // Sin intentos se borra sin motivo, junto con su renglón vacío del libro de calificaciones.
  const removed = await deleteExam(A.teacher, examId);
  assert.ok(removed.ok, !removed.ok ? removed.message : "");
  assert.equal(await db.exam.count({ where: { id: examId } }), 0);
  assert.equal(await db.gradeItem.count({ where: { id: saved.gradeItem?.id } }), 0);
  assert.equal(await db.questionBankItem.count({ where: { id: { in: [mc, tf, open] } } }), 3);
});

test("compatibilidad: un examen armado aquí se inicia, se envía y se autocalifica con src/server/exams.ts", async () => {
  const [mc, tf] = [await question("mc"), await question("tf")];
  const examId = await exam([{ bankItemId: tf, points: 1 }, { bankItemId: mc, points: 5 }], { title: `${TAG} Compatibilidad`, gradeCategoryId: CATEGORY });
  const published = await setExamPublished(A.teacher, examId, true);
  assert.ok(published.ok, !published.ok ? published.message : "");
  const gradeItem = await db.gradeItem.findFirstOrThrow({ where: { examId } });
  assert.deepEqual([gradeItem.isPublished, gradeItem.maxScore], [true, 6]);

  const started = await startExamAttempt(student, examId);
  assert.ok(started.ok, !started.ok ? started.message : "");
  if (!started.ok) return;
  assert.deepEqual(started.questions.map((item) => [item.bankItemId, item.type, item.points]), [[tf, "TRUE_FALSE", 1], [mc, "MULTIPLE_CHOICE", 5]]);
  assert.deepEqual(started.questions.map((item) => item.options), [["Verdadero", "Falso"], ["3", "4", "5"]]);
  assert.equal(JSON.stringify(started.questions).includes("answerKey"), false);
  assert.equal(started.expiresAt.getTime() - Date.now() <= 30 * 60_000, true);

  // El estudiante responde con el texto de la opción que eligió.
  const first = await submitExamAttempt(student, started.attemptId, { [tf]: "Falso", [mc]: "4" });
  assert.deepEqual(first, { ok: true, attemptNumber: 1, status: "GRADED", score: 5, maxScore: 6 });
  const entry = await db.gradeEntry.findFirstOrThrow({ where: { gradeItemId: gradeItem.id, enrollmentId: "a_enrollment" } });
  assert.deepEqual([entry.score, entry.autoGraded], [5, true]);

  const again = await startExamAttempt(student, examId);
  assert.ok(again.ok);
  if (!again.ok) return;
  const second = await submitExamAttempt(student, again.attemptId, { [tf]: "Verdadero", [mc]: "4" });
  assert.deepEqual(second, { ok: true, attemptNumber: 2, status: "GRADED", score: 6, maxScore: 6 });
  const exhausted = await startExamAttempt(student, examId);
  assert.equal(!exhausted.ok && exhausted.reason, "no_attempts_left");

  const results = await getExamResults(A.teacher, examId);
  assert.deepEqual(results?.attempts.map((item) => [item.studentName, item.attemptNumber, item.status, item.score, item.maxScore]), [
    ["student A", 1, "GRADED", 5, 6],
    ["student A", 2, "GRADED", 6, 6],
  ]);
  assert.deepEqual(results?.attempts[0].answers.map((item) => [item.order, item.response, item.isCorrect, item.score, item.expected]), [
    [0, "Falso", false, 0, "Verdadero"],
    [1, "4", true, 5, "4"],
  ]);
  assert.equal(results?.attempts[0].durationMinutes, 0);
  const listed = (await listExams(A.teacher, A.courseId))?.exams.find((item) => item.id === examId);
  assert.deepEqual([listed?.status, listed?.submittedAttempts, listed?.pendingReview, listed?.totalPoints], ["PUBLISHED", 2, 0, 6]);
});

test("con intentos: no cambian preguntas, puntos ni reglas; sí título, instrucciones, fechas y publicación", async () => {
  const [mc, tf] = [await question("mc"), await question("tf")];
  const original = [{ bankItemId: mc, points: 2 }, { bankItemId: tf, points: 1 }];
  const examId = await exam(original, { title: `${TAG} Con intentos`, gradeCategoryId: CATEGORY });
  await setExamPublished(A.teacher, examId, true);
  const started = await startExamAttempt(student, examId);
  assert.ok(started.ok);
  if (!started.ok) return;
  await submitExamAttempt(student, started.attemptId, { [mc]: "4", [tf]: "Verdadero" });

  const rejected: Array<Parameters<typeof examInput>> = [
    [[{ bankItemId: tf, points: 1 }, { bankItemId: mc, points: 2 }]],
    [[{ bankItemId: mc, points: 2 }]],
    [[{ bankItemId: mc, points: 3 }, { bankItemId: tf, points: 1 }]],
    [original, { durationMinutes: 60 }],
    [original, { maxAttempts: 5 }],
    [original, { showReview: false }],
  ];
  for (const args of rejected) {
    const result = await updateExam(A.teacher, examId, examInput(...args));
    assert.deepEqual(result, { ok: false, message: LOCKED_MESSAGE });
  }
  const untouched = await db.exam.findUniqueOrThrow({ where: { id: examId }, include: { questions: { orderBy: { order: "asc" } } } });
  assert.deepEqual(untouched.questions.map((item) => [item.bankItemId, item.points]), [[mc, 2], [tf, 1]]);
  assert.deepEqual([untouched.durationMinutes, untouched.maxAttempts, untouched.showReview], [30, 2, true]);

  const allowed = await updateExam(A.teacher, examId, examInput(original, { title: `${TAG} Con intentos (corregido)`, instructions: "Nuevas instrucciones.", closesAt: "2030-01-01T12:00" }));
  assert.ok(allowed.ok, !allowed.ok ? allowed.message : "");
  const edited = await db.exam.findUniqueOrThrow({ where: { id: examId }, include: { gradeItem: true } });
  assert.deepEqual([edited.title, edited.instructions, edited.closesAt?.toISOString(), edited.gradeItem?.title], [`${TAG} Con intentos (corregido)`, "Nuevas instrucciones.", "2030-01-01T16:00:00.000Z", `${TAG} Con intentos (corregido)`]);
  assert.equal((await setExamPublished(A.teacher, examId, false)).ok, true);
  assert.equal((await db.exam.findUniqueOrThrow({ where: { id: examId } })).isPublished, false);

  // La pregunta usada se puede corregir en el banco sin tocar el examen, pero no borrar.
  assert.equal((await updateQuestion(A.teacher, mc, { type: "MULTIPLE_CHOICE", prompt: `${TAG} otra`, options: ["1", "2"], correctIndex: 0, points: 1 })).ok, true);
  const frozen = await db.examQuestion.findFirstOrThrow({ where: { examId, bankItemId: mc } });
  assert.equal((frozen.snapshot as { answerKey: string }).answerKey, "4");
  const blocked = await deleteQuestion(A.teacher, mc);
  assert.match(!blocked.ok ? blocked.message : "", /No se puede borrar: esta pregunta está en el examen «ITEA Con intentos \(corregido\)»/);
  assert.equal((await getQuestion(A.teacher, mc))?.exams.length, 1);

  // Borrar un examen con intentos exige motivo; las notas ya registradas se conservan.
  const noReason = await deleteExam(A.teacher, examId, "  ");
  assert.match(!noReason.ok ? noReason.message : "", /Escribe el motivo/);
  assert.equal(await db.exam.count({ where: { id: examId } }), 1);
  const removed = await deleteExam(A.teacher, examId, "Se publicó con las preguntas equivocadas");
  assert.ok(removed.ok, !removed.ok ? removed.message : "");
  assert.match(removed.ok ? removed.message : "", /Se borró 1 intento\. La nota ya registrada sigue en el libro/);
  assert.equal(await db.exam.count({ where: { id: examId } }), 0);
  assert.equal(await db.examAttempt.count({ where: { id: started.attemptId } }), 0);
  const kept = await db.gradeItem.findUniqueOrThrow({ where: { id: edited.gradeItem?.id }, include: { entries: true } });
  assert.deepEqual([kept.examId, kept.entries.length, kept.entries[0]?.score], [null, 1, 3]);
  const audit = await db.auditLog.findFirstOrThrow({ where: { action: "EXAM_DELETED", entityId: examId } });
  assert.deepEqual([audit.institutionId, audit.userId, (audit.changes as { reason: string }).reason], [A.institutionId, A.teacher.id, "Se publicó con las preguntas equivocadas"]);
  // Ya sin examen, la pregunta se puede borrar.
  assert.equal((await deleteQuestion(A.teacher, mc)).ok, true);
});

test("revisión: las respuestas cortas quedan pendientes hasta que quien gestiona el curso pone los puntos", async () => {
  const [mc, open] = [await question("mc"), await question("open")];
  const examId = await exam([{ bankItemId: mc, points: 2 }, { bankItemId: open, points: 3 }], { title: `${TAG} Con respuesta corta`, maxAttempts: 1, gradeCategoryId: CATEGORY });
  await setExamPublished(A.teacher, examId, true);
  const started = await startExamAttempt(student, examId);
  assert.ok(started.ok);
  if (!started.ok) return;
  const sent = await submitExamAttempt(student, started.attemptId, { [mc]: "4", [open]: "El agua sube y luego llueve" });
  assert.deepEqual(sent, { ok: true, attemptNumber: 1, status: "SUBMITTED", score: 2, maxScore: 5 });
  const gradeItem = await db.gradeItem.findFirstOrThrow({ where: { examId } });
  assert.equal(await db.gradeEntry.count({ where: { gradeItemId: gradeItem.id } }), 0);

  const results = await getExamResults(A.coordinator, examId);
  const pending = results?.attempts[0];
  assert.equal(pending?.status, "SUBMITTED");
  const shortAnswer = pending?.answers.find((item) => item.type === "SHORT_ANSWER");
  assert.deepEqual([shortAnswer?.response, shortAnswer?.expected, shortAnswer?.points, shortAnswer?.score], ["El agua sube y luego llueve", "Evaporación, condensación y lluvia", 3, null]);
  assert.equal((await listExams(A.teacher, A.courseId))?.exams.find((item) => item.id === examId)?.pendingReview, 1);
  if (!shortAnswer) return;

  for (const actor of outsiders) {
    assert.equal((await reviewExamAttempt(actor, started.attemptId, { answers: { [shortAnswer.id]: { score: 3 } } })).ok, false, actor.id);
  }
  for (const score of [null, -1, 3.5, Number.NaN]) {
    const invalid = await reviewExamAttempt(A.teacher, started.attemptId, { answers: { [shortAnswer.id]: { score } } });
    assert.match(!invalid.ok ? invalid.message : "", /entre 0 y el máximo/);
  }
  assert.equal((await db.examAttempt.findUniqueOrThrow({ where: { id: started.attemptId } })).status, "SUBMITTED");

  // Los puntos de la pregunta que se califica sola no se pueden cambiar desde la revisión.
  const auto = pending?.answers.find((item) => item.type === "MULTIPLE_CHOICE");
  const reviewed = await reviewExamAttempt(A.teacher, started.attemptId, { answers: { [shortAnswer.id]: { score: 2.5, feedback: " Faltó la condensación. " }, [auto?.id ?? ""]: { score: 0 } } });
  assert.ok(reviewed.ok, !reviewed.ok ? reviewed.message : "");
  const attempt = await db.examAttempt.findUniqueOrThrow({ where: { id: started.attemptId }, include: { answers: true } });
  assert.deepEqual([attempt.status, attempt.score, attempt.maxScore], ["GRADED", 4.5, 5]);
  const answer = attempt.answers.find((item) => item.id === shortAnswer.id);
  assert.deepEqual([answer?.score, answer?.feedback], [2.5, "Faltó la condensación."]);
  const entry = await db.gradeEntry.findFirstOrThrow({ where: { gradeItemId: gradeItem.id, enrollmentId: "a_enrollment" } });
  assert.deepEqual([entry.score, entry.autoGraded, entry.gradedById], [4.5, false, A.teacher.id]);

  const twice = await reviewExamAttempt(A.teacher, started.attemptId, { answers: { [shortAnswer.id]: { score: 0 } } });
  assert.equal(twice.ok, false);
  assert.equal((await db.gradeEntry.findUniqueOrThrow({ where: { id: entry.id } })).score, 4.5);
});
