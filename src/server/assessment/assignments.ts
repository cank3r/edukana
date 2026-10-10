import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Capability } from "@/lib/capabilities";
import { courseWhereForScope, resolveCourseWriteScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import { archiveSubmissionVersion, writeGradeEntry } from "@/server/grade-history";
import type { EdukanaRole } from "@/types/next-auth";
import { notifyAssignmentPublished, notifyGradePosted, notifySubmissionReceived } from "@/server/notifications/events";
import { deadlineLabel } from "@/lib/deadline";
import { lockAssignmentSubmission } from "./submission-lock";
import {
  ASSIGNMENT_RETENTION_MESSAGE,
  assignmentDeletionBlocked,
  assignmentSubmissionAccess,
  studentAssignmentGrade,
  SubmissionRevisionUnavailable,
} from "./assignment-policies";

/** Quien gestiona el curso: docente titular o quien puede ver y gestionar todos los cursos. */
export type AssignmentManager = { id: string; institutionId: string; role: EdukanaRole; capabilities: ReadonlySet<Capability> };
/** Estudiante en sesión. Solo ve y toca lo suyo. */
export type AssignmentStudent = { id: string; institutionId: string };

export type AssignmentResult<T = object> = ({ ok: true; courseId: string } & T) | { ok: false; message: string };

const DEFAULT_TIMEZONE = "America/Santo_Domingo";
const NOT_FOUND = "No encontramos esa tarea o no tienes acceso a ella.";
const fail = (message: string) => ({ ok: false, message }) as const;

// ---------------------------------------------------------------------------
// Fechas en la zona horaria de la institución
// ---------------------------------------------------------------------------

function safeZone(timeZone: string | null | undefined): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timeZone || DEFAULT_TIMEZONE });
    return timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** Partes de calendario de un instante vistas desde una zona horaria. */
function zonedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

function zoneOffsetMs(instant: number, timeZone: string): number {
  const p = zonedParts(new Date(instant), timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000;
}

/** Convierte "AAAA-MM-DDTHH:mm" escrito en la hora local de la institución al instante real. */
export function localInputToDate(local: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const probe = new Date(wall);
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day || hour > 23 || minute > 59) return null;
  const zone = safeZone(timeZone);
  let instant = wall - zoneOffsetMs(wall, zone);
  instant = wall - zoneOffsetMs(instant, zone);
  return new Date(instant);
}

/** Inverso de `localInputToDate`: el valor para un campo de fecha y hora. */
export function dateToLocalInput(date: Date | null, timeZone: string): string {
  if (!date) return "";
  const p = zonedParts(date, safeZone(timeZone));
  const two = (value: number) => String(value).padStart(2, "0");
  return `${String(p.year).padStart(4, "0")}-${two(p.month)}-${two(p.day)}T${two(p.hour)}:${two(p.minute)}`;
}

function clock(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("es-DO", { timeZone, hour: "numeric", minute: "2-digit", hour12: true }).format(date);
}

/** Fecha completa y legible: «viernes 16 de octubre, 5:00 p. m.». */
export function formatDateTime(date: Date, timeZone: string): string {
  const zone = safeZone(timeZone);
  const day = new Intl.DateTimeFormat("es-DO", { timeZone: zone, weekday: "long", day: "numeric", month: "long" }).format(date);
  return `${day}, ${clock(date, zone)}`;
}

/**
 * «Vence mañana a las 5:00 p. m.», «Venció ayer», «Vence el jueves 16 de octubre», «Sin fecha límite».
 * Cuenta días de calendario en la zona de la institución (ver `src/lib/deadline.ts`).
 */
export function dueLabel(dueDate: Date | null, now: Date, timeZone: string, options: { withTime?: boolean } = {}): string {
  if (!dueDate) return "Sin fecha límite";
  return deadlineLabel(dueDate, now, safeZone(timeZone), options);
}

// ---------------------------------------------------------------------------
// Acceso
// ---------------------------------------------------------------------------

function managedCourseWhere(actor: AssignmentManager): Prisma.CourseWhereInput | null {
  return courseWhereForScope(actor.institutionId, resolveCourseWriteScope(actor, actor.capabilities));
}

