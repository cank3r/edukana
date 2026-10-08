import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { questionSnapshot, startExamAttempt, submitExamAttempt, SUBMIT_GRACE_SECONDS } from "@/server/exams";
import { A, B, ensureSeed } from "./setup";

const student = { id: A.student.id, institutionId: A.institutionId };
const MC = "it_ex_q_mc";
const TF = "it_ex_q_tf";
const OPEN = "it_ex_q_open";
const CORRECT = { [MC]: "4", [TF]: "verdadero" };

async function makeExam(id: string, options: { maxAttempts?: number; withOpenQuestion?: boolean; durationMinutes?: number } = {}) {
  const bankIds = options.withOpenQuestion ? [MC, TF, OPEN] : [MC, TF];
  const bank = await db.questionBankItem.findMany({ where: { id: { in: bankIds } }, orderBy: { id: "asc" } });
  await db.exam.create({
    data: {
      id,
      institutionId: A.institutionId,
      courseId: A.courseId,
      title: `Examen ${id}`,
      durationMinutes: options.durationMinutes ?? 1,
      maxAttempts: options.maxAttempts ?? 1,
      isPublished: true,
      questions: {
        create: bank.map((item, order) => ({
          institutionId: A.institutionId,
          bankItemId: item.id,
          order,
          points: item.defaultPoints,
          snapshot: questionSnapshot(item, item.defaultPoints),
        })),
      },
      gradeItem: {
        create: {
          institutionId: A.institutionId,
          courseId: A.courseId,
          gradingPeriodId: "it_ex_period",
          categoryId: "it_ex_category",
          title: `Examen ${id}`,
          maxScore: bank.reduce((sum, item) => sum + item.defaultPoints, 0),
        },
      },
    },
  });
  return id;
}

before(async () => {
  await ensureSeed();
  const base = { institutionId: A.institutionId, courseId: A.courseId };
  await db.questionBankItem.createMany({
    data: [
      { id: MC, ...base, type: "MULTIPLE_CHOICE", prompt: "¿2 + 2?", options: ["3", "4"], answerKey: "4", defaultPoints: 2 },
      { id: TF, ...base, type: "TRUE_FALSE", prompt: "El agua moja.", answerKey: "verdadero", defaultPoints: 1 },
      { id: OPEN, ...base, type: "SHORT_ANSWER", prompt: "Explica.", answerKey: "libre", defaultPoints: 3 },
    ],
  });
  await db.gradingPeriod.create({
    data: {
      id: "it_ex_period",
      ...base,
      academicPeriodId: "a_period",
      name: "Período de prueba de exámenes",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-12-31"),
      categories: { create: { id: "it_ex_category", ...base, name: "Exámenes", weight: 100 } },
    },
  });
});

after(async () => {
  await db.gradingPeriod.deleteMany({ where: { id: "it_ex_period" } });
  await db.exam.deleteMany({ where: { id: { startsWith: "it_ex_" } } });
  await db.questionBankItem.deleteMany({ where: { id: { in: [MC, TF, OPEN] } } });
  await db.$disconnect();
});

test("examen: iniciar entrega las preguntas sin la clave y fija la hora límite en el servidor", async () => {
  const examId = await makeExam("it_ex_start");
  const now = new Date("2026-10-08T12:00:00Z");
  const started = await startExamAttempt(student, examId, now);
  assert.equal(started.ok, true);
  if (!started.ok) return;
  assert.equal(started.expiresAt.toISOString(), "2026-10-08T12:01:00.000Z");
  assert.equal(started.questions.length, 2);
  assert.equal(JSON.stringify(started.questions).includes("answerKey"), false);

  const again = await startExamAttempt(student, examId, new Date("2026-10-08T12:00:20Z"));
  assert.equal(again.ok && again.resumed, true);
  assert.equal(again.ok && again.attemptId, started.attemptId);
  assert.equal(again.ok && again.expiresAt.toISOString(), "2026-10-08T12:01:00.000Z", "reanudar no extiende el tiempo");
});

test("examen: dos inicios simultáneos consumen un solo intento", async () => {
  const examId = await makeExam("it_ex_race_start", { maxAttempts: 3 });
  const results = await Promise.all([startExamAttempt(student, examId), startExamAttempt(student, examId)]);
  assert.ok(results.every((result) => result.ok));
  assert.equal(await db.examAttempt.count({ where: { examId, studentId: student.id } }), 1);
});

test("examen: enviado a tiempo se califica y la nota queda marcada como automática", async () => {
  const examId = await makeExam("it_ex_submit");
  const now = new Date("2026-10-08T12:00:00Z");
  const started = await startExamAttempt(student, examId, now);
  assert.ok(started.ok);
  if (!started.ok) return;
  const result = await submitExamAttempt(student, started.attemptId, CORRECT, new Date("2026-10-08T12:00:50Z"));
  assert.deepEqual(result, { ok: true, attemptNumber: 1, status: "GRADED", score: 3, maxScore: 3 });
  const entry = await db.gradeEntry.findFirstOrThrow({ where: { gradeItem: { examId }, enrollmentId: "a_enrollment" } });
  assert.equal(entry.score, 3);
  assert.equal(entry.autoGraded, true);
  const answers = await db.examAnswer.findMany({ where: { attemptId: started.attemptId } });
  assert.equal(answers.length, 2);
  assert.ok(answers.every((answer) => answer.institutionId === A.institutionId));
});

