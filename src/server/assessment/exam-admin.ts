import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { reviewedExamScore } from "@/lib/lms";
import { questionSnapshot, type QuestionSnapshot } from "@/server/exams";
import { writeGradeEntry } from "@/server/grade-history";
import { findManagedCourse, readOptions, type Manager, type QuestionKind } from "./question-bank";

export type ExamResult = { ok: true; id: string; courseId: string; message: string } | { ok: false; message: string };
export type ExamStatus = "DRAFT" | "PUBLISHED" | "CLOSED";

const NO_COURSE = "No encontramos ese curso o no tienes permiso para gestionarlo.";
const NO_EXAM = "No encontramos ese examen.";
export const LOCKED_MESSAGE =
  "Este examen ya tiene intentos de estudiantes. Para que todos sean evaluados con las mismas reglas, ya no se pueden cambiar las preguntas, los puntos, el tiempo, los intentos permitidos ni si se muestran las respuestas. Sí puedes cambiar el título, las instrucciones, las fechas, el porcentaje para aprobar y publicarlo u ocultarlo.";

// ---------------------------------------------------------------------------
// Fechas en la zona horaria de la institución
// ---------------------------------------------------------------------------

function zoneOffsetMs(utcMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Convierte "2026-10-09T08:30" (hora del reloj de la institución) al instante real. Null si no es una fecha válida. */
export function zonedInputToDate(local: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local.trim());
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  if (Number.isNaN(wall) || new Date(wall).getUTCDate() !== day) return null;
  try {
    const guess = wall - zoneOffsetMs(wall, timeZone);
    return new Date(wall - zoneOffsetMs(guess, timeZone));
  } catch {
    return null;
  }
}

/** Inverso de `zonedInputToDate`: lo que se pone en un campo de fecha y hora. */
export function dateToZonedInput(date: Date | null, timeZone: string): string {
  if (!date) return "";
  return new Date(date.getTime() + zoneOffsetMs(date.getTime(), timeZone)).toISOString().slice(0, 16);
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export function examStatus(exam: { isPublished: boolean; closesAt: Date | null }, now = new Date()): ExamStatus {
  if (!exam.isPublished) return "DRAFT";
  return exam.closesAt && exam.closesAt <= now ? "CLOSED" : "PUBLISHED";
}

type SnapshotSource = {
  snapshot: Prisma.JsonValue | null;
  points: number;
  bankItem: { type: QuestionKind; prompt: string; options: Prisma.JsonValue | null; answerKey: string };
};

/** La pregunta tal como quedó guardada dentro del examen (o la del banco en exámenes antiguos sin copia). */
function frozen(question: SnapshotSource): QuestionSnapshot {
  const value = question.snapshot;
  if (value && typeof value === "object" && !Array.isArray(value) && typeof value.answerKey === "string") {
    return value as unknown as QuestionSnapshot;
  }
  return questionSnapshot(question.bankItem, question.points);
}

const bankFields = { type: true, prompt: true, options: true, answerKey: true } as const;

export type ExamListItem = {
  id: string;
  title: string;
  status: ExamStatus;
  questionCount: number;
  totalPoints: number;
  submittedAttempts: number;
  pendingReview: number;
  opensAt: Date | null;
  closesAt: Date | null;
  durationMinutes: number | null;
};

/** Exámenes del curso para quien lo gestiona. Null si no puede gestionarlo. */
export async function listExams(actor: Manager, courseId: string, now = new Date()) {
  const course = await findManagedCourse(actor, courseId);
  if (!course) return null;
  const [rows, bankCount] = await Promise.all([
    db.exam.findMany({
      where: { institutionId: actor.institutionId, courseId: course.id },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        isPublished: true,
        opensAt: true,
        closesAt: true,
        durationMinutes: true,
        questions: { select: { points: true } },
        attempts: { select: { status: true } },
      },
    }),
    db.questionBankItem.count({ where: { institutionId: actor.institutionId, courseId: course.id } }),
  ]);
  const exams: ExamListItem[] = rows.map((exam) => ({
    id: exam.id,
    title: exam.title,
    status: examStatus(exam, now),
    questionCount: exam.questions.length,
    totalPoints: exam.questions.reduce((sum, question) => sum + question.points, 0),
    submittedAttempts: exam.attempts.filter((attempt) => attempt.status !== "IN_PROGRESS").length,
    pendingReview: exam.attempts.filter((attempt) => attempt.status === "SUBMITTED").length,
    opensAt: exam.opensAt,
    closesAt: exam.closesAt,
    durationMinutes: exam.durationMinutes,
  }));
  return { course: { id: course.id, name: course.name }, timezone: course.institution.timezone, bankCount, exams };
}

