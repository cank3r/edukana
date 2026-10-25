import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import type { EdukanaRole } from "@/types/next-auth";

export type AcademicActor = { id: string; institutionId: string; role: EdukanaRole };
export type AcademicFailure = { ok: false; message: string };
export type AcademicResult<T = object> = ({ ok: true } & T) | AcademicFailure;

export const fail = (message: string): AcademicFailure => ({ ok: false, message });
export const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
/** Ids recibidos de un formulario: sin vacíos ni repetidos, con un tope razonable. */
export const cleanIds = (ids: readonly string[]) => [...new Set(ids.map((id) => id.trim()).filter(Boolean))].slice(0, 500);

const PROGRAM_NOT_FOUND = "No encontramos ese programa.";

export const programSchema = z.object({
  name: z.string().trim().min(3, "Escribe el nombre del programa (al menos 3 letras).").max(120, "El nombre es demasiado largo."),
  description: z.string().trim().max(1000, "La descripción es demasiado larga.").optional(),
  isPublished: z.boolean(),
});

export type ProgramInput = { name: string; description?: string; isPublished: boolean };

/** Programas de la institución con cuántos cursos y grupos tiene cada uno. */
export function listPrograms(institutionId: string) {
  return db.program.findMany({
    where: { institutionId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, description: true, isPublished: true, _count: { select: { courses: true, groups: true } } },
  });
}

/** Un programa con sus cursos en orden. Devuelve null si no es de la institución. */
export function getProgram(institutionId: string, programId: string) {
  return db.program.findFirst({
    where: { id: programId, institutionId },
    select: {
      id: true,
      name: true,
      description: true,
      isPublished: true,
      _count: { select: { groups: true } },
      courses: {
        orderBy: [{ order: "asc" }, { courseId: "asc" }],
        select: { courseId: true, order: true, course: { select: { name: true, code: true, archivedAt: true } } },
      },
    },
  });
}

export async function createProgram(actor: AcademicActor, input: ProgramInput): Promise<AcademicResult<{ programId: string }>> {
  const parsed = programSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los datos.");
  const data = parsed.data;
  try {
    const programId = await db.$transaction(async (tx) => {
      const program = await tx.program.create({
        data: { institutionId: actor.institutionId, name: data.name, description: data.description || null, isPublished: data.isPublished },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: { institutionId: actor.institutionId, userId: actor.id, action: "PROGRAM_CREATED", entity: "Program", entityId: program.id, changes: { name: data.name } },
      });
      return program.id;
    });
    return { ok: true, programId };
  } catch (error) {
    if (isUniqueViolation(error)) return fail("Ya existe un programa con ese nombre. Usa otro nombre.");
    throw error;
  }
}

export async function updateProgram(actor: AcademicActor, programId: string, input: ProgramInput): Promise<AcademicResult> {
  const parsed = programSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los datos.");
  const data = parsed.data;
  try {
    return await db.$transaction(async (tx) => {
      const changed = await tx.program.updateMany({
        where: { id: programId, institutionId: actor.institutionId },
        data: { name: data.name, description: data.description || null, isPublished: data.isPublished },
      });
      if (changed.count === 0) return fail(PROGRAM_NOT_FOUND);
      await tx.auditLog.create({
        data: { institutionId: actor.institutionId, userId: actor.id, action: "PROGRAM_UPDATED", entity: "Program", entityId: programId, changes: { name: data.name, isPublished: data.isPublished } },
      });
      return { ok: true } as const;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail("Ya existe un programa con ese nombre. Usa otro nombre.");
    throw error;
  }
}

/**
 * Borra el programa. Los grupos que lo usaban se conservan y quedan sin programa;
 * los cursos y las inscripciones no se tocan.
 */
export async function deleteProgram(actor: AcademicActor, programId: string): Promise<AcademicResult<{ groupsDetached: number }>> {
  return db.$transaction(async (tx) => {
    const program = await tx.program.findFirst({
      where: { id: programId, institutionId: actor.institutionId },
      select: { id: true, name: true, _count: { select: { groups: true, courses: true } } },
    });
    if (!program) return fail(PROGRAM_NOT_FOUND);
    await tx.program.delete({ where: { id: program.id } });
    await tx.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        userId: actor.id,
        action: "PROGRAM_DELETED",
        entity: "Program",
        entityId: program.id,
        changes: { name: program.name, groupsDetached: program._count.groups, coursesListed: program._count.courses },
      },
    });
    return { ok: true, groupsDetached: program._count.groups } as const;
  });
}

