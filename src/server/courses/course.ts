import type { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Capability } from "@/lib/capabilities";
import { courseWhereForScope, type CourseScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import type { EdukanaRole } from "@/types/next-auth";

export type CourseOperation = "create" | "edit" | "publish" | "archive";
export type CourseActor = {
  id: string;
  institutionId: string;
  role: EdukanaRole;
  capabilities: ReadonlySet<Capability>;
};
export type CourseResult = { ok: true; courseId: string } | { ok: false; message: string };
export type CourseInput = {
  name: string;
  description?: string;
  teacherId: string;
  periodId: string;
  code?: string;
  maxStudents?: string | number;
};

const NO_ACCESS = "No tienes permiso para realizar esta acción en el curso.";
const NOT_FOUND = "No encontramos ese curso.";
const READ_ONLY = "Este curso está archivado y solo se puede consultar. Restáuralo para volver a editarlo.";

const operationCapability: Record<CourseOperation, Capability> = {
  create: "course.create",
  edit: "course.edit",
  publish: "course.publish",
  archive: "course.archive",
};

export const courseSchema = z.object({
  name: z.string().trim().min(3, "Escribe el nombre del curso (al menos 3 letras).").max(160, "El nombre es demasiado largo."),
  description: z.string().trim().max(2000, "La descripción es demasiado larga.").optional(),
  teacherId: z.string().min(1, "Elige el docente del curso."),
  periodId: z.string().min(1, "Elige el período del curso."),
  code: z.string().trim().max(30, "El código es demasiado largo.").regex(/^[A-Za-z0-9._-]*$/, "El código solo puede llevar letras, números, puntos y guiones.").optional(),
  maxStudents: z.coerce.number().int("El cupo debe ser un número entero.").min(1, "El cupo debe ser de al menos 1.").max(10000, "El cupo es demasiado alto.").optional(),
});

export function canOperateCourse(actor: CourseActor, scope: CourseScope, operation: CourseOperation): boolean {
  if (!actor.institutionId || !actor.capabilities.has(operationCapability[operation])) return false;
  if (operation === "create" || operation === "publish" || operation === "archive") {
    return scope.kind === "all" && ["SUPER_ADMIN", "ADMIN", "COORDINATOR"].includes(actor.role);
  }
  return scope.kind === "all" || (scope.kind === "teacher" && scope.teacherId === actor.id);
}

export function courseListWhere(
  institutionId: string,
  scope: CourseScope,
  options: { archived?: boolean } = {},
): Prisma.CourseWhereInput | null {
  const base = courseWhereForScope(institutionId, scope);
  if (!base) return null;
  if (scope.kind === "student") return { ...base, isPublished: true, archivedAt: null };
  return { ...base, archivedAt: options.archived ? { not: null } : null };
}

export function courseStatusLabel(course: { isPublished: boolean; archivedAt: Date | null }) {
  if (course.archivedAt) return "Archivado" as const;
  return course.isPublished ? ("Publicado" as const) : ("Borrador" as const);
}

type Checked = {
  name: string;
  description: string | null;
  teacherId: string;
  periodId: string;
  code: string | null;
  maxStudents: number | null;
};

async function checkInput(actor: CourseActor, scope: CourseScope, input: CourseInput, currentId?: string): Promise<Checked | CourseResult> {
  const blankCapacity = input.maxStudents === undefined || String(input.maxStudents).trim() === "";
  const parsed = courseSchema.safeParse({ ...input, maxStudents: blankCapacity ? undefined : input.maxStudents });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos del curso." };

  const teacherId = scope.kind === "teacher" ? scope.teacherId : parsed.data.teacherId;
  const [teacher, period] = await Promise.all([
    db.user.findFirst({
      where: { id: teacherId, institutionId: actor.institutionId, role: "TEACHER", status: "ACTIVE" },
      select: { id: true },
    }),
    db.academicPeriod.findFirst({
      where: { id: parsed.data.periodId, institutionId: actor.institutionId },
      select: { id: true },
    }),
  ]);
  if (!teacher) return { ok: false, message: "Ese docente no está disponible. Elige un docente activo de tu institución." };
  if (!period) return { ok: false, message: "Ese período no está disponible. Elige un período de tu institución." };

  const code = parsed.data.code ? parsed.data.code.toUpperCase() : null;
  if (code) {
    const duplicate = await db.course.findFirst({
      where: { institutionId: actor.institutionId, code, ...(currentId ? { id: { not: currentId } } : {}) },
      select: { id: true },
    });
    if (duplicate) return { ok: false, message: "Ya hay otro curso con ese código. Usa uno distinto o déjalo vacío." };
  }

  return {
    name: parsed.data.name,
    description: parsed.data.description || null,
    teacherId,
    periodId: period.id,
    code,
    maxStudents: parsed.data.maxStudents ?? null,
  };
}

async function manageable(actor: CourseActor, scope: CourseScope, courseId: string) {
  const where = courseWhereForScope(actor.institutionId, scope);
  if (!where || scope.kind === "student" || scope.kind === "none") return null;
  return db.course.findFirst({
    where: { id: courseId, ...where },
    select: { id: true, name: true, teacherId: true, isPublished: true, archivedAt: true },
  });
}

export async function createCourse(actor: CourseActor, scope: CourseScope, input: CourseInput): Promise<CourseResult> {
  if (!canOperateCourse(actor, scope, "create")) return { ok: false, message: NO_ACCESS };
  const checked = await checkInput(actor, scope, input);
  if ("ok" in checked) return checked;
  const course = await db.$transaction(async (tx) => {
    const created = await tx.course.create({
      data: { ...checked, institutionId: actor.institutionId, isPublished: false },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        userId: actor.id,
        action: "COURSE_CREATED",
        entity: "Course",
        entityId: created.id,
        changes: { periodId: checked.periodId, teacherId: checked.teacherId },
      },
    });
    return created;
  });
  return { ok: true, courseId: course.id };
}