export type BankChoice = { id: string; type: QuestionKind; prompt: string; defaultPoints: number };
export type ExamFormQuestion = { bankItemId: string; type: QuestionKind; prompt: string; points: number };

/** Lo que necesita el formulario de examen: banco del curso, categorías de calificación y, al editar, el examen. */
export async function getExamForm(actor: Manager, courseId: string, examId?: string) {
  const course = await findManagedCourse(actor, courseId);
  if (!course) return null;
  const scope = { institutionId: actor.institutionId, courseId: course.id };
  const timezone = course.institution.timezone;
  const [bank, categories, exam] = await Promise.all([
    db.questionBankItem.findMany({
      where: scope,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 500,
      select: { id: true, type: true, prompt: true, defaultPoints: true },
    }),
    db.gradeCategory.findMany({
      where: scope,
      orderBy: { name: "asc" },
      select: { id: true, name: true, gradingPeriod: { select: { name: true } } },
    }),
    examId
      ? db.exam.findFirst({
          where: { id: examId, ...scope },
          select: {
            id: true,
            title: true,
            instructions: true,
            opensAt: true,
            closesAt: true,
            durationMinutes: true,
            maxAttempts: true,
            isPublished: true,
            showReview: true,
            passingPercent: true,
            gradeItem: { select: { category: { select: { name: true } }, _count: { select: { entries: true } } } },
            questions: { orderBy: { order: "asc" }, select: { bankItemId: true, points: true, snapshot: true, bankItem: { select: bankFields } } },
            attempts: { select: { studentId: true } },
          },
        })
      : null,
  ]);
  if (examId && !exam) return null;
  return {
    course: { id: course.id, name: course.name },
    timezone,
    bank: bank as BankChoice[],
    categories: categories.map((category) => ({ id: category.id, name: `${category.name} · ${category.gradingPeriod.name}` })),
    exam: exam && {
      id: exam.id,
      title: exam.title,
      instructions: exam.instructions ?? "",
      opensAt: dateToZonedInput(exam.opensAt, timezone),
      closesAt: dateToZonedInput(exam.closesAt, timezone),
      durationMinutes: exam.durationMinutes,
      maxAttempts: exam.maxAttempts,
      isPublished: exam.isPublished,
      showReview: exam.showReview,
      passingPercent: exam.passingPercent,
      status: examStatus(exam),
      gradeCategoryName: exam.gradeItem?.category.name ?? null,
      gradeEntries: exam.gradeItem?._count.entries ?? 0,
      attemptCount: exam.attempts.length,
      studentCount: new Set(exam.attempts.map((attempt) => attempt.studentId)).size,
      questions: exam.questions.map((question): ExamFormQuestion => {
        const copy = frozen(question);
        return { bankItemId: question.bankItemId, type: copy.type, prompt: copy.prompt, points: question.points };
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Crear y editar
// ---------------------------------------------------------------------------

export type ExamInput = {
  title: string;
  instructions?: string;
  /** En el orden en que se presentan. */
  questions: Array<{ bankItemId: string; points: number }>;
  /** Minutos; null o vacío = sin límite propio. */
  durationMinutes?: number | null;
  maxAttempts: number;
  /** Fecha y hora del reloj de la institución ("2026-10-09T08:30") o vacío. */
  opensAt?: string;
  closesAt?: string;
  showReview: boolean;
  /** Porcentaje de la nota para aprobar (1 a 100); null o vacío = el examen no dice «Aprobado». */
  passingPercent?: number | null;
  /** Solo al crear: categoría del libro de calificaciones donde cuenta la nota. */
  gradeCategoryId?: string;
};

const examSchema = z.object({
  title: z.string().trim().min(3, "Escribe un título de al menos 3 letras.").max(140, "El título es demasiado largo."),
  instructions: z.string().trim().max(20000, "Las instrucciones son demasiado largas.").optional(),
  questions: z
    .array(
      z.object({
        bankItemId: z.string().min(1),
        points: z.number({ message: "Escribe los puntos de cada pregunta." }).min(0, "Los puntos no pueden ser negativos.").max(1000, "El máximo por pregunta es 1000 puntos."),
      }),
    )
    .max(200, "Un examen puede tener hasta 200 preguntas."),
  durationMinutes: z
    .number({ message: "El tiempo límite debe ser un número de minutos." })
    .int("El tiempo límite debe ser un número entero de minutos.")
    .min(1, "El tiempo límite debe ser de al menos 1 minuto.")
    .max(600, "El tiempo límite máximo es de 600 minutos.")
    .nullish(),
  maxAttempts: z
    .number({ message: "Escribe cuántos intentos se permiten." })
    .int("Los intentos deben ser un número entero.")
    .min(1, "Debe permitirse al menos 1 intento.")
    .max(10, "El máximo es 10 intentos."),
  showReview: z.boolean(),
  passingPercent: z
    .number({ message: "El porcentaje para aprobar debe ser un número entero entre 1 y 100." })
    .int("El porcentaje para aprobar debe ser un número entero entre 1 y 100.")
    .min(1, "El porcentaje para aprobar debe ser un número entero entre 1 y 100.")
    .max(100, "El porcentaje para aprobar debe ser un número entero entre 1 y 100.")
    .nullish(),
});

type Parsed = z.infer<typeof examSchema> & { opensAt: Date | null; closesAt: Date | null };

function parseExam(input: ExamInput, timeZone: string): { ok: true; data: Parsed } | { ok: false; message: string } {
  const parsed = examSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const ids = parsed.data.questions.map((question) => question.bankItemId);
  if (new Set(ids).size !== ids.length) return { ok: false, message: "Una pregunta está repetida en el examen. Quita la repetida." };
  const dates = { opensAt: null as Date | null, closesAt: null as Date | null };
  for (const key of ["opensAt", "closesAt"] as const) {
    const raw = input[key]?.trim();
    if (!raw) continue;
    const date = zonedInputToDate(raw, timeZone);
    if (!date) return { ok: false, message: key === "opensAt" ? "La fecha de apertura no es válida." : "La fecha de cierre no es válida." };
    dates[key] = date;
  }
  if (dates.opensAt && dates.closesAt && dates.closesAt <= dates.opensAt) {
    return { ok: false, message: "El cierre debe ser después de la apertura." };
  }
  return { ok: true, data: { ...parsed.data, ...dates } };
}

/** Motivo por el que un examen no se puede publicar, o null si está listo. */
export function publishBlocker(questions: Array<{ points: number }>): string | null {
  if (!questions.length) return "Agrega al menos una pregunta antes de publicar el examen.";
  if (questions.reduce((sum, question) => sum + question.points, 0) <= 0) {
    return "El examen debe valer más de 0 puntos. Pon puntos a alguna pregunta antes de publicarlo.";
  }
  return null;
}

const total = (questions: Array<{ points: number }>) => questions.reduce((sum, question) => sum + question.points, 0);

/** Crea el examen como borrador. Las preguntas se copian del banco y quedan fijas dentro del examen. */
export async function createExam(actor: Manager, courseId: string, input: ExamInput): Promise<ExamResult> {
  const course = await findManagedCourse(actor, courseId);
  if (!course) return { ok: false, message: NO_COURSE };
  const parsed = parseExam(input, course.institution.timezone);
  if (!parsed.ok) return parsed;
  const data = parsed.data;
  const scope = { institutionId: actor.institutionId, courseId: course.id };

  const bank = await db.questionBankItem.findMany({
    where: { ...scope, id: { in: data.questions.map((question) => question.bankItemId) } },
    select: { id: true, ...bankFields },
  });
  const byId = new Map(bank.map((item) => [item.id, item]));
  if (byId.size !== data.questions.length) {
    return { ok: false, message: "Alguna pregunta no pertenece al banco de este curso. Vuelve a elegir las preguntas." };
  }
  const category = input.gradeCategoryId
    ? await db.gradeCategory.findFirst({ where: { id: input.gradeCategoryId, ...scope }, select: { id: true, gradingPeriodId: true } })
    : null;
  if (input.gradeCategoryId && !category) return { ok: false, message: "Esa categoría de calificación no es de este curso." };

  const exam = await db.$transaction(async (tx) => {
    const created = await tx.exam.create({
      data: {
        ...scope,
        title: data.title,
        instructions: data.instructions || null,
        opensAt: data.opensAt,
        closesAt: data.closesAt,
        durationMinutes: data.durationMinutes ?? null,
        maxAttempts: data.maxAttempts,
        showReview: data.showReview,
        passingPercent: data.passingPercent ?? null,
        isPublished: false,
        questions: {
          create: data.questions.map((question, order) => ({
            institutionId: actor.institutionId,
            bankItemId: question.bankItemId,
            order,
            points: question.points,
            snapshot: questionSnapshot(byId.get(question.bankItemId)!, question.points),
          })),
        },
      },
      select: { id: true, title: true },
    });
    if (category) {
      await tx.gradeItem.create({
        data: {
          ...scope,
          gradingPeriodId: category.gradingPeriodId,
          categoryId: category.id,
          examId: created.id,
          title: created.title,
          maxScore: total(data.questions),
          isPublished: false,
        },
      });
    }
    return created;
  });
  return { ok: true, id: exam.id, courseId: course.id, message: "Examen guardado como borrador. Publícalo cuando esté listo." };
}

async function findManagedExam(actor: Manager, examId: string) {
  if (!actor.institutionId || !examId) return null;
  const exam = await db.exam.findFirst({
    where: { id: examId, institutionId: actor.institutionId },
    select: {
      id: true,
      courseId: true,
      title: true,
      isPublished: true,
      durationMinutes: true,
      maxAttempts: true,
      showReview: true,
      gradeItem: { select: { id: true, _count: { select: { entries: true } } } },
      questions: { orderBy: { order: "asc" }, select: { bankItemId: true, points: true, snapshot: true } },
      _count: { select: { attempts: true } },
    },
  });
  if (!exam) return null;
  const course = await findManagedCourse(actor, exam.courseId);
  return course ? { ...exam, timezone: course.institution.timezone } : null;
}

/**
 * Corrige un examen. Con intentos de estudiantes solo cambian título, instrucciones y fechas.
 * Sin intentos se puede rearmar: las preguntas que ya estaban conservan su copia guardada y
 * las nuevas se copian del banco como está hoy.
 */
export async function updateExam(actor: Manager, examId: string, input: ExamInput): Promise<ExamResult> {
  const managed = await findManagedExam(actor, examId);
  if (!managed) return { ok: false, message: NO_EXAM };
  const parsed = parseExam(input, managed.timezone);
  if (!parsed.ok) return parsed;
  const data = parsed.data;
  const scope = { institutionId: actor.institutionId, courseId: managed.courseId };
  // El porcentaje para aprobar no cambia ninguna nota: todos los intentos se comparan con el valor vigente,
  // por eso se puede corregir aunque ya haya intentos.
  const basics = { title: data.title, instructions: data.instructions || null, opensAt: data.opensAt, closesAt: data.closesAt, passingPercent: data.passingPercent ?? null };

  return db.$transaction(async (tx) => {
    // Mismo primer bloqueo que startExamAttempt: nunca decidir con preguntas o conteos anteriores a la espera.
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "exams"
      WHERE "id" = ${examId} AND "institutionId" = ${actor.institutionId} AND "courseId" = ${managed.courseId}
      FOR UPDATE`;
    if (!locked.length) return { ok: false, message: NO_EXAM };
    const exam = await tx.exam.findFirst({
      where: { id: examId, ...scope },
      select: {
        id: true,
        courseId: true,
        isPublished: true,
        durationMinutes: true,
        maxAttempts: true,
        showReview: true,
        gradeItem: { select: { id: true } },
        questions: { orderBy: { order: "asc" }, select: { bankItemId: true, points: true, snapshot: true } },
        _count: { select: { attempts: true } },
      },
    });
    if (!exam) return { ok: false, message: NO_EXAM };
    const sameQuestions = data.questions.length === exam.questions.length && data.questions.every((question, index) =>
      question.bankItemId === exam.questions[index].bankItemId && question.points === exam.questions[index].points);

    if (exam._count.attempts > 0) {
      const sameRules = (data.durationMinutes ?? null) === exam.durationMinutes &&
        data.maxAttempts === exam.maxAttempts && data.showReview === exam.showReview;
      if (!sameQuestions || !sameRules) return { ok: false, message: LOCKED_MESSAGE };
      await tx.exam.update({ where: { id: exam.id }, data: basics });
      if (exam.gradeItem) await tx.gradeItem.update({ where: { id: exam.gradeItem.id }, data: { title: data.title } });
      return { ok: true, id: exam.id, courseId: exam.courseId, message: "Cambios guardados." };
    }

    if (exam.isPublished) {
      const blocker = publishBlocker(data.questions);
      if (blocker) return { ok: false, message: `${blocker} Si quieres dejarlo sin terminar, primero ocúltalo.` };
    }
    const kept = new Map(exam.questions.map((question) => [question.bankItemId, question.snapshot]));
    const added = data.questions.map((question) => question.bankItemId).filter((id) => !kept.has(id));
    const bank = added.length
      ? await tx.questionBankItem.findMany({ where: { ...scope, id: { in: added } }, select: { id: true, ...bankFields } })
      : [];
    const byId = new Map(bank.map((item) => [item.id, item]));
    if (byId.size !== added.length) {
      return { ok: false, message: "Alguna pregunta no pertenece al banco de este curso. Vuelve a elegir las preguntas." };
    }
    await tx.exam.update({
      where: { id: exam.id },
      data: { ...basics, durationMinutes: data.durationMinutes ?? null, maxAttempts: data.maxAttempts, showReview: data.showReview },
    });
    if (!sameQuestions) {
      await tx.examQuestion.deleteMany({ where: { examId: exam.id } });
      await tx.examQuestion.createMany({
        data: data.questions.map((question, order) => {
          const previous = kept.get(question.bankItemId);
          const snapshot =
            previous && typeof previous === "object" && !Array.isArray(previous)
              ? ({ ...previous, points: question.points } as Prisma.InputJsonObject)
              : questionSnapshot(byId.get(question.bankItemId)!, question.points);
          return { institutionId: actor.institutionId, examId: exam.id, bankItemId: question.bankItemId, order, points: question.points, snapshot };
        }),
      });
    }
    if (exam.gradeItem) {
      await tx.gradeItem.update({ where: { id: exam.gradeItem.id }, data: { title: data.title, maxScore: total(data.questions) } });
    }
    return { ok: true, id: exam.id, courseId: exam.courseId, message: "Cambios guardados." };
  }, { isolationLevel: "ReadCommitted" });
}

/** Publica (los estudiantes lo ven y pueden presentarlo) u oculta el examen. */
export async function setExamPublished(actor: Manager, examId: string, publish: boolean): Promise<ExamResult> {
  const exam = await findManagedExam(actor, examId);
  if (!exam) return { ok: false, message: NO_EXAM };
  if (publish) {
    const blocker = publishBlocker(exam.questions);
    if (blocker) return { ok: false, message: blocker };
  }
  await db.$transaction(async (tx) => {
    await tx.exam.update({ where: { id: exam.id }, data: { isPublished: publish } });
    if (exam.gradeItem) await tx.gradeItem.update({ where: { id: exam.gradeItem.id }, data: { isPublished: publish } });
  });
  return {
    ok: true,
    id: exam.id,
    courseId: exam.courseId,
    message: publish ? "Examen publicado. Los estudiantes del curso ya pueden verlo." : "Examen oculto. Los estudiantes ya no lo ven.",
  };
}

/**
 * Borra el examen para siempre. Con él se borran sus intentos y respuestas. Las notas que
 * ya pasaron al libro de calificaciones no se borran: quedan allí como una actividad suelta.
 * Si hay intentos se exige un motivo, que queda en el registro de la institución.
 */
export async function deleteExam(actor: Manager, examId: string, reason = ""): Promise<ExamResult> {
  const exam = await findManagedExam(actor, examId);
  if (!exam) return { ok: false, message: NO_EXAM };
  const motive = reason.trim().slice(0, 500);
  if (exam._count.attempts > 0 && motive.length < 5) {
    return { ok: false, message: "Este examen tiene intentos de estudiantes. Escribe el motivo para borrarlo." };
  }
  const result = await db.$transaction(async (tx) => {
    const attempts = await tx.examAttempt.count({ where: { examId: exam.id } });
    if (attempts > 0 && motive.length < 5) return null;
    const entries = exam.gradeItem ? await tx.gradeEntry.count({ where: { gradeItemId: exam.gradeItem.id } }) : 0;
    if (exam.gradeItem && entries === 0) await tx.gradeItem.delete({ where: { id: exam.gradeItem.id } });
    await tx.exam.delete({ where: { id: exam.id } });
    await tx.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        userId: actor.id,
        action: "EXAM_DELETED",
        entity: "Exam",
        entityId: exam.id,
        changes: { title: exam.title, courseId: exam.courseId, attempts, gradesKept: entries, reason: motive || null },
      },
    });
    return { attempts, entries };
  });
  if (!result) return { ok: false, message: "Un estudiante acaba de iniciar este examen. Escribe el motivo para borrarlo." };
  const parts = ["Examen borrado."];
  if (result.attempts) parts.push(result.attempts === 1 ? "Se borró 1 intento." : `Se borraron ${result.attempts} intentos.`);
  if (result.entries) parts.push(`${result.entries === 1 ? "La nota ya registrada sigue" : `Las ${result.entries} notas ya registradas siguen`} en el libro de calificaciones.`);
  return { ok: true, id: exam.id, courseId: exam.courseId, message: parts.join(" ") };
}

// ---------------------------------------------------------------------------
// Resultados y revisión
// ---------------------------------------------------------------------------

export type AttemptAnswerView = {
  id: string;
  order: number;
  type: QuestionKind;
  prompt: string;
  options: string[];
  expected: string;
  response: string;
  points: number;
  score: number | null;
  isCorrect: boolean | null;
  feedback: string | null;
};

export type AttemptView = {
  id: string;
  studentName: string;
  attemptNumber: number;
  /** IN_PROGRESS vencido se muestra como "EXPIRED": el tiempo terminó y no envió. */
  status: "IN_PROGRESS" | "EXPIRED" | "SUBMITTED" | "GRADED";
  score: number | null;
  maxScore: number | null;
  startedAt: Date;
  submittedAt: Date | null;
  durationMinutes: number | null;
  answers: AttemptAnswerView[];
};

/** Intentos de cada estudiante con sus respuestas. Null si no puede gestionar el examen. */
export async function getExamResults(actor: Manager, examId: string, now = new Date()) {
  const found = await findManagedExam(actor, examId);
  if (!found) return null;
  const exam = await db.exam.findUniqueOrThrow({
    where: { id: found.id },
    select: {
      id: true,
      title: true,
      courseId: true,
      isPublished: true,
      closesAt: true,
      passingPercent: true,
      course: { select: { name: true } },
      gradeItem: { select: { gradingPeriod: { select: { isPublished: true } } } },
      questions: { orderBy: { order: "asc" }, select: { bankItemId: true, order: true, points: true, snapshot: true, bankItem: { select: bankFields } } },
      attempts: {
        orderBy: [{ student: { name: "asc" } }, { attemptNumber: "asc" }],
        select: {
          id: true,
          attemptNumber: true,
          status: true,
          score: true,
          maxScore: true,
          startedAt: true,
          expiresAt: true,
          submittedAt: true,
          student: { select: { name: true } },
          answers: { select: { id: true, bankItemId: true, response: true, score: true, isCorrect: true, feedback: true } },
        },
      },
    },
  });
  const questions = new Map(exam.questions.map((question) => [question.bankItemId, { order: question.order, points: question.points, copy: frozen(question) }]));
  const attempts: AttemptView[] = exam.attempts.map((attempt) => ({
    id: attempt.id,
    studentName: attempt.student.name,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status === "IN_PROGRESS" && attempt.expiresAt && attempt.expiresAt <= now ? "EXPIRED" : attempt.status,
    score: attempt.score,
    maxScore: attempt.maxScore,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    durationMinutes: attempt.submittedAt ? Math.max(0, Math.round((attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 60_000)) : null,
    answers: attempt.answers
      .flatMap((answer) => {
        const question = questions.get(answer.bankItemId);
        if (!question) return [];
        return [{
          id: answer.id,
          order: question.order,
          type: question.copy.type,
          prompt: question.copy.prompt,
          options: readOptions(question.copy.options),
          expected: question.copy.answerKey,
          response: answer.response ?? "",
          points: question.points,
          score: answer.score,
          isCorrect: answer.isCorrect,
          feedback: answer.feedback,
        }];
      })
      .sort((a, b) => a.order - b.order),
  }));
  return {
    exam: {
      id: exam.id,
      title: exam.title,
      courseId: exam.courseId,
      courseName: exam.course.name,
      status: examStatus(exam, now),
      totalPoints: total(exam.questions),
      passingPercent: exam.passingPercent,
      countsForGrade: Boolean(exam.gradeItem),
      gradesPublished: exam.gradeItem?.gradingPeriod.isPublished ?? false,
    },
    timezone: found.timezone,
    attempts,
  };
}

export type ReviewInput = {
  /** Por id de respuesta corta: puntos otorgados y comentario opcional. */
  answers: Record<string, { score: number | null; feedback?: string }>;
  /** Motivo; obligatorio solo si las notas del período ya se publicaron y la nota cambia. */
  reason?: string;
};

class ReviewStopped extends Error {}

/**
 * Revisión manual de las respuestas cortas de un intento enviado. Al terminar, el intento
 * queda calificado y la nota pasa al libro de calificaciones por `writeGradeEntry`.
 */
export async function reviewExamAttempt(actor: Manager, attemptId: string, input: ReviewInput): Promise<ExamResult> {
  if (!actor.institutionId || !attemptId) return { ok: false, message: "No encontramos ese intento." };
  const attempt = await db.examAttempt.findFirst({
    where: { id: attemptId, institutionId: actor.institutionId, status: "SUBMITTED" },
    select: {
      id: true,
      enrollmentId: true,
      maxScore: true,
      answers: { select: { id: true, bankItemId: true, score: true, feedback: true } },
      exam: {
        select: {
          id: true,
          courseId: true,
          gradeItem: { select: { id: true } },
          questions: { select: { bankItemId: true, points: true, snapshot: true, bankItem: { select: bankFields } } },
        },
      },
    },
  });
  if (!attempt || !(await findManagedCourse(actor, attempt.exam.courseId))) {
    return { ok: false, message: "No encontramos ese intento o ya fue revisado." };
  }
  const questions = new Map(attempt.exam.questions.map((question) => [question.bankItemId, { points: question.points, type: frozen(question).type }]));
  const reviewed = attempt.answers.map((answer) => {
    const question = questions.get(answer.bankItemId);
    const manual = question?.type === "SHORT_ANSWER";
    const given = manual ? input.answers[answer.id] : undefined;
    return {
      id: answer.id,
      manual,
      points: question?.points ?? 0,
      automaticScore: manual ? null : answer.score,
      manualScore: given?.score ?? undefined,
      feedback: manual ? (given?.feedback ?? "").trim().slice(0, 5000) : answer.feedback ?? "",
    };
  });
  const score = reviewedExamScore(reviewed);
  if (score == null) return { ok: false, message: "Pon los puntos de cada respuesta, entre 0 y el máximo de la pregunta." };

  try {
    await db.$transaction(async (tx) => {
      const claimed = await tx.examAttempt.updateMany({ where: { id: attempt.id, status: "SUBMITTED" }, data: { status: "GRADED", score } });
      if (claimed.count !== 1) throw new ReviewStopped("Otra persona ya revisó este intento.");
      for (const answer of reviewed.filter((item) => item.manual)) {
        await tx.examAnswer.update({ where: { id: answer.id }, data: { score: answer.manualScore, feedback: answer.feedback || null } });
      }
      if (attempt.exam.gradeItem) {
        const written = await writeGradeEntry(tx, {
          institutionId: actor.institutionId,
          gradeItemId: attempt.exam.gradeItem.id,
          enrollmentId: attempt.enrollmentId,
          score,
          actorId: actor.id,
          reason: input.reason?.trim() || "Revisión de respuestas abiertas del examen",
        });
        if (!written.ok) throw new ReviewStopped(written.message);
      }
    });
  } catch (error) {
    if (error instanceof ReviewStopped) return { ok: false, message: error.message };
    throw error;
  }
  return { ok: true, id: attempt.exam.id, courseId: attempt.exam.courseId, message: `Intento revisado: ${score} de ${attempt.maxScore ?? score} puntos.` };
}
