import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { questionSnapshot, type AttemptQuestion, type QuestionSnapshot } from "@/server/exams";
import { examPassed } from "@/server/assessment/exam-pass";

/**
 * Lecturas del estudiante para presentar un examen. Ninguna escribe.
 * Todas exigen matrícula en el curso dentro de la institución del estudiante, y ninguna
 * entrega la clave de respuestas antes de enviar, mientras le queden intentos con el examen abierto,
 * ni cuando el examen no permite revisión.
 */

type Actor = { id: string; institutionId: string };

export type ExamAvailability = "open" | "upcoming" | "closed";

/** Por qué no se puede iniciar. La pantalla lo traduce a una frase con fecha. */
export type StartBlock = "not_open_yet" | "closed" | "no_attempts_left" | "course_finished" | "no_questions";

export type StudentExamSummary = {
  id: string;
  title: string;
  opensAt: Date | null;
  closesAt: Date | null;
  durationMinutes: number | null;
  maxAttempts: number;
  questionCount: number;
  availability: ExamAvailability;
  attemptsUsed: number;
  attemptsLeft: number;
  /** Mejor nota entre los intentos ya calificados. */
  best: { score: number; maxScore: number } | null;
  pendingReview: boolean;
  hasOngoingAttempt: boolean;
  /** Venció el tiempo, pero no se ha confirmado el envío. No es un resultado. */
  hasUnsubmittedExpiredAttempt: boolean;
  /** Intento terminado más reciente, para «Ver mi resultado». */
  lastFinishedAttemptId: string | null;
  canStart: boolean;
  startBlock: StartBlock | null;
};

export type ExamIntro = StudentExamSummary & {
  courseId: string;
  courseName: string;
  instructions: string | null;
  timezone: string;
};

export type OngoingAttempt = {
  attemptId: string;
  attemptNumber: number;
  expiresAt: Date;
  /** Hora del servidor al leer: el contador se calcula con la diferencia, no con el reloj del equipo. */
  serverNow: Date;
  questions: AttemptQuestion[];
};

export type ReviewedQuestion = {
  order: number;
  type: QuestionSnapshot["type"];
  prompt: string;
  points: number;
  response: string;
  correctAnswer: string;
  isCorrect: boolean | null;
  score: number | null;
  explanation: string | null;
  feedback: string | null;
};

export type AttemptResult = {
  attemptId: string;
  attemptNumber: number;
  examId: string;
  examTitle: string;
  courseId: string;
  timezone: string;
  submittedAt: Date | null;
  score: number;
  maxScore: number;
  /** Hay respuestas escritas que el docente aún no revisa: la nota todavía no es definitiva. */
  pendingReview: boolean;
  /** El tiempo terminó sin que llegaran respuestas. */
  expiredWithoutAnswers: boolean;
  attemptsLeft: number;
  canRetry: boolean;
  /** Porcentaje para aprobar del examen, si lo tiene. */
  passingPercent: number | null;
  /** «Aprobado» (true) / «No aprobado» (false); null si el examen no fija porcentaje o la nota no es definitiva. */
  passed: boolean | null;
  /**
   * Solo cuando el examen permite revisión y el estudiante ya no puede volver a presentarlo
   * (sin intentos, examen cerrado o curso terminado) ni tiene otro intento abierto; si no, `null`
   * y la clave no sale del servidor.
   */
  review: ReviewedQuestion[] | null;
  /** El examen muestra las correctas, pero todavía no: le quedan intentos o el examen sigue abierto. */
  reviewLater: boolean;
};

const VIEW_STATUSES = ["ACTIVE", "COMPLETED"] as const;

function enrollmentOf(actor: Actor, courseId: string) {
  return db.enrollment.findFirst({
    where: {
      studentId: actor.id,
      courseId,
      status: { in: [...VIEW_STATUSES] },
      course: { institutionId: actor.institutionId },
    },
    select: { id: true, status: true },
  });
}

const attemptSummarySelect = {
  id: true,
  attemptNumber: true,
  status: true,
  score: true,
  maxScore: true,
  expiresAt: true,
} satisfies Prisma.ExamAttemptSelect;