/** El curso, solo si quien actúa lo gestiona. Null en cualquier otro caso. */
export async function managedCourse(actor: AssignmentManager, courseId: string) {
  const where = managedCourseWhere(actor);
  if (!where || !courseId) return null;
  return db.course.findFirst({
    where: { id: courseId, ...where },
    select: { id: true, name: true, institution: { select: { timezone: true } } },
  });
}

/** El curso, solo si el estudiante tiene matrícula en él (activa, o terminada para consultar). */
export async function studentCourse(student: AssignmentStudent, courseId: string) {
  if (!student.institutionId || !courseId) return null;
  const enrollment = await db.enrollment.findFirst({
    where: {
      studentId: student.id,
      courseId,
      status: { in: ["ACTIVE", "COMPLETED"] },
      course: { institutionId: student.institutionId, isPublished: true },
    },
    select: { id: true, status: true, course: { select: { id: true, name: true, institution: { select: { timezone: true } } } } },
  });
  if (!enrollment) return null;
  return { ...enrollment.course, enrollmentId: enrollment.id, isActive: enrollment.status === "ACTIVE" };
}

async function managedAssignment(actor: AssignmentManager, assignmentId: string) {
  const where = managedCourseWhere(actor);
  if (!where || !assignmentId) return null;
  return db.assignment.findFirst({
    where: { id: assignmentId, course: where },
    include: {
      course: { select: { id: true, name: true, institution: { select: { timezone: true } } } },
      gradeItem: { select: { id: true, gradingPeriod: { select: { isPublished: true } }, _count: { select: { entries: true } } } },
    },
  });
}

// ---------------------------------------------------------------------------
// Docente: crear, corregir, publicar y borrar
// ---------------------------------------------------------------------------

const assignmentSchema = z.object({
  title: z.string().trim().min(3, "Escribe un título de al menos 3 letras.").max(140, "El título es demasiado largo."),
  instructions: z.string().trim().min(10, "Explica qué deben hacer los estudiantes (al menos 10 letras).").max(30000, "Las instrucciones son demasiado largas."),
  maxScore: z.coerce.number({ message: "Escribe el puntaje máximo con números." }).positive("El puntaje máximo debe ser mayor que cero.").max(10000, "El puntaje máximo no puede pasar de 10,000."),
});

export type AssignmentInput = {
  courseId: string;
  /** Vacío al crear. */
  assignmentId?: string;
  title: string;
  instructions: string;
  /** "AAAA-MM-DDTHH:mm" en la hora de la institución, o vacío si no hay fecha límite. */
  dueLocal?: string;
  maxScore: string | number;
  allowLate: boolean;
  /** Solo al crear: categoría del libro de calificaciones donde cuenta la tarea. Vacío = no cuenta. */
  categoryId?: string;
  /** Solo al crear: dejarla visible para los estudiantes de una vez. */
  publish?: boolean;
};

/**
 * Crea una tarea o corrige una existente. Al crear, si se elige una categoría del libro de
 * calificaciones, se crea la columna enlazada; al corregir, la columna sigue a la tarea.
 */
