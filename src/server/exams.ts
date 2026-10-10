import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { autoScoreAnswer } from "@/lib/lms";
import { writeGradeEntry } from "@/server/grade-history";

/** Tolerancia para que un envío hecho al filo del tiempo no se pierda por latencia de red. */
export const SUBMIT_GRACE_SECONDS = 30;

type QuestionKind = "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER";

export type QuestionSnapshot = {
  type: QuestionKind;
  prompt: string;
  options: Prisma.JsonValue | null;
  answerKey: string;
  points: number;
};

/** Pregunta tal como la ve el estudiante: nunca incluye la clave. */
export type AttemptQuestion = Omit<QuestionSnapshot, "answerKey"> & { bankItemId: string; order: number };

export type StartExamResult =
  | { ok: true; attemptId: string; attemptNumber: number; expiresAt: Date; resumed: boolean; questions: AttemptQuestion[] }
  | { ok: false; reason: "unavailable" | "not_enrolled" | "no_attempts_left"; message: string };

export type SubmitExamResult =
  | { ok: true; attemptNumber: number; status: "GRADED" | "SUBMITTED"; score: number; maxScore: number }
  | { ok: false; reason: "not_found" | "expired"; message: string };

type Actor = { id: string; institutionId: string };

type BankFields = { type: QuestionKind; prompt: string; options: Prisma.JsonValue | null; answerKey: string };

/** Copia inmutable de la pregunta. Los intentos se califican contra ella y no contra el banco. */
export function questionSnapshot(bankItem: BankFields, points: number): QuestionSnapshot & Prisma.InputJsonObject {
  return {
    type: bankItem.type,
    prompt: bankItem.prompt,
    options: (bankItem.options ?? null) as Prisma.InputJsonValue | null,
    answerKey: bankItem.answerKey,
    points,
  } as QuestionSnapshot & Prisma.InputJsonObject;
}

function readSnapshot(question: { snapshot: Prisma.JsonValue | null; points: number; bankItem: BankFields }): QuestionSnapshot {
  const value = question.snapshot;
  if (value && typeof value === "object" && !Array.isArray(value) && typeof value.answerKey === "string") {
    return value as unknown as QuestionSnapshot;
  }
  // Exámenes anteriores a S1 sin instantánea: se usa el banco como estaba previsto entonces.
  return questionSnapshot(question.bankItem, question.points);
}

const questionSelect = {
  bankItemId: true,
  order: true,
  points: true,
  snapshot: true,
  bankItem: { select: { type: true, prompt: true, options: true, answerKey: true } },
} satisfies Prisma.ExamQuestionSelect;

function toAttemptQuestion(question: Prisma.ExamQuestionGetPayload<{ select: typeof questionSelect }>): AttemptQuestion {
  const { type, prompt, options, points } = readSnapshot(question);
  return { bankItemId: question.bankItemId, order: question.order, type, prompt, options, points };
}

function expiry(now: Date, durationMinutes: number | null, closesAt: Date | null) {
  const byDuration = durationMinutes ? new Date(now.getTime() + durationMinutes * 60_000) : null;
  if (byDuration && closesAt) return byDuration < closesAt ? byDuration : closesAt;
  // Sin duración ni cierre configurados se aplica un máximo de 24 horas para que ningún intento quede abierto.
  return byDuration ?? closesAt ?? new Date(now.getTime() + 24 * 60 * 60_000);
}

// Los bloqueos de fila (FOR UPDATE) serializan las operaciones; READ COMMITTED relee el estado tras esperar.
const rowLocked = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted } as const;

/**
 * Inicia un intento o devuelve el que ya está en curso. Las preguntas solo se entregan aquí.
 * Primero bloquea el examen, igual que su edición, antes de leer las preguntas y las reglas.
 * Después bloquea la matrícula para que dos inicios del mismo estudiante no consuman dos intentos.
 */
export async function startExamAttempt(actor: Actor, examId: string, now = new Date()): Promise<StartExamResult> {
  return db.$transaction(async (tx) => {
    const unavailable = { ok: false, reason: "unavailable", message: "El examen no está disponible." } as const;
    const lockedExam = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "exams"
      WHERE "id" = ${examId} AND "institutionId" = ${actor.institutionId} AND "isPublished" = true
      FOR UPDATE`;
    if (!lockedExam.length) return unavailable;

    const exam = await tx.exam.findFirst({
      where: { id: examId, institutionId: actor.institutionId, isPublished: true },
      select: {
        id: true,
        courseId: true,
        opensAt: true,
        closesAt: true,
        durationMinutes: true,
        maxAttempts: true,
        questions: { select: questionSelect, orderBy: { order: "asc" } },
      },
    });
    if (!exam || !exam.questions.length) return unavailable;

    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "enrollments"
      WHERE "studentId" = ${actor.id} AND "courseId" = ${exam.courseId} AND "status" = 'ACTIVE'
      FOR UPDATE`;
    if (!locked.length) return { ok: false, reason: "not_enrolled", message: "No tienes una matrícula activa en este curso." };
    const enrollmentId = locked[0].id;

    const attempts = await tx.examAttempt.findMany({
      where: { examId: exam.id, studentId: actor.id },
      select: { id: true, attemptNumber: true, status: true, expiresAt: true },
      orderBy: { attemptNumber: "asc" },
    });
    const open = attempts.find((attempt) => attempt.status === "IN_PROGRESS");
    const questions = exam.questions.map(toAttemptQuestion);
    if (open?.expiresAt && open.expiresAt > now) {
      return { ok: true, attemptId: open.id, attemptNumber: open.attemptNumber, expiresAt: open.expiresAt, resumed: true, questions };
    }
    if (open) {
      const maxScore = questions.reduce((sum, question) => sum + question.points, 0);
      await tx.examAttempt.update({ where: { id: open.id }, data: { status: "GRADED", score: 0, maxScore, submittedAt: now } });
    }

    if ((exam.opensAt && now < exam.opensAt) || (exam.closesAt && now >= exam.closesAt)) return unavailable;
    if (attempts.length >= exam.maxAttempts) {
      return { ok: false, reason: "no_attempts_left", message: "Ya usaste todos tus intentos." };
    }
    const attemptNumber = Math.max(0, ...attempts.map((attempt) => attempt.attemptNumber)) + 1;
    const expiresAt = expiry(now, exam.durationMinutes, exam.closesAt);
    const created = await tx.examAttempt.create({
      data: {
        institutionId: actor.institutionId,
        examId: exam.id,
        enrollmentId,
        studentId: actor.id,
        attemptNumber,
        status: "IN_PROGRESS",
        startedAt: now,
        expiresAt,
      },
      select: { id: true },
    });
    return { ok: true, attemptId: created.id, attemptNumber, expiresAt, resumed: false, questions };
  }, rowLocked);
}