type AttemptSummary = Prisma.ExamAttemptGetPayload<{ select: typeof attemptSummarySelect }>;

type ExamFacts = {
  id: string;
  title: string;
  opensAt: Date | null;
  closesAt: Date | null;
  durationMinutes: number | null;
  maxAttempts: number;
  questionCount: number;
};

function isOngoing(attempt: Pick<AttemptSummary, "status" | "expiresAt">, now: Date) {
  return attempt.status === "IN_PROGRESS" && attempt.expiresAt !== null && attempt.expiresAt > now;
}

/** Ocultar el examen no interrumpe un intento propio vigente con matrícula activa. */
function ongoingAttemptOf(actor: Actor, now: Date) {
  return {
    studentId: actor.id,
    institutionId: actor.institutionId,
    status: "IN_PROGRESS",
    expiresAt: { gt: now },
    enrollment: { studentId: actor.id, institutionId: actor.institutionId, status: "ACTIVE" },
  } satisfies Prisma.ExamAttemptWhereInput;
}

function summarize(exam: ExamFacts, attempts: AttemptSummary[], enrollmentStatus: string, now: Date): StudentExamSummary {
  const availability: ExamAvailability =
    exam.opensAt && now < exam.opensAt ? "upcoming" : exam.closesAt && now >= exam.closesAt ? "closed" : "open";
  // Igual que al iniciar: todo intento creado cuenta, también el que se abandonó.
  const attemptsUsed = attempts.length;
  const attemptsLeft = Math.max(0, exam.maxAttempts - attemptsUsed);
  const hasOngoingAttempt = attempts.some((attempt) => isOngoing(attempt, now));
  let best: StudentExamSummary["best"] = null;
  for (const attempt of attempts) {
    if (attempt.status !== "GRADED" || attempt.score === null || !attempt.maxScore) continue;
    if (!best || attempt.score > best.score) best = { score: attempt.score, maxScore: attempt.maxScore };
  }
  const finished = attempts.filter((attempt) => attempt.status !== "IN_PROGRESS");
  const lastFinished = finished.length ? finished.reduce((a, b) => (a.attemptNumber > b.attemptNumber ? a : b)) : null;

  let startBlock: StartBlock | null = null;
  if (!hasOngoingAttempt) {
    if (enrollmentStatus !== "ACTIVE") startBlock = "course_finished";
    else if (exam.questionCount === 0) startBlock = "no_questions";
    else if (availability === "upcoming") startBlock = "not_open_yet";
    else if (availability === "closed") startBlock = "closed";
    else if (attemptsLeft === 0) startBlock = "no_attempts_left";
  } else if (enrollmentStatus !== "ACTIVE") {
    startBlock = "course_finished";
  }

  return {
    id: exam.id,
    title: exam.title,
    opensAt: exam.opensAt,
    closesAt: exam.closesAt,
    durationMinutes: exam.durationMinutes,
    maxAttempts: exam.maxAttempts,
    questionCount: exam.questionCount,
    availability,
    attemptsUsed,
    attemptsLeft,
    best,
    pendingReview: attempts.some((attempt) => attempt.status === "SUBMITTED"),
    hasOngoingAttempt,
    hasUnsubmittedExpiredAttempt: attempts.some((attempt) =>
      attempt.status === "IN_PROGRESS" && attempt.expiresAt !== null && attempt.expiresAt <= now),
    lastFinishedAttemptId: lastFinished?.id ?? null,
    canStart: startBlock === null,
    startBlock,
  };
}

