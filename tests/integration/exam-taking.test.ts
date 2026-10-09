import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { getAttemptResult, getExamIntro, getOngoingAttempt, listStudentExams } from "@/server/assessment/exam-taking";
import { questionSnapshot, startExamAttempt, submitExamAttempt } from "@/server/exams";
import { A, B, ensureSeed } from "./setup";

const student = { id: A.student.id, institutionId: A.institutionId };
const notEnrolled = { id: A.student2.id, institutionId: A.institutionId };
const outsider = { id: B.student.id, institutionId: B.institutionId };

const MC = "it_et_q_mc";
const TF = "it_et_q_tf";
const OPEN = "it_et_q_open";
// Textos que no aparecen en ningún enunciado ni opción distinta de la correcta.
const MC_KEY = "Clave secreta Quito";
const OPEN_KEY = "Clave secreta fotosíntesis";
const EXPLANATION = "Explicación secreta de la capital";
const T0 = new Date("2026-10-08T12:00:00Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

async function makeExam(id: string, options: { showReview?: boolean; maxAttempts?: number; withOpenQuestion?: boolean; opensAt?: Date; closesAt?: Date } = {}) {
  const bankIds = options.withOpenQuestion ? [MC, TF, OPEN] : [MC, TF];
  const bank = await db.questionBankItem.findMany({ where: { id: { in: bankIds } }, orderBy: { id: "asc" } });
  await db.exam.create({
    data: {
      id,
      institutionId: A.institutionId,
      courseId: A.courseId,
      title: `Examen ${id}`,
      instructions: "Lee con calma.",
      durationMinutes: 10,
      maxAttempts: options.maxAttempts ?? 2,
      isPublished: true,
      showReview: options.showReview ?? true,
      opensAt: options.opensAt,
      closesAt: options.closesAt,
      questions: {
        create: bank.map((item, order) => ({
          institutionId: A.institutionId,
          bankItemId: item.id,
          order,
          points: item.defaultPoints,
          snapshot: questionSnapshot(item, item.defaultPoints),
        })),
      },
    },
  });
  return id;
}

function assertNoKey(value: unknown, label: string) {
  const json = JSON.stringify(value);
  assert.equal(json.includes("answerKey"), false, `${label}: no debe traer el campo de la clave`);
  for (const secret of [MC_KEY, OPEN_KEY, EXPLANATION]) {
    assert.equal(json.includes(secret), false, `${label}: no debe traer «${secret}»`);
  }
}

before(async () => {
  await ensureSeed();
  const base = { institutionId: A.institutionId, courseId: A.courseId };
  await db.questionBankItem.createMany({
    data: [
      // La correcta va entre las opciones (así la ve el estudiante), por eso la clave de MC se busca solo donde no hay opciones.
      { id: MC, ...base, type: "MULTIPLE_CHOICE", prompt: "¿Capital de Ecuador?", options: ["Lima", "Bogotá"], answerKey: MC_KEY, explanation: EXPLANATION, defaultPoints: 2 },
      { id: TF, ...base, type: "TRUE_FALSE", prompt: "El agua moja.", options: ["Verdadero", "Falso"], answerKey: "verdadero", defaultPoints: 1 },
      { id: OPEN, ...base, type: "SHORT_ANSWER", prompt: "Explica cómo se alimentan las plantas.", answerKey: OPEN_KEY, defaultPoints: 3 },
    ],
  });
});

after(async () => {
  await db.exam.deleteMany({ where: { id: { startsWith: "it_et_" } } });
  await db.questionBankItem.deleteMany({ where: { id: { in: [MC, TF, OPEN] } } });
  await db.$disconnect();
});

test("presentar: la introducción no trae preguntas ni la clave, y dice cuántos intentos quedan", async () => {
  const examId = await makeExam("it_et_intro", { withOpenQuestion: true });
  const intro = await getExamIntro(student, examId, T0);
  assert.ok(intro);
  assertNoKey(intro, "introducción");
  assert.equal(JSON.stringify(intro).includes("¿Capital de Ecuador?"), false, "antes de iniciar no se ve ninguna pregunta");
  assert.equal(intro.questionCount, 3);
  assert.equal(intro.attemptsLeft, 2);
  assert.equal(intro.canStart, true);
  assert.equal(intro.hasOngoingAttempt, false);
  assert.equal(await getOngoingAttempt(student, examId, T0), null);
});

test("presentar: el intento en curso se puede retomar, sin la clave y sin alargar el tiempo", async () => {
  const examId = await makeExam("it_et_ongoing", { withOpenQuestion: true });
  const started = await startExamAttempt(student, examId, T0);
  assert.ok(started.ok);
  if (!started.ok) return;

  const ongoing = await getOngoingAttempt(student, examId, at(120));
  assert.ok(ongoing);
  assertNoKey(ongoing, "intento en curso");
  assert.equal(ongoing.attemptId, started.attemptId);
  assert.equal(ongoing.questions.length, 3);
  assert.deepEqual(ongoing.questions.map((question) => question.bankItemId), started.questions.map((question) => question.bankItemId));
  assert.equal(ongoing.expiresAt.getTime() - ongoing.serverNow.getTime(), 8 * 60_000, "quedan 8 de los 10 minutos");

  assert.equal((await getExamIntro(student, examId, at(120)))?.hasOngoingAttempt, true);
  assert.equal(await getAttemptResult(student, started.attemptId, at(120)), null, "en curso todavía no hay resultado");
  assert.equal(await getOngoingAttempt(student, examId, at(601)), null, "vencido ya no se retoma");
});

test("presentar: con revisión permitida el resultado trae su respuesta, la correcta y la explicación", async () => {
  const examId = await makeExam("it_et_review");
  const started = await startExamAttempt(student, examId, T0);
  assert.ok(started.ok);
  if (!started.ok) return;
  await submitExamAttempt(student, started.attemptId, { [MC]: "Lima", [TF]: "Verdadero" }, at(60));

  const result = await getAttemptResult(student, started.attemptId, at(61));
  assert.ok(result);
  assert.equal(result.score, 1);
  assert.equal(result.maxScore, 3);
  assert.equal(result.pendingReview, false);
  assert.equal(result.attemptsLeft, 1);
  assert.equal(result.canRetry, true);
  assert.ok(result.review);
  const [first, second] = result.review;
  assert.deepEqual(
    { response: first.response, correctAnswer: first.correctAnswer, isCorrect: first.isCorrect, explanation: first.explanation },
    { response: "Lima", correctAnswer: MC_KEY, isCorrect: false, explanation: EXPLANATION },
  );
  assert.equal(second.isCorrect, true);
});

test("presentar: sin revisión permitida el resultado no trae las correctas", async () => {
  const examId = await makeExam("it_et_no_review", { showReview: false, withOpenQuestion: true });
  const started = await startExamAttempt(student, examId, T0);
  assert.ok(started.ok);
  if (!started.ok) return;
  await submitExamAttempt(student, started.attemptId, { [MC]: "Lima", [TF]: "Verdadero", [OPEN]: "Con la luz" }, at(60));

  const result = await getAttemptResult(student, started.attemptId, at(61));
  assert.ok(result);
  assert.equal(result.review, null);
  assertNoKey(result, "resultado sin revisión");
  assert.equal(result.pendingReview, true, "la respuesta escrita espera al docente");
  assert.equal(result.score, 1);
});

test("presentar: quien no cursa el curso y quien es de otra institución no ven nada", async () => {
  const examId = await makeExam("it_et_isolation");
  const started = await startExamAttempt(student, examId, T0);
  assert.ok(started.ok);
  if (!started.ok) return;

  for (const stranger of [notEnrolled, outsider]) {
    assert.equal(await listStudentExams(stranger, A.courseId, at(10)), null);
    assert.equal(await getExamIntro(stranger, examId, at(10)), null);
    assert.equal(await getOngoingAttempt(stranger, examId, at(10)), null);
    assert.equal(await getAttemptResult(stranger, started.attemptId, at(10)), null);
  }
  const ownCourse = await listStudentExams(outsider, B.courseId, at(10));
  assert.ok(ownCourse);
  assert.equal(ownCourse.exams.some((exam) => exam.id.startsWith("it_et_")), false);
});

test("presentar: nadie ve el intento ni el resultado de otro estudiante", async () => {
  const examId = await makeExam("it_et_other_user");
  const started = await startExamAttempt(student, examId, T0);
  assert.ok(started.ok);
  if (!started.ok) return;
  const enrollment = await db.enrollment.create({
    data: { institutionId: A.institutionId, studentId: A.student2.id, courseId: A.courseId, status: "ACTIVE" },
  });
  try {
    assert.equal(await getOngoingAttempt(notEnrolled, examId, at(10)), null);
    assert.equal((await getExamIntro(notEnrolled, examId, at(10)))?.attemptsUsed, 0);
    await submitExamAttempt(student, started.attemptId, { [MC]: MC_KEY, [TF]: "Verdadero" }, at(60));
    assert.equal(await getAttemptResult(notEnrolled, started.attemptId, at(61)), null);
    const theirs = await listStudentExams(notEnrolled, A.courseId, at(61));
    assert.equal(theirs?.exams.find((exam) => exam.id === examId)?.best, null);
  } finally {
    await db.enrollment.delete({ where: { id: enrollment.id } });
  }
});

test("presentar: la lista refleja intentos usados, mejor nota y por qué no se puede iniciar", async () => {
  const examId = await makeExam("it_et_list", { maxAttempts: 2 });
  const upcomingId = await makeExam("it_et_list_upcoming", { opensAt: at(3600) });
  const closedId = await makeExam("it_et_list_closed", { closesAt: at(-3600) });
  await db.exam.create({ data: { id: "it_et_list_draft", institutionId: A.institutionId, courseId: A.courseId, title: "Borrador", isPublished: false } });

  const find = async (id: string, now: Date) => (await listStudentExams(student, A.courseId, now))?.exams.find((exam) => exam.id === id);

  const fresh = await find(examId, T0);
  assert.deepEqual(
    { used: fresh?.attemptsUsed, left: fresh?.attemptsLeft, best: fresh?.best, canStart: fresh?.canStart, availability: fresh?.availability },
    { used: 0, left: 2, best: null, canStart: true, availability: "open" },
  );
  assert.equal(await find("it_et_list_draft", T0), undefined, "lo no publicado no aparece");
  assert.equal((await find(upcomingId, T0))?.startBlock, "not_open_yet");
  assert.equal((await find(closedId, T0))?.startBlock, "closed");

  const first = await startExamAttempt(student, examId, T0);
  assert.ok(first.ok);
  if (!first.ok) return;
  const during = await find(examId, at(30));
  assert.equal(during?.attemptsUsed, 1);
  assert.equal(during?.hasOngoingAttempt, true);
  assert.equal(during?.lastFinishedAttemptId, null);

  await submitExamAttempt(student, first.attemptId, { [MC]: "Lima", [TF]: "Verdadero" }, at(60));
  const second = await startExamAttempt(student, examId, at(120));
  assert.ok(second.ok);
  if (!second.ok) return;
  await submitExamAttempt(student, second.attemptId, { [MC]: MC_KEY, [TF]: "Verdadero" }, at(180));

  const done = await find(examId, at(200));
  assert.deepEqual(
    { used: done?.attemptsUsed, left: done?.attemptsLeft, best: done?.best, canStart: done?.canStart, block: done?.startBlock, last: done?.lastFinishedAttemptId },
    { used: 2, left: 0, best: { score: 3, maxScore: 3 }, canStart: false, block: "no_attempts_left", last: second.attemptId },
  );
  const result = await getAttemptResult(student, second.attemptId, at(200));
  assert.equal(result?.canRetry, false);
});

test("presentar: vencer el reloj no muestra claves antes de confirmar el envío", async () => {
  const examId = await makeExam("it_et_expiry_review");
  const started = await startExamAttempt(student, examId, T0);
  assert.ok(started.ok);
  if (!started.ok) return;
  for (const offsetMs of [-1, 0, 15_000, 30_000, 30_001]) {
    const now: Date = new Date(started.expiresAt.getTime() + offsetMs);
    assert.equal(await getAttemptResult(student, started.attemptId, now), null);
    const intro = await getExamIntro(student, examId, now);
    assert.equal(intro?.lastFinishedAttemptId, null);
    assert.equal(intro?.hasUnsubmittedExpiredAttempt, offsetMs >= 0);
  }
  const before = await db.examAttempt.findUniqueOrThrow({ where: { id: started.attemptId } });
  assert.equal(before.status, "IN_PROGRESS", "las lecturas no finalizan ni modifican el intento");
  const submitted = await submitExamAttempt(student, started.attemptId, { [MC]: MC_KEY, [TF]: "Verdadero" },
    new Date(started.expiresAt.getTime() + 15_000));
  assert.ok(submitted.ok, "la entrega todavía se admite durante la tolerancia de red");
  const result = await getAttemptResult(student, started.attemptId, new Date(started.expiresAt.getTime() + 16_000));
  assert.equal(result?.review?.[0].correctAnswer, MC_KEY, "solo el envío confirmado permite la revisión");
});
