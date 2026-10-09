import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { courseWhereForScope, type CourseScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import { isIndependentInstitution } from "@/server/platform/independent-kind";
import type { EdukanaRole } from "@/types/next-auth";

type Actor = { id: string; institutionId: string; role: EdukanaRole };
export type CourseResult = { ok: true; courseId: string } | { ok: false; message: string };

const NO_ACCESS = "No tienes permiso para gestionar este curso.";
const NOT_FOUND = "No encontramos ese curso.";

export const courseSchema = z.object({
  name: z.string().trim().min(3, "Escribe el nombre del curso (al menos 3 letras).").max(160, "El nombre es demasiado largo."),
  description: z.string().trim().max(2000, "La descripción es demasiado larga.").optional(),
  teacherId: z.string().min(1, "Elige el docente del curso."),
  periodId: z.string().min(1, "Elige el período del curso."),
  code: z
    .string()
    .trim()
    .max(30, "El código es demasiado largo.")
    .regex(/^[A-Za-z0-9._-]*$/, "El código solo puede llevar letras, números, puntos y guiones.")
    .optional(),
  maxStudents: z.coerce.number("El cupo debe ser un número.").int("El cupo debe ser un número entero.").min(1, "El cupo debe ser de al menos 1.").max(10000, "El cupo es demasiado alto.").optional(),
});

export type CourseInput = { name: string; description?: string; teacherId: string; periodId: string; code?: string; maxStudents?: string | number };

/** Cursos que alguien ve en su lista. El estudiante solo ve lo publicado y no archivado donde está inscrito. */
export function courseListWhere(institutionId: string, scope: CourseScope, options: { archived?: boolean } = {}): Prisma.CourseWhereInput | null {
  const base = courseWhereForScope(institutionId, scope);
  if (!base) return null;
  if (scope.kind === "student") return { ...base, isPublished: true, archivedAt: null };
  return { ...base, archivedAt: options.archived ? { not: null } : null };
}

/** Estado en palabras sencillas para tarjetas y encabezados. */
export function courseStatusLabel(course: { isPublished: boolean; archivedAt: Date | null }): "Archivado" | "Publicado" | "Borrador" {
  if (course.archivedAt) return "Archivado";
  return course.isPublished ? "Publicado" : "Borrador";
}

type Checked = { ok: true; data: { name: string; description: string | null; teacherId: string; periodId: string; code: string | null; maxStudents: number | null } } | { ok: false; message: string };

/** Valida los campos y que docente y período sean de la institución de quien actúa. */
async function checkInput(actor: Actor, scope: CourseScope, input: CourseInput, current?: { id: string; teacherId: string }): Promise<Checked> {
  const blankCapacity = input.maxStudents === undefined || String(input.maxStudents).trim() === "";
  const parsed = courseSchema.safeParse({ ...input, maxStudents: blankCapacity ? undefined : input.maxStudents });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos del curso." };
  const data = parsed.data;

  // Un docente solo crea y mantiene cursos propios; no puede pasarlos a otra persona.
  const teacherId = scope.kind === "teacher" ? scope.teacherId : data.teacherId;
  if (teacherId !== current?.teacherId) {
    // En el espacio de un docente independiente, quien lo administra es también quien enseña.
    const ownIndependentCourse = teacherId === actor.id && (actor.role === "ADMIN" || actor.role === "SUPER_ADMIN")
      && (await isIndependentInstitution(actor.institutionId));
    const teacher = await db.user.findFirst({
      where: { id: teacherId, institutionId: actor.institutionId, status: "ACTIVE", ...(ownIndependentCourse ? {} : { role: "TEACHER" as const }) },
      select: { id: true },
    });
    if (!teacher) return { ok: false, message: "Ese docente no está disponible. Elige un docente activo de tu institución." };
  }
  const period = await db.academicPeriod.findFirst({ where: { id: data.periodId, institutionId: actor.institutionId }, select: { id: true } });
  if (!period) return { ok: false, message: "Ese período no está disponible. Elige un período de tu institución." };

  const code = data.code ? data.code.toUpperCase() : null;
  if (code) {
    const taken = await db.course.findFirst({
      where: { institutionId: actor.institutionId, code, ...(current ? { id: { not: current.id } } : {}) },
      select: { id: true },
    });
    if (taken) return { ok: false, message: "Ya hay otro curso con ese código. Usa uno distinto o déjalo vacío." };
  }
  const maxStudents = data.maxStudents ?? null;
  return { ok: true, data: { name: data.name, description: data.description || null, teacherId, periodId: period.id, code, maxStudents } };
}

async function manageable(actor: Actor, scope: CourseScope, courseId: string) {
  const where = courseWhereForScope(actor.institutionId, scope);
  if (!where || scope.kind === "student") return null;
  return db.course.findFirst({
    where: { id: courseId, ...where },
    select: { id: true, name: true, teacherId: true, isPublished: true, archivedAt: true },
  });
}

function canWrite(scope: CourseScope) {
  return scope.kind === "all" || scope.kind === "teacher";
}

/** Crea un curso. Nace como borrador: nadie inscrito lo ve hasta publicarlo. */
export async function createCourse(actor: Actor, scope: CourseScope, input: CourseInput): Promise<CourseResult> {
  if (!canWrite(scope)) return { ok: false, message: "No tienes permiso para crear cursos." };
  const checked = await checkInput(actor, scope, input);
  if (!checked.ok) return checked;
  const course = await db.$transaction(async (tx) => {
    const created = await tx.course.create({
      data: { ...checked.data, institutionId: actor.institutionId, isPublished: false },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        userId: actor.id,
        action: "COURSE_CREATED",
        entity: "Course",
        entityId: created.id,
        changes: { periodId: checked.data.periodId, teacherId: checked.data.teacherId },
      },
    });
    return created;
  });
  return { ok: true, courseId: course.id };
}