/** Agrega cursos de la institución al final del programa. Los que ya estaban no se repiten. */
export async function addProgramCourses(actor: AcademicActor, programId: string, courseIds: readonly string[]): Promise<AcademicResult<{ added: number }>> {
  const ids = cleanIds(courseIds);
  if (ids.length === 0) return fail("Elige al menos un curso.");
  return db.$transaction(async (tx) => {
    const program = await tx.program.findFirst({
      where: { id: programId, institutionId: actor.institutionId },
      select: { id: true, courses: { select: { courseId: true, order: true } } },
    });
    if (!program) return fail(PROGRAM_NOT_FOUND);
    const valid = await tx.course.count({ where: { id: { in: ids }, institutionId: actor.institutionId, archivedAt: null } });
    if (valid !== ids.length) return fail("Alguno de los cursos elegidos ya no está disponible. Actualiza la página y vuelve a elegir.");
    const existing = new Set(program.courses.map((row) => row.courseId));
    const fresh = ids.filter((id) => !existing.has(id));
    const start = program.courses.reduce((max, row) => Math.max(max, row.order + 1), 0);
    if (fresh.length) {
      await tx.programCourse.createMany({
        data: fresh.map((courseId, index) => ({ institutionId: actor.institutionId, programId: program.id, courseId, order: start + index })),
        skipDuplicates: true,
      });
      await tx.auditLog.create({
        data: { institutionId: actor.institutionId, userId: actor.id, action: "PROGRAM_COURSES_ADDED", entity: "Program", entityId: program.id, changes: { courseIds: fresh } },
      });
    }
    return { ok: true, added: fresh.length } as const;
  });
}

export async function removeProgramCourse(actor: AcademicActor, programId: string, courseId: string): Promise<AcademicResult> {
  return db.$transaction(async (tx) => {
    const removed = await tx.programCourse.deleteMany({ where: { programId, courseId, institutionId: actor.institutionId, program: { institutionId: actor.institutionId } } });
    if (removed.count === 0) return fail("Ese curso ya no estaba en el programa.");
    await tx.auditLog.create({
      data: { institutionId: actor.institutionId, userId: actor.id, action: "PROGRAM_COURSE_REMOVED", entity: "Program", entityId: programId, changes: { courseId } },
    });
    return { ok: true } as const;
  });
}

/** Sube o baja un curso una posición y deja el orden numerado 0, 1, 2… sin huecos. */
export async function moveProgramCourse(actor: AcademicActor, programId: string, courseId: string, direction: "up" | "down"): Promise<AcademicResult> {
  return db.$transaction(
    async (tx) => {
      // Bloquea la fila del programa: dos reordenamientos simultáneos se hacen uno después del otro.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "programs" WHERE "id" = ${programId} AND "institutionId" = ${actor.institutionId} FOR UPDATE`;
      if (!locked.length) return fail(PROGRAM_NOT_FOUND);
      const program = await tx.program.findUniqueOrThrow({
        where: { id: programId },
        select: { id: true, courses: { orderBy: [{ order: "asc" }, { courseId: "asc" }], select: { courseId: true, order: true } } },
      });
      const rows = program.courses;
      const from = rows.findIndex((row) => row.courseId === courseId);
      if (from === -1) return fail("Ese curso ya no está en el programa.");
      const to = direction === "up" ? from - 1 : from + 1;
      if (to < 0 || to >= rows.length) return { ok: true } as const;
      [rows[from], rows[to]] = [rows[to], rows[from]];
      for (const [index, row] of rows.entries()) {
        if (row.order !== index) {
          await tx.programCourse.update({ where: { programId_courseId: { programId: program.id, courseId: row.courseId } }, data: { order: index } });
        }
      }
      await tx.auditLog.create({
        data: { institutionId: actor.institutionId, userId: actor.id, action: "PROGRAM_COURSES_REORDERED", entity: "Program", entityId: program.id, changes: { courseId, direction } },
      });
      return { ok: true } as const;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}