export async function saveAssignment(actor: AssignmentManager, input: AssignmentInput, now = new Date()): Promise<AssignmentResult<{ assignmentId: string }>> {
  const course = await managedCourse(actor, input.courseId);
  if (!course) return fail("No encontramos ese curso o no tienes permiso para gestionarlo.");
  const parsed = assignmentSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los datos de la tarea.");
  const data = parsed.data;

  let dueDate: Date | null = null;
  if (input.dueLocal?.trim()) {
    dueDate = localInputToDate(input.dueLocal, course.institution.timezone);
    if (!dueDate) return fail("La fecha límite no es válida. Elige el día y la hora de nuevo.");
  }
  const fields = {
    title: data.title,
    description: data.instructions.slice(0, 500),
    instructions: data.instructions,
    dueDate,
    maxScore: data.maxScore,
    allowLate: input.allowLate,
  };

  if (!input.assignmentId) {
    const category = input.categoryId
      ? await db.gradeCategory.findFirst({
          where: { id: input.categoryId, institutionId: actor.institutionId, courseId: course.id },
          select: { id: true, gradingPeriodId: true },
        })
      : null;
    if (input.categoryId && !category) return fail("Esa parte del libro de calificaciones ya no existe. Elige otra.");
    const published = Boolean(input.publish);
    const assignmentId = await db.$transaction(async (tx) => {
      const assignment = await tx.assignment.create({
        data: { institutionId: actor.institutionId, courseId: course.id, ...fields, isPublished: published, publishedAt: published ? now : null },
        select: { id: true },
      });
      if (category) {
        await tx.gradeItem.create({
          data: {
            institutionId: actor.institutionId,
            courseId: course.id,
            gradingPeriodId: category.gradingPeriodId,
            categoryId: category.id,
            assignmentId: assignment.id,
            title: fields.title,
            maxScore: fields.maxScore,
            dueDate,
            isPublished: published,
          },
        });
      }
      return assignment.id;
    });
    if (published) await notifyAssignmentPublished(actor.institutionId, assignmentId);
    return { ok: true, courseId: course.id, assignmentId };
  }

  const existing = await managedAssignment(actor, input.assignmentId);
  if (!existing || existing.courseId !== course.id) return fail(NOT_FOUND);
  if (data.maxScore < existing.maxScore) {
    const [submissionGrades, gradebookGrades] = await Promise.all([
      db.submission.count({ where: { assignmentId: existing.id, score: { gt: data.maxScore } } }),
      existing.gradeItem
        ? db.gradeEntry.count({ where: { gradeItemId: existing.gradeItem.id, score: { gt: data.maxScore } } })
        : Promise.resolve(0),
    ]);
    if (submissionGrades > 0 || gradebookGrades > 0) {
      return fail(`Ya hay notas mayores que ${data.maxScore}. Corrige esas notas antes de bajar el puntaje máximo.`);
    }
  }
  await db.$transaction(async (tx) => {
    await tx.assignment.update({ where: { id: existing.id }, data: fields });
    if (existing.gradeItem) {
      await tx.gradeItem.update({ where: { id: existing.gradeItem.id }, data: { title: fields.title, maxScore: fields.maxScore, dueDate } });
    }
  });
  return { ok: true, courseId: course.id, assignmentId: existing.id };
}

/** Publicar (los estudiantes la ven) u ocultar (deja de verse; entregas y notas se conservan). */
export async function setAssignmentPublished(actor: AssignmentManager, assignmentId: string, published: boolean, now = new Date()): Promise<AssignmentResult> {
  const existing = await managedAssignment(actor, assignmentId);
  if (!existing) return fail(NOT_FOUND);
  await db.$transaction(async (tx) => {
    await tx.assignment.update({
      where: { id: existing.id },
      data: { isPublished: published, publishedAt: published ? (existing.publishedAt ?? now) : existing.publishedAt },
    });
    if (existing.gradeItem) await tx.gradeItem.update({ where: { id: existing.gradeItem.id }, data: { isPublished: published } });
  });
  if (published && !existing.isPublished) await notifyAssignmentPublished(actor.institutionId, existing.id);
  return { ok: true, courseId: existing.courseId };
}

/** Solo borra tareas sin entregas ni notas. Ocultar conserva cualquier historia académica. */
export async function deleteAssignment(
  actor: AssignmentManager,
  input: { assignmentId: string; reason?: string },
): Promise<AssignmentResult<{ deletedSubmissions: number }>> {
  const where = managedCourseWhere(actor);
  if (!where || !input.assignmentId) return fail(NOT_FOUND);
  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.assignment.findFirst({
        where: { id: input.assignmentId, course: where },
        select: {
          id: true, title: true, courseId: true,
          _count: { select: { submissions: true } },
          gradeItem: { select: { id: true, _count: { select: { entries: true } } } },
        },
      });
      if (!existing) return fail(NOT_FOUND);
      if (assignmentDeletionBlocked(existing._count.submissions, existing.gradeItem?._count.entries ?? 0)) {
        return fail(ASSIGNMENT_RETENTION_MESSAGE);
      }
      if (existing.gradeItem) await tx.gradeItem.delete({ where: { id: existing.gradeItem.id } });
      await tx.assignment.delete({ where: { id: existing.id } });
      await tx.auditLog.create({
        data: {
          institutionId: actor.institutionId,
          userId: actor.id,
          action: "ASSIGNMENT_DELETED",
          entity: "Assignment",
          entityId: existing.id,
          changes: {
            title: existing.title, courseId: existing.courseId,
            reason: input.reason?.trim().slice(0, 500) || null, submissions: 0, graded: 0, gradebookEntries: 0,
          },
        },
      });
      return { ok: true as const, courseId: existing.courseId, deletedSubmissions: 0 };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return fail("La tarea cambió mientras intentabas borrarla. Recarga la página para revisar sus entregas y notas.");
    }
    throw error;
  }
}