/**
 * Envía y califica un intento en curso. El tiempo lo decide el servidor: pasado `expiresAt`
 * más la tolerancia, el intento se cierra sin aceptar respuestas nuevas.
 * `responses` va indexado por `bankItemId`.
 */
export async function submitExamAttempt(
  actor: Actor,
  attemptId: string,
  responses: Record<string, string>,
  now = new Date(),
): Promise<SubmitExamResult> {
  return db.$transaction(async (tx) => {
    const notFound = { ok: false, reason: "not_found", message: "No hay un intento en curso para enviar." } as const;
    // Igual que al iniciar: matrícula antes del intento. El retiro usa esta misma fila,
    // por lo que no puede revocar el acceso entre la comprobación y la escritura.
    const activeEnrollment = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT e."id" FROM "enrollments" e
      JOIN "exam_attempts" a ON a."enrollmentId" = e."id"
      JOIN "exams" x ON x."id" = a."examId" AND x."courseId" = e."courseId"
      JOIN "courses" c ON c."id" = e."courseId"
      WHERE a."id" = ${attemptId} AND a."studentId" = ${actor.id}
        AND a."institutionId" = ${actor.institutionId} AND a."status" = 'IN_PROGRESS'
        AND e."studentId" = ${actor.id} AND e."institutionId" = ${actor.institutionId}
        AND e."status" = 'ACTIVE' AND x."institutionId" = ${actor.institutionId}
        AND c."institutionId" = ${actor.institutionId}
      FOR UPDATE OF e`;
    if (!activeEnrollment.length) return notFound;

    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "exam_attempts"
      WHERE "id" = ${attemptId} AND "studentId" = ${actor.id} AND "institutionId" = ${actor.institutionId}
        AND "status" = 'IN_PROGRESS'
      FOR UPDATE`;
    if (!locked.length) return notFound;

    const attempt = await tx.examAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      select: {
        id: true,
        attemptNumber: true,
        enrollmentId: true,
        expiresAt: true,
        exam: {
          select: {
            courseId: true,
            gradeItem: { select: { id: true } },
            course: { select: { teacherId: true } },
            questions: { select: questionSelect, orderBy: { order: "asc" } },
          },
        },
      },
    });
    const snapshots = attempt.exam.questions.map((question) => ({ bankItemId: question.bankItemId, ...readSnapshot(question) }));
    const maxScore = snapshots.reduce((sum, question) => sum + question.points, 0);

    const deadline = attempt.expiresAt ? attempt.expiresAt.getTime() + SUBMIT_GRACE_SECONDS * 1000 : null;
    if (deadline !== null && now.getTime() > deadline) {
      await tx.examAttempt.update({ where: { id: attempt.id }, data: { status: "GRADED", score: 0, maxScore, submittedAt: now } });
      return { ok: false, reason: "expired", message: "El tiempo del examen terminó antes de recibir tus respuestas." };
    }

    let score = 0;
    let needsReview = false;
    const answers = snapshots.map((question) => {
      const response = String(responses[question.bankItemId] ?? "").slice(0, 20000);
      const result = autoScoreAnswer(question.type, response, question.answerKey, question.points);
      if (result.score === null) needsReview = true;
      else score += result.score;
      return {
        institutionId: actor.institutionId,
        attemptId: attempt.id,
        bankItemId: question.bankItemId,
        response,
        score: result.score,
        isCorrect: result.isCorrect,
      };
    });
    await tx.examAnswer.createMany({ data: answers });
    const status = needsReview ? ("SUBMITTED" as const) : ("GRADED" as const);
    await tx.examAttempt.update({ where: { id: attempt.id }, data: { status, score, maxScore, submittedAt: now } });

    if (!needsReview && attempt.exam.gradeItem) {
      await writeGradeEntry(
        tx,
        {
          institutionId: actor.institutionId,
          gradeItemId: attempt.exam.gradeItem.id,
          enrollmentId: attempt.enrollmentId,
          score,
          actorId: attempt.exam.course.teacherId,
          autoGraded: true,
          reason: `Intento ${attempt.attemptNumber} del examen, calificado automáticamente`,
        },
        now,
      );
    }
    return { ok: true, attemptNumber: attempt.attemptNumber, status, score, maxScore };
  }, rowLocked);
}