/** Exámenes publicados de un curso, como los ve su estudiante. `null` si no cursa ese curso. */
export async function listStudentExams(
  actor: Actor,
  courseId: string,
  now = new Date(),
): Promise<{ courseName: string; timezone: string; exams: StudentExamSummary[] } | null> {
  const enrollment = await enrollmentOf(actor, courseId);
  if (!enrollment) return null;
  const course = await db.course.findFirst({
    where: { id: courseId, institutionId: actor.institutionId },
    select: {
      name: true,
      institution: { select: { timezone: true } },
      exams: {
        where: { institutionId: actor.institutionId, isPublished: true },
        orderBy: [{ opensAt: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          title: true,
          opensAt: true,
          closesAt: true,
          durationMinutes: true,
          maxAttempts: true,
          _count: { select: { questions: true } },
          attempts: { where: { studentId: actor.id, institutionId: actor.institutionId }, select: attemptSummarySelect },
        },
      },
    },
  });
  if (!course) return null;
  return {
    courseName: course.name,
    timezone: course.institution.timezone,
    exams: course.exams.map((exam) =>
      summarize({ ...exam, questionCount: exam._count.questions }, exam.attempts, enrollment.status, now),
    ),
  };
}

/** Lo que se muestra antes de iniciar. No incluye ninguna pregunta. */
export async function getExamIntro(actor: Actor, examId: string, now = new Date()): Promise<ExamIntro | null> {
  const exam = await db.exam.findFirst({
    where: {
      id: examId,
      institutionId: actor.institutionId,
      OR: [{ isPublished: true }, { attempts: { some: ongoingAttemptOf(actor, now) } }],
    },
    select: {
      id: true,
      isPublished: true,
      title: true,
      instructions: true,
      opensAt: true,
      closesAt: true,
      durationMinutes: true,
      maxAttempts: true,
      courseId: true,
      course: { select: { name: true, institution: { select: { timezone: true } } } },
      _count: { select: { questions: true } },
      attempts: { where: { studentId: actor.id, institutionId: actor.institutionId }, select: attemptSummarySelect },
    },
  });
  if (!exam) return null;
  const enrollment = await enrollmentOf(actor, exam.courseId);
  if (!enrollment) return null;
  const summary = summarize({ ...exam, questionCount: exam._count.questions }, exam.attempts, enrollment.status, now);
  if (!exam.isPublished && (enrollment.status !== "ACTIVE" || !summary.hasOngoingAttempt)) return null;
  return {
    ...summary,
    // La excepción solo permite retomar: no habilita inicios, notas ni resultados del examen oculto.
    ...(!exam.isPublished ? { canStart: false, best: null, pendingReview: false, lastFinishedAttemptId: null } : {}),
    courseId: exam.courseId,
    courseName: exam.course.name,
    instructions: exam.instructions,
    timezone: exam.course.institution.timezone,
  };
}

const questionSelect = {
  bankItemId: true,
  order: true,
  points: true,
  snapshot: true,
  bankItem: { select: { type: true, prompt: true, options: true, answerKey: true, explanation: true } },
} satisfies Prisma.ExamQuestionSelect;

type QuestionRow = Prisma.ExamQuestionGetPayload<{ select: typeof questionSelect }>;

/** La copia con la que se califica; el banco solo se usa en exámenes viejos sin copia. */
function snapshotOf(question: QuestionRow): QuestionSnapshot {
  const value = question.snapshot;
  if (value && typeof value === "object" && !Array.isArray(value) && typeof value.answerKey === "string") {
    return value as unknown as QuestionSnapshot;
  }
  return questionSnapshot(question.bankItem, question.points);
}

/**
 * El intento en curso y vigente del estudiante, con sus preguntas sin la clave.
 * Sirve para retomar tras recargar la página. `null` si no hay ninguno o ya venció.
 */
export async function getOngoingAttempt(actor: Actor, examId: string, now = new Date()): Promise<OngoingAttempt | null> {
  const attempt = await db.examAttempt.findFirst({
    where: {
      ...ongoingAttemptOf(actor, now),
      examId,
      exam: { institutionId: actor.institutionId },
    },
    select: {
      id: true,
      attemptNumber: true,
      expiresAt: true,
      exam: { select: { questions: { select: questionSelect, orderBy: { order: "asc" } } } },
    },
  });
  if (!attempt?.expiresAt) return null;
  return {
    attemptId: attempt.id,
    attemptNumber: attempt.attemptNumber,
    expiresAt: attempt.expiresAt,
    serverNow: now,
    questions: attempt.exam.questions.map((question) => {
      const { type, prompt, options, points } = snapshotOf(question);
      return { bankItemId: question.bankItemId, order: question.order, type, prompt, options, points };
    }),
  };
}

/**
 * Resultado de un intento propio ya terminado. `null` si no existe, es de otra persona,
 * de otra institución o todavía está en curso.
 */
export async function getAttemptResult(actor: Actor, attemptId: string, now = new Date()): Promise<AttemptResult | null> {
  const attempt = await db.examAttempt.findFirst({
    where: {
      id: attemptId,
      studentId: actor.id,
      institutionId: actor.institutionId,
      exam: { institutionId: actor.institutionId, isPublished: true },
    },
    select: {
      id: true,
      attemptNumber: true,
      status: true,
      score: true,
      maxScore: true,
      expiresAt: true,
      submittedAt: true,
      answers: { select: { bankItemId: true, response: true, isCorrect: true, score: true, feedback: true } },
      exam: {
        select: {
          id: true,
          title: true,
          courseId: true,
          showReview: true,
          passingPercent: true,
          opensAt: true,
          closesAt: true,
          maxAttempts: true,
          course: { select: { institution: { select: { timezone: true } } } },
          questions: { select: questionSelect, orderBy: { order: "asc" } },
          _count: { select: { attempts: { where: { studentId: actor.id, institutionId: actor.institutionId } } } },
          // Otro intento propio sin terminar (aunque su reloj haya vencido, el envío aún puede llegar).
          attempts: { where: { studentId: actor.id, institutionId: actor.institutionId, status: "IN_PROGRESS" }, select: { id: true }, take: 1 },
        },
      },
    },
  });
  // El reloj no finaliza un intento: el envío aún puede llegar durante la tolerancia de red.
  // No entregar claves hasta que una escritura haya confirmado un estado terminal.
  if (!attempt || attempt.status === "IN_PROGRESS") return null;
  const enrollment = await enrollmentOf(actor, attempt.exam.courseId);
  if (!enrollment) return null;

  const { exam } = attempt;
  const snapshots = exam.questions.map((question) => ({ question, snapshot: snapshotOf(question) }));
  const totalPoints = snapshots.reduce((sum, item) => sum + item.snapshot.points, 0);
  const attemptsLeft = Math.max(0, exam.maxAttempts - exam._count.attempts);
  const open = !(exam.opensAt && now < exam.opensAt) && !(exam.closesAt && now >= exam.closesAt);
  const answers = new Map(attempt.answers.map((answer) => [answer.bankItemId, answer]));
  // Las correctas solo salen cuando ya no hay forma de usarlas en otro intento.
  const closed = exam.closesAt !== null && now >= exam.closesAt;
  const noMoreTries = attemptsLeft === 0 || closed || enrollment.status !== "ACTIVE";
  const reviewOpen = noMoreTries && exam.attempts.length === 0;

  return {
    attemptId: attempt.id,
    attemptNumber: attempt.attemptNumber,
    examId: exam.id,
    examTitle: exam.title,
    courseId: exam.courseId,
    timezone: exam.course.institution.timezone,
    submittedAt: attempt.submittedAt,
    score: attempt.score ?? 0,
    maxScore: attempt.maxScore ?? totalPoints,
    pendingReview: attempt.status === "SUBMITTED",
    expiredWithoutAnswers: attempt.answers.length === 0,
    attemptsLeft,
    canRetry: attemptsLeft > 0 && open && enrollment.status === "ACTIVE",
    passingPercent: exam.passingPercent,
    passed: attempt.status === "GRADED" ? examPassed(attempt.score, attempt.maxScore ?? totalPoints, exam.passingPercent) : null,
    reviewLater: exam.showReview && !reviewOpen,
    review: exam.showReview && reviewOpen
      ? snapshots.map(({ question, snapshot }) => {
          const answer = answers.get(question.bankItemId);
          return {
            order: question.order,
            type: snapshot.type,
            prompt: snapshot.prompt,
            points: snapshot.points,
            response: answer?.response ?? "",
            correctAnswer: snapshot.answerKey,
            isCorrect: answer?.isCorrect ?? null,
            score: answer?.score ?? null,
            explanation: question.bankItem.explanation,
            feedback: answer?.feedback ?? null,
          };
        })
      : null,
  };
}