/** Categorías del libro de calificaciones donde puede contar una tarea nueva. */
export async function gradeCategoryOptions(actor: AssignmentManager, courseId: string) {
  const course = await managedCourse(actor, courseId);
  if (!course) return [];
  const categories = await db.gradeCategory.findMany({
    where: { institutionId: actor.institutionId, courseId: course.id },
    orderBy: [{ gradingPeriod: { startDate: "desc" } }, { name: "asc" }],
    select: { id: true, name: true, gradingPeriod: { select: { name: true } } },
  });
  return categories.map((category) => ({ id: category.id, label: `${category.gradingPeriod.name} · ${category.name}` }));
}

/** Lista del docente: cada tarea con cuántas entregas tiene y cuántas faltan por calificar. */
export async function listAssignmentsForManager(actor: AssignmentManager, courseId: string) {
  const course = await managedCourse(actor, courseId);
  if (!course) return null;
  const assignments = await db.assignment.findMany({
    where: { courseId: course.id },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      instructions: true,
      dueDate: true,
      maxScore: true,
      allowLate: true,
      isPublished: true,
      submissions: { where: { status: { not: "DRAFT" } }, select: { status: true } },
      _count: { select: { submissions: true } },
      gradeItem: { select: { _count: { select: { entries: true } } } },
    },
  });
  return {
    course,
    assignments: assignments.map(({ submissions, gradeItem, _count, ...assignment }) => ({
      ...assignment,
      submissionCount: submissions.length,
      toGradeCount: submissions.filter((submission) => submission.status === "SUBMITTED").length,
      gradedCount: submissions.filter((submission) => submission.status === "GRADED").length,
      countsForGrade: Boolean(gradeItem),
      deleteBlocked: assignmentDeletionBlocked(_count.submissions, gradeItem?._count.entries ?? 0),
    })),
  };
}

// ---------------------------------------------------------------------------
// Docente: ver entregas y calificar
// ---------------------------------------------------------------------------

export type RosterState = "Sin entregar" | "Entregada" | "Tarde" | "Calificada";