/** Corrige los datos de un curso que quien actúa puede gestionar. */
export async function updateCourse(actor: Actor, scope: CourseScope, courseId: string, input: CourseInput): Promise<CourseResult> {
  if (!canWrite(scope)) return { ok: false, message: NO_ACCESS };
  const course = await manageable(actor, scope, courseId);
  if (!course) return { ok: false, message: NOT_FOUND };
  const checked = await checkInput(actor, scope, input, course);
  if (!checked.ok) return checked;
  await db.$transaction(async (tx) => {
    await tx.course.update({ where: { id: course.id }, data: checked.data });
    await tx.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        userId: actor.id,
        action: "COURSE_UPDATED",
        entity: "Course",
        entityId: course.id,
        changes: { nameChanged: course.name !== checked.data.name, teacherFrom: course.teacherId, teacherTo: checked.data.teacherId },
      },
    });
  });
  return { ok: true, courseId: course.id };
}

async function changeState(
  actor: Actor,
  scope: CourseScope,
  courseId: string,
  action: string,
  data: Prisma.CourseUpdateInput,
): Promise<CourseResult> {
  if (!canWrite(scope)) return { ok: false, message: NO_ACCESS };
  const course = await manageable(actor, scope, courseId);
  if (!course) return { ok: false, message: NOT_FOUND };
  await db.$transaction(async (tx) => {
    await tx.course.update({ where: { id: course.id }, data });
    await tx.auditLog.create({
      data: { institutionId: actor.institutionId, userId: actor.id, action, entity: "Course", entityId: course.id },
    });
  });
  return { ok: true, courseId: course.id };
}

/** Publica el curso (lo ven sus estudiantes inscritos) o lo devuelve a borrador. */
export function setCoursePublished(actor: Actor, scope: CourseScope, courseId: string, published: boolean) {
  return changeState(actor, scope, courseId, published ? "COURSE_PUBLISHED" : "COURSE_UNPUBLISHED", { isPublished: published });
}

/** Archiva: sale de las listas de todos, no se borra nada y se puede restaurar. */
export function archiveCourse(actor: Actor, scope: CourseScope, courseId: string, now = new Date()) {
  return changeState(actor, scope, courseId, "COURSE_ARCHIVED", { archivedAt: now });
}

export function restoreCourse(actor: Actor, scope: CourseScope, courseId: string) {
  return changeState(actor, scope, courseId, "COURSE_RESTORED", { archivedAt: null });
}

/** Cuenta lo que impediría borrar el curso para siempre. */
export async function courseUsage(institutionId: string, courseId: string) {
  const [enrollments, submissions, attempts] = await Promise.all([
    db.enrollment.count({ where: { courseId, course: { institutionId } } }),
    db.submission.count({ where: { assignment: { courseId, course: { institutionId } } } }),
    db.examAttempt.count({ where: { exam: { courseId, institutionId } } }),
  ]);
  return { enrollments, submissions, attempts, empty: enrollments + submissions + attempts === 0 };
}

/** Borra el curso para siempre solo si nadie se inscribió, entregó ni presentó nada. */
export async function deleteCourseIfEmpty(actor: Actor, scope: CourseScope, courseId: string): Promise<CourseResult> {
  if (!canWrite(scope)) return { ok: false, message: NO_ACCESS };
  const course = await manageable(actor, scope, courseId);
  if (!course) return { ok: false, message: NOT_FOUND };
  const usage = await courseUsage(actor.institutionId, course.id);
  if (!usage.empty) {
    return {
      ok: false,
      message: "Este curso ya tiene estudiantes inscritos, entregas o exámenes presentados, así que no se puede borrar. Archívalo: sale de las listas y no se pierde nada.",
    };
  }
  await db.$transaction(async (tx) => {
    await tx.course.delete({ where: { id: course.id } });
    await tx.auditLog.create({
      data: { institutionId: actor.institutionId, userId: actor.id, action: "COURSE_DELETED", entity: "Course", entityId: course.id, changes: { name: course.name } },
    });
  });
  return { ok: true, courseId: course.id };
}