export async function updateCourse(
  actor: CourseActor,
  scope: CourseScope,
  courseId: string,
  input: CourseInput,
): Promise<CourseResult> {
  if (!canOperateCourse(actor, scope, "edit")) return { ok: false, message: NO_ACCESS };
  const course = await manageable(actor, scope, courseId);
  if (!course) return { ok: false, message: NOT_FOUND };
  if (course.archivedAt) return { ok: false, message: READ_ONLY };
  const checked = await checkInput(actor, scope, input, course.id);
  if ("ok" in checked) return checked;

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.course.updateMany({
      where: { id: course.id, institutionId: actor.institutionId, archivedAt: null },
      data: checked,
    });
    if (result.count !== 1) return false;
    await tx.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        userId: actor.id,
        action: "COURSE_UPDATED",
        entity: "Course",
        entityId: course.id,
        changes: { teacherFrom: course.teacherId, teacherTo: checked.teacherId },
      },
    });
    return true;
  });
  return updated ? { ok: true, courseId: course.id } : { ok: false, message: READ_ONLY };
}

async function changeState(
  actor: CourseActor,
  scope: CourseScope,
  courseId: string,
  operation: "publish" | "archive",
  action: string,
  data: Prisma.CourseUpdateManyMutationInput,
  requireActive: boolean,
): Promise<CourseResult> {
  if (!canOperateCourse(actor, scope, operation)) return { ok: false, message: NO_ACCESS };
  const course = await manageable(actor, scope, courseId);
  if (!course) return { ok: false, message: NOT_FOUND };
  if (requireActive && course.archivedAt) return { ok: false, message: READ_ONLY };

  const changed = await db.$transaction(async (tx) => {
    const result = await tx.course.updateMany({
      where: { id: course.id, institutionId: actor.institutionId, ...(requireActive ? { archivedAt: null } : {}) },
      data,
    });
    if (result.count !== 1) return false;
    await tx.auditLog.create({
      data: { institutionId: actor.institutionId, userId: actor.id, action, entity: "Course", entityId: course.id },
    });
    return true;
  });
  return changed ? { ok: true, courseId: course.id } : { ok: false, message: READ_ONLY };
}

export function setCoursePublished(actor: CourseActor, scope: CourseScope, courseId: string, published: boolean) {
  return changeState(actor, scope, courseId, "publish", published ? "COURSE_PUBLISHED" : "COURSE_UNPUBLISHED", { isPublished: published }, true);
}

export function archiveCourse(actor: CourseActor, scope: CourseScope, courseId: string, now = new Date()) {
  return changeState(actor, scope, courseId, "archive", "COURSE_ARCHIVED", { archivedAt: now, isPublished: false }, true);
}

export function restoreCourse(actor: CourseActor, scope: CourseScope, courseId: string) {
  return changeState(actor, scope, courseId, "archive", "COURSE_RESTORED", { archivedAt: null, isPublished: false }, false);
}