/** Los enlaces se guardan en `Submission.fileUrls` como una lista de direcciones https. */
export function readLinks(fileUrls: unknown): string[] {
  if (!Array.isArray(fileUrls)) return [];
  return fileUrls.filter((value): value is string => typeof value === "string" && /^https:\/\//i.test(value));
}

/** La tarea con sus estudiantes inscritos y el estado de la entrega de cada uno. */
export async function assignmentRoster(actor: AssignmentManager, assignmentId: string) {
  const assignment = await managedAssignment(actor, assignmentId);
  if (!assignment) return null;
  const enrollments = await db.enrollment.findMany({
    where: {
      courseId: assignment.courseId,
      OR: [{ status: { in: ["ACTIVE", "COMPLETED"] } }, { submissions: { some: { assignmentId: assignment.id } } }],
    },
    orderBy: { student: { name: "asc" } },
    select: {
      id: true,
      student: { select: { id: true, name: true } },
      submissions: {
        where: { assignmentId: assignment.id, status: { not: "DRAFT" } },
        select: { id: true, content: true, fileUrls: true, score: true, feedback: true, status: true, submittedAt: true, gradedAt: true, _count: { select: { revisions: true } } },
      },
    },
  });
  const students = enrollments.map((enrollment) => {
    const submission = enrollment.submissions[0] ?? null;
    const late = Boolean(submission && assignment.dueDate && submission.submittedAt > assignment.dueDate);
    const state: RosterState = !submission ? "Sin entregar" : submission.status === "GRADED" ? "Calificada" : late ? "Tarde" : "Entregada";
    return {
      studentId: enrollment.student.id,
      name: enrollment.student.name,
      state,
      late,
      submission: submission
        ? {
            id: submission.id,
            content: submission.content ?? "",
            links: readLinks(submission.fileUrls),
            score: submission.score,
            feedback: submission.feedback ?? "",
            graded: submission.status === "GRADED",
            submittedAt: submission.submittedAt,
            gradedAt: submission.gradedAt,
            previousVersions: submission._count.revisions,
          }
        : null,
    };
  });
  const waiting = students
    .filter((student) => student.submission && !student.submission.graded)
    .sort((a, b) => a.submission!.submittedAt.getTime() - b.submission!.submittedAt.getTime())
    .map((student) => student.submission!.id);
  return {
    assignment: {
      id: assignment.id,
      title: assignment.title,
      instructions: assignment.instructions ?? "",
      dueDate: assignment.dueDate,
      maxScore: assignment.maxScore,
      allowLate: assignment.allowLate,
      isPublished: assignment.isPublished,
      countsForGrade: Boolean(assignment.gradeItem),
    },
    course: assignment.course,
    students,
    /** Entregas sin nota, de la más antigua a la más reciente. */
    waiting,
  };
}

class GradeRejected extends Error {}

/**
 * Pone o corrige la nota de una entrega. La nota va de 0 al puntaje máximo. Cambiar una nota
 * ya puesta exige motivo; queda en el historial del libro de calificaciones cuando la tarea
 * cuenta para la nota, y siempre en la bitácora.
 * Detecta reenvíos durante esta llamada; una página antigua requiere un futuro token de
 * versión en el formulario para comprobar qué contenido había visto el docente.
 */
export async function gradeSubmission(
  actor: AssignmentManager,
  input: { submissionId: string; score: string | number; feedback?: string; reason?: string },
  now = new Date(),
): Promise<AssignmentResult<{ assignmentId: string; corrected: boolean }>> {
  const where = managedCourseWhere(actor);
  if (!where || !input.submissionId) return fail("No encontramos esa entrega o no tienes acceso a ella.");
  // Only routing and a version witness are read before locking. Decisions use the
  // fresh row below; a resubmission during this request requires reviewing it first.
  const observed = await db.submission.findFirst({
    where: { id: input.submissionId, status: { not: "DRAFT" }, assignment: { course: where } },
    select: {
      assignmentId: true, studentId: true, submittedAt: true, _count: { select: { revisions: true } },
    },
  });
  if (!observed) return fail("No encontramos esa entrega o no tienes acceso a ella.");

  const raw = typeof input.score === "number" ? input.score : input.score.trim() === "" ? NaN : Number(input.score.trim().replace(",", "."));
  const score = raw;
  const feedback = input.feedback?.trim().slice(0, 5000) || null;
  const reason = input.reason?.trim().slice(0, 500) || null;

  try {
    const graded = await db.$transaction(async (tx) => {
      const locked = await lockAssignmentSubmission(tx, {
        assignmentId: observed.assignmentId, studentId: observed.studentId, institutionId: actor.institutionId,
      });
      if (!locked) return fail("No encontramos esa entrega o no tienes acceso a ella.");
      const submission = await tx.submission.findFirst({
        where: {
          id: input.submissionId, assignmentId: observed.assignmentId, studentId: observed.studentId,
          status: { not: "DRAFT" }, assignment: { course: where },
        },
        select: {
          id: true, score: true, status: true, enrollmentId: true, submittedAt: true, _count: { select: { revisions: true } },
          assignment: { select: { id: true, courseId: true, maxScore: true, gradeItem: { select: { id: true } } } },
        },
      });
      if (!submission) return fail("No encontramos esa entrega o no tienes acceso a ella.");
      if (submission.submittedAt.getTime() !== observed.submittedAt.getTime() ||
        submission._count.revisions !== observed._count.revisions) {
        return fail("La entrega cambió mientras intentabas calificarla. Recarga la página para revisar la nueva versión.");
      }
      const max = submission.assignment.maxScore;
      if (!Number.isFinite(raw) || raw < 0 || raw > max) return fail(`La nota debe ser un número entre 0 y ${max}.`);
      const corrected = submission.status === "GRADED" && submission.score !== null && submission.score !== score;
      if (corrected && !reason) return fail("Esta entrega ya tenía nota. Escribe el motivo del cambio.");
      await tx.submission.update({ where: { id: submission.id }, data: { score, feedback, status: "GRADED", gradedAt: now } });
      if (submission.assignment.gradeItem) {
        const written = await writeGradeEntry(
          tx,
          { institutionId: actor.institutionId, gradeItemId: submission.assignment.gradeItem.id, enrollmentId: submission.enrollmentId, score, feedback, actorId: actor.id, reason },
          now,
        );
        if (!written.ok) throw new GradeRejected(written.message);
      }
      if (corrected) {
        await tx.auditLog.create({
          data: {
            institutionId: actor.institutionId,
            userId: actor.id,
            action: "SUBMISSION_GRADE_CORRECTED",
            entity: "Submission",
            entityId: submission.id,
            changes: { previousScore: submission.score, newScore: score, reason },
          },
        });
      }
      return { ok: true as const, courseId: submission.assignment.courseId, assignmentId: submission.assignment.id, corrected };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    if (graded.ok) await notifyGradePosted(actor.institutionId, { submissionId: input.submissionId, corrected: graded.corrected });
    return graded;
  } catch (error) {
    if (error instanceof GradeRejected) return fail(error.message);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return fail("La entrega cambió mientras intentabas calificarla. Recarga la página antes de volver a calificar.");
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Estudiante
// ---------------------------------------------------------------------------

export type StudentGroup = "Pendientes" | "Entregadas" | "Calificadas";

/** Las tareas publicadas del curso con la entrega propia. Null si no está inscrito. */
export async function listAssignmentsForStudent(student: AssignmentStudent, courseId: string, now = new Date()) {
  const course = await studentCourse(student, courseId);
  if (!course) return null;
  const assignments = await db.assignment.findMany({
    where: { courseId: course.id, isPublished: true },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      dueDate: true,
      maxScore: true,
      allowLate: true,
      submissions: {
        where: { studentId: student.id },
        select: { status: true, score: true, fileUrls: true, submittedAt: true },
      },
      gradeItem: {
        select: {
          isPublished: true,
          entries: {
            where: { institutionId: student.institutionId, enrollmentId: course.enrollmentId },
            select: { score: true, feedback: true, isExcused: true },
          },
        },
      },
    },
  });
  return {
    course,
    assignments: assignments.map(({ submissions, gradeItem, ...assignment }) => {
      const own = submissions[0] ?? null;
      const grade = studentAssignmentGrade(own, gradeItem);
      const group: StudentGroup = grade.graded
        ? "Calificadas"
        : own && own.status !== "DRAFT" ? "Entregadas" : "Pendientes";
      return {
        ...assignment,
        group,
        score: grade.score,
        submittedAt: own && own.status !== "DRAFT" ? own.submittedAt : null,
        canSubmit: assignmentSubmissionAccess(assignment, own, course.isActive, now).allowed,
      };
    }),
  };
}

/** Una tarea publicada con la entrega propia (nunca la de otra persona). */
export async function assignmentForStudent(student: AssignmentStudent, assignmentId: string, now = new Date()) {
  if (!assignmentId) return null;
  const assignment = await db.assignment.findFirst({
    where: { id: assignmentId, isPublished: true, course: { institutionId: student.institutionId } },
    select: {
      id: true,
      courseId: true,
      title: true,
      instructions: true,
      dueDate: true,
      maxScore: true,
      allowLate: true,
      submissions: {
        where: { studentId: student.id },
        select: { content: true, fileUrls: true, status: true, score: true, feedback: true, submittedAt: true, gradedAt: true, _count: { select: { revisions: true } } },
      },
      gradeItem: {
        select: {
          isPublished: true,
          entries: {
            where: { institutionId: student.institutionId, enrollment: { studentId: student.id } },
            select: { score: true, feedback: true, isExcused: true },
          },
        },
      },
    },
  });
  if (!assignment) return null;
  const course = await studentCourse(student, assignment.courseId);
  if (!course) return null;
  const { submissions, gradeItem, ...rest } = assignment;
  const own = submissions[0] && submissions[0].status !== "DRAFT" ? submissions[0] : null;
  const grade = studentAssignmentGrade(own, gradeItem);
  const submit = assignmentSubmissionAccess(assignment, own, course.isActive, now);
  return {
    course,
    assignment: { ...rest, instructions: rest.instructions ?? "" },
    submission: own
      ? {
          content: own.content ?? "",
          link: readLinks(own.fileUrls)[0] ?? "",
          submittedAt: own.submittedAt,
          late: Boolean(assignment.dueDate && own.submittedAt > assignment.dueDate),
          ...grade,
          previousVersions: own._count.revisions,
        }
      : null,
    canSubmit: submit.allowed,
    cannotSubmitReason: submit.why,
  };
}

function cleanLink(value: string): { ok: true; link: string | null } | { ok: false } {
  const text = value.trim();
  if (!text) return { ok: true, link: null };
  if (text.length > 2000 || /\s/.test(text)) return { ok: false };
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || !url.hostname.includes(".")) return { ok: false };
    return { ok: true, link: url.toString() };
  } catch {
    return { ok: false };
  }
}

/**
 * Entrega o vuelve a entregar una tarea con texto, un enlace o ambos. Se puede reenviar
 * mientras no esté calificada y no haya vencido (o la tarea acepte entregas tarde). Cada
 * reenvío permitido conserva la versión anterior; los enlaces previos bloquean el reenvío.
 */
export async function submitAssignment(
  student: AssignmentStudent,
  input: { assignmentId: string; content?: string; link?: string },
  now = new Date(),
): Promise<AssignmentResult<{ assignmentId: string; resubmitted: boolean; late: boolean }>> {
  const unavailable = fail("Esta tarea no está disponible para ti.");
  if (!input.assignmentId) return unavailable;
  const assignment = await db.assignment.findFirst({
    where: { id: input.assignmentId, isPublished: true, course: { institutionId: student.institutionId, isPublished: true } },
    select: { id: true, courseId: true, dueDate: true, allowLate: true },
  });
  if (!assignment) return unavailable;
  const enrollment = await db.enrollment.findFirst({
    where: { studentId: student.id, courseId: assignment.courseId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!enrollment) return unavailable;

  const content = input.content?.trim() ?? "";
  const link = cleanLink(input.link ?? "");
  if (!link.ok) return fail("El enlace no es válido. Debe empezar con https:// y no tener espacios.");
  if (!content && !link.link) return fail("Escribe tu respuesta o pega un enlace antes de entregar.");
  if (content.length > 30000) return fail("El texto es demasiado largo. Acórtalo o comparte un enlace al documento.");

  try {
    const submitted = await db.$transaction(async (tx) => {
      const key = { assignmentId: assignment.id, studentId: student.id };
      if (!await lockAssignmentSubmission(tx, { ...key, institutionId: student.institutionId })) return unavailable;
      const currentAssignment = await tx.assignment.findFirst({
        where: { id: assignment.id, isPublished: true, course: { institutionId: student.institutionId, isPublished: true } },
        select: { id: true, courseId: true, dueDate: true, allowLate: true },
      });
      if (!currentAssignment) return unavailable;
      const currentEnrollment = await tx.enrollment.findFirst({
        where: { studentId: student.id, courseId: currentAssignment.courseId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!currentEnrollment) return unavailable;
      const current = await tx.submission.findUnique({
        where: { assignmentId_studentId: key }, select: { status: true, fileUrls: true },
      });
      const allowed = assignmentSubmissionAccess(currentAssignment, current, true, now);
      if (!allowed.allowed) return fail(allowed.why);
      const resubmitted = Boolean(current && current.status !== "DRAFT");
      if (resubmitted) await archiveSubmissionVersion(tx, { ...key, institutionId: student.institutionId });
      const fields = {
        content: content || null, fileUrls: link.link ? [link.link] : Prisma.JsonNull,
        status: "SUBMITTED" as const, submittedAt: now,
      };
      await tx.submission.upsert({
        where: { assignmentId_studentId: key },
        create: { institutionId: student.institutionId, ...key, enrollmentId: currentEnrollment.id, ...fields },
        update: { ...fields, score: null, feedback: null, gradedAt: null },
      });
      return {
        ok: true as const, courseId: currentAssignment.courseId, assignmentId: currentAssignment.id,
        resubmitted, late: Boolean(currentAssignment.dueDate && currentAssignment.dueDate < now),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    if (submitted.ok) await notifySubmissionReceived(student.institutionId, { assignmentId: submitted.assignmentId, studentId: student.id, resubmitted: submitted.resubmitted });
    return submitted;
  } catch (error) {
    if (error instanceof SubmissionRevisionUnavailable) return fail(error.message);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return fail("Tu entrega cambió mientras intentabas enviarla. Recarga la página antes de volver a entregar.");
    }
    throw error;
  }
}