test("examen: dentro de la tolerancia se acepta; pasado el tiempo se rechaza y el intento se cierra", async () => {
  const examId = await makeExam("it_ex_late", { maxAttempts: 2 });
  const first = await startExamAttempt(student, examId, new Date("2026-10-08T12:00:00Z"));
  assert.ok(first.ok);
  if (!first.ok) return;
  const late = await submitExamAttempt(student, first.attemptId, CORRECT, new Date(`2026-10-08T12:01:${SUBMIT_GRACE_SECONDS + 1}Z`));
  assert.equal(late.ok, false);
  assert.equal(!late.ok && late.reason, "expired");
  const closed = await db.examAttempt.findUniqueOrThrow({ where: { id: first.attemptId } });
  assert.equal(closed.status, "GRADED");
  assert.equal(closed.score, 0);
  assert.equal(await db.examAnswer.count({ where: { attemptId: first.attemptId } }), 0);

  const second = await startExamAttempt(student, examId, new Date("2026-10-08T13:00:00Z"));
  assert.ok(second.ok);
  if (!second.ok) return;
  const onGrace = await submitExamAttempt(student, second.attemptId, CORRECT, new Date("2026-10-08T13:01:20Z"));
  assert.equal(onGrace.ok, true);
});

test("examen: dos envíos simultáneos producen una sola calificación", async () => {
  const examId = await makeExam("it_ex_race_submit");
  const started = await startExamAttempt(student, examId);
  assert.ok(started.ok);
  if (!started.ok) return;
  const results = await Promise.all([
    submitExamAttempt(student, started.attemptId, CORRECT),
    submitExamAttempt(student, started.attemptId, { [MC]: "3" }),
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(await db.examAnswer.count({ where: { attemptId: started.attemptId } }), 2);
});

test("examen: agotados los intentos no se puede iniciar otro, y uno abandonado cuenta", async () => {
  const examId = await makeExam("it_ex_exhausted");
  const first = await startExamAttempt(student, examId, new Date("2026-10-08T12:00:00Z"));
  assert.ok(first.ok);
  const later = await startExamAttempt(student, examId, new Date("2026-10-08T14:00:00Z"));
  assert.equal(later.ok, false);
  assert.equal(!later.ok && later.reason, "no_attempts_left");
});

test("examen: editar la pregunta del banco no cambia cómo se califica un examen ya creado", async () => {
  const examId = await makeExam("it_ex_snapshot");
  await db.questionBankItem.update({ where: { id: MC }, data: { answerKey: "3" } });
  try {
    const started = await startExamAttempt(student, examId);
    assert.ok(started.ok);
    if (!started.ok) return;
    const result = await submitExamAttempt(student, started.attemptId, CORRECT);
    assert.equal(result.ok && result.score, 3);
  } finally {
    await db.questionBankItem.update({ where: { id: MC }, data: { answerKey: "4" } });
  }
});

test("examen: con respuesta abierta queda en revisión y no publica nota automática", async () => {
  const examId = await makeExam("it_ex_open", { withOpenQuestion: true });
  const started = await startExamAttempt(student, examId);
  assert.ok(started.ok);
  if (!started.ok) return;
  const result = await submitExamAttempt(student, started.attemptId, { ...CORRECT, [OPEN]: "Mi explicación" });
  assert.equal(result.ok && result.status, "SUBMITTED");
  assert.equal(await db.gradeEntry.count({ where: { gradeItem: { examId } } }), 0);
});

test("sin matrícula: un estudiante de la institución que no cursa el curso no puede iniciar", async () => {
  const examId = await makeExam("it_ex_not_enrolled");
  const result = await startExamAttempt({ id: A.student2.id, institutionId: A.institutionId }, examId);
  assert.equal(!result.ok && result.reason, "not_enrolled");
});

test("ID de otra institución: el examen ajeno no existe para un estudiante de B", async () => {
  const examId = await makeExam("it_ex_other_tenant");
  const result = await startExamAttempt({ id: B.student.id, institutionId: B.institutionId }, examId);
  assert.equal(!result.ok && result.reason, "unavailable");
  assert.equal(await db.examAttempt.count({ where: { examId } }), 0);
});

test("ID de otro usuario: nadie puede enviar el intento de otra persona", async () => {
  const examId = await makeExam("it_ex_other_user");
  const started = await startExamAttempt(student, examId);
  assert.ok(started.ok);
  if (!started.ok) return;
  const result = await submitExamAttempt({ id: A.student2.id, institutionId: A.institutionId }, started.attemptId, CORRECT);
  assert.equal(!result.ok && result.reason, "not_found");
  assert.equal((await db.examAttempt.findUniqueOrThrow({ where: { id: started.attemptId } })).status, "IN_PROGRESS");
});
