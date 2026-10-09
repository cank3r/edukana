import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { notifyEnrolledWithinTransaction } from "@/server/notifications/events";
import { cleanIds, fail, isUniqueViolation, type AcademicActor, type AcademicResult } from "./programs";

const GROUP_NOT_FOUND = "No encontramos ese grupo.";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// El bloqueo de fila (FOR UPDATE) ordena las operaciones simultáneas; READ COMMITTED basta y evita reintentos.
const rowLocked = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted } as const;

/** Convierte "2027-01-15" en una fecha sin hora (UTC). Devuelve null si no es una fecha real. */
function parseDay(value: string): Date | null {
  if (!DATE_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export const groupSchema = z
  .object({
    name: z.string().trim().min(3, "Escribe el nombre del grupo (al menos 3 letras).").max(120, "El nombre es demasiado largo."),
    description: z.string().trim().max(1000, "La descripción es demasiado larga.").optional(),
    programId: z.string().trim().max(60).optional(),
    startsOn: z.string().trim().refine((value) => parseDay(value) !== null, "Elige la fecha de inicio."),
    endsOn: z.string().trim().refine((value) => value === "" || parseDay(value) !== null, "La fecha de fin no es válida.").optional(),
    capacity: z
      .string()
      .trim()
      .refine((value) => value === "" || (/^\d{1,5}$/.test(value) && Number(value) >= 1), "El cupo debe ser un número mayor que cero. Déjalo vacío si no hay límite.")
      .optional(),
  })
  .refine((data) => !data.endsOn || data.endsOn >= data.startsOn, { message: "La fecha de fin no puede ser anterior a la de inicio." });

export type GroupInput = { name: string; description?: string; programId?: string; startsOn: string; endsOn?: string; capacity?: string };

type GroupData = { name: string; description: string | null; programId: string | null; startsOn: Date; endsOn: Date | null; capacity: number | null };

function readGroup(input: GroupInput): AcademicResult<{ data: GroupData }> {
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los datos.");
  const value = parsed.data;
  return {
    ok: true,
    data: {
      name: value.name,
      description: value.description || null,
      programId: value.programId || null,
      startsOn: parseDay(value.startsOn)!,
      endsOn: value.endsOn ? parseDay(value.endsOn) : null,
      capacity: value.capacity ? Number(value.capacity) : null,
    },
  };
}

/** Grupos de la institución con su programa y cuántos estudiantes y cursos tienen. */
export function listGroups(institutionId: string) {
  return db.studentGroup.findMany({
    where: { institutionId },
    orderBy: [{ startsOn: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      startsOn: true,
      endsOn: true,
      capacity: true,
      program: { select: { name: true } },
      _count: { select: { members: true, courses: true } },
    },
  });
}

/** Un grupo con sus estudiantes y cursos. Devuelve null si no es de la institución. */
export function getGroup(institutionId: string, groupId: string) {
  return db.studentGroup.findFirst({
    where: { id: groupId, institutionId },
    select: {
      id: true,
      name: true,
      description: true,
      startsOn: true,
      endsOn: true,
      capacity: true,
      programId: true,
      program: { select: { id: true, name: true, _count: { select: { courses: true } } } },
      members: { orderBy: { user: { name: "asc" } }, select: { userId: true, user: { select: { name: true, email: true, status: true } } } },
      courses: { orderBy: { course: { name: "asc" } }, select: { courseId: true, course: { select: { name: true, code: true, archivedAt: true } } } },
    },
  });
}

/** Estudiantes activos de la institución que todavía no están en el grupo, para el buscador. */
export function findStudentsToAdd(institutionId: string, groupId: string, search: string, take = 50) {
  const q = search.trim().slice(0, 100);
  return db.user.findMany({
    where: {
      institutionId,
      role: "STUDENT",
      status: "ACTIVE",
      groupMemberships: { none: { groupId } },
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }] } : {}),
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take,
    select: { id: true, name: true, email: true },
  });
}

async function programBelongs(tx: Prisma.TransactionClient, institutionId: string, programId: string | null) {
  if (!programId) return true;
  return (await tx.program.count({ where: { id: programId, institutionId } })) === 1;
}

export async function createGroup(actor: AcademicActor, input: GroupInput): Promise<AcademicResult<{ groupId: string }>> {
  const read = readGroup(input);
  if (!read.ok) return read;
  const data = read.data;
  try {
    return await db.$transaction(async (tx) => {
      if (!(await programBelongs(tx, actor.institutionId, data.programId))) return fail("Ese programa ya no existe. Elige otro o deja el grupo sin programa.");
      const group = await tx.studentGroup.create({ data: { ...data, institutionId: actor.institutionId }, select: { id: true } });
      await tx.auditLog.create({
        data: { institutionId: actor.institutionId, userId: actor.id, action: "GROUP_CREATED", entity: "StudentGroup", entityId: group.id, changes: { name: data.name, programId: data.programId } },
      });
      return { ok: true, groupId: group.id } as const;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail("Ya existe un grupo con ese nombre. Usa otro nombre.");
    throw error;
  }
}

export async function updateGroup(actor: AcademicActor, groupId: string, input: GroupInput): Promise<AcademicResult> {
  const read = readGroup(input);
  if (!read.ok) return read;
  const data = read.data;
  try {
    return await db.$transaction(async (tx) => {
      // Bloquea el grupo: el cupo no puede bajar mientras otra persona agrega estudiantes.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "student_groups" WHERE "id" = ${groupId} AND "institutionId" = ${actor.institutionId} FOR UPDATE`;
      if (!locked.length) return fail(GROUP_NOT_FOUND);
      if (!(await programBelongs(tx, actor.institutionId, data.programId))) return fail("Ese programa ya no existe. Elige otro o deja el grupo sin programa.");
      const members = await tx.studentGroupMember.count({ where: { groupId } });
      if (data.capacity !== null && data.capacity < members) {
        return fail(`El grupo ya tiene ${members} estudiantes. El cupo no puede ser menor; quita estudiantes primero o deja un cupo mayor.`);
      }
      await tx.studentGroup.update({ where: { id: groupId }, data });
      await tx.auditLog.create({
        data: { institutionId: actor.institutionId, userId: actor.id, action: "GROUP_UPDATED", entity: "StudentGroup", entityId: groupId, changes: { name: data.name, programId: data.programId, capacity: data.capacity } },
      });
      return { ok: true } as const;
    }, rowLocked);
  } catch (error) {
    if (isUniqueViolation(error)) return fail("Ya existe un grupo con ese nombre. Usa otro nombre.");
    throw error;
  }
}

/** Borra el grupo y sus listas. Las inscripciones a cursos que ya se hicieron NO se deshacen. */
export async function deleteGroup(actor: AcademicActor, groupId: string): Promise<AcademicResult> {
  return db.$transaction(async (tx) => {
    const group = await tx.studentGroup.findFirst({
      where: { id: groupId, institutionId: actor.institutionId },
      select: { id: true, name: true, _count: { select: { members: true, courses: true } } },
    });
    if (!group) return fail(GROUP_NOT_FOUND);
    await tx.studentGroup.delete({ where: { id: group.id } });
    await tx.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        userId: actor.id,
        action: "GROUP_DELETED",
        entity: "StudentGroup",
        entityId: group.id,
        changes: { name: group.name, members: group._count.members, courses: group._count.courses },
      },
    });
    return { ok: true } as const;
  });
}

/**
 * Agrega estudiantes al grupo. Solo entran estudiantes activos de la misma institución:
 * si algún id no lo es, no se agrega a nadie. Respeta el cupo: si no caben todos, no se agrega a nadie.
 */
export async function addGroupMembers(actor: AcademicActor, groupId: string, userIds: readonly string[]): Promise<AcademicResult<{ added: number }>> {
  const ids = cleanIds(userIds);
  if (ids.length === 0) return fail("Elige al menos un estudiante.");
  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string; capacity: number | null }>>`
      SELECT "id", "capacity" FROM "student_groups" WHERE "id" = ${groupId} AND "institutionId" = ${actor.institutionId} FOR UPDATE`;
    if (!locked.length) return fail(GROUP_NOT_FOUND);
    const capacity = locked[0].capacity;

    const valid = await tx.user.count({ where: { id: { in: ids }, institutionId: actor.institutionId, role: "STUDENT", status: "ACTIVE" } });
    if (valid !== ids.length) return fail("Solo se pueden agregar estudiantes activos de tu institución. Actualiza la página y vuelve a elegir.");

    const current = await tx.studentGroupMember.findMany({ where: { groupId }, select: { userId: true } });
    const already = new Set(current.map((row) => row.userId));
    const fresh = ids.filter((id) => !already.has(id));
    if (capacity !== null && current.length + fresh.length > capacity) {
      const left = Math.max(0, capacity - current.length);
      return fail(
        left === 0
          ? "El grupo está lleno: no quedan cupos. Sube el cupo del grupo o quita a alguien primero."
          : `Solo ${left === 1 ? "queda 1 cupo" : `quedan ${left} cupos`} y elegiste ${fresh.length} estudiantes. Elige menos o sube el cupo del grupo.`,
      );
    }
    if (fresh.length) {
      await tx.studentGroupMember.createMany({ data: fresh.map((userId) => ({ institutionId: actor.institutionId, groupId, userId })), skipDuplicates: true });
      await tx.auditLog.create({
        data: { institutionId: actor.institutionId, userId: actor.id, action: "GROUP_MEMBERS_ADDED", entity: "StudentGroup", entityId: groupId, changes: { count: fresh.length, userIds: fresh } },
      });
    }
    return { ok: true, added: fresh.length } as const;
  }, rowLocked);
}

/** Quita a un estudiante del grupo. Sus inscripciones a cursos no cambian. */
export async function removeGroupMember(actor: AcademicActor, groupId: string, userId: string): Promise<AcademicResult> {
  return db.$transaction(async (tx) => {
    const removed = await tx.studentGroupMember.deleteMany({ where: { groupId, userId, institutionId: actor.institutionId, group: { institutionId: actor.institutionId } } });
    if (removed.count === 0) return fail("Esa persona ya no estaba en el grupo.");
    await tx.auditLog.create({
      data: { institutionId: actor.institutionId, userId: actor.id, action: "GROUP_MEMBER_REMOVED", entity: "StudentGroup", entityId: groupId, changes: { userId } },
    });
    return { ok: true } as const;
  });
}

/** Agrega cursos de la institución al grupo. Un curso no se repite dentro del grupo. */
export async function addGroupCourses(actor: AcademicActor, groupId: string, courseIds: readonly string[]): Promise<AcademicResult<{ added: number }>> {
  const ids = cleanIds(courseIds);
  if (ids.length === 0) return fail("Elige al menos un curso.");
  return db.$transaction(async (tx) => {
    const group = await tx.studentGroup.findFirst({ where: { id: groupId, institutionId: actor.institutionId }, select: { id: true, courses: { select: { courseId: true } } } });
    if (!group) return fail(GROUP_NOT_FOUND);
    const valid = await tx.course.count({ where: { id: { in: ids }, institutionId: actor.institutionId, archivedAt: null } });
    if (valid !== ids.length) return fail("Alguno de los cursos elegidos ya no está disponible. Actualiza la página y vuelve a elegir.");
    const existing = new Set(group.courses.map((row) => row.courseId));
    const fresh = ids.filter((id) => !existing.has(id));
    if (fresh.length) {
      await tx.studentGroupCourse.createMany({ data: fresh.map((courseId) => ({ institutionId: actor.institutionId, groupId: group.id, courseId })), skipDuplicates: true });
      await tx.auditLog.create({
        data: { institutionId: actor.institutionId, userId: actor.id, action: "GROUP_COURSES_ADDED", entity: "StudentGroup", entityId: group.id, changes: { courseIds: fresh } },
      });
    }
    return { ok: true, added: fresh.length } as const;
  });
}

/** Agrega al grupo todos los cursos (no archivados) de su programa. */
export async function addProgramCoursesToGroup(actor: AcademicActor, groupId: string): Promise<AcademicResult<{ added: number }>> {
  const group = await db.studentGroup.findFirst({
    where: { id: groupId, institutionId: actor.institutionId },
    select: { program: { select: { courses: { where: { course: { archivedAt: null, institutionId: actor.institutionId } }, select: { courseId: true } } } } },
  });
  if (!group) return fail(GROUP_NOT_FOUND);
  if (!group.program) return fail("Este grupo no tiene programa. Elige los cursos uno por uno.");
  const courseIds = group.program.courses.map((row) => row.courseId);
  if (courseIds.length === 0) return fail("El programa todavía no tiene cursos. Agrégalos primero en el programa.");
  return addGroupCourses(actor, groupId, courseIds);
}

/** Quita un curso del grupo. Quienes ya estaban inscritos en ese curso siguen inscritos. */
export async function removeGroupCourse(actor: AcademicActor, groupId: string, courseId: string): Promise<AcademicResult> {
  return db.$transaction(async (tx) => {
    const removed = await tx.studentGroupCourse.deleteMany({ where: { groupId, courseId, institutionId: actor.institutionId, group: { institutionId: actor.institutionId } } });
    if (removed.count === 0) return fail("Ese curso ya no estaba en el grupo.");
    await tx.auditLog.create({
      data: { institutionId: actor.institutionId, userId: actor.id, action: "GROUP_COURSE_REMOVED", entity: "StudentGroup", entityId: groupId, changes: { courseId } },
    });
    return { ok: true } as const;
  });
}

// ---------------------------------------------------------------------------
// Inscribir al grupo en sus cursos
// ---------------------------------------------------------------------------

export type CourseEnrollmentPlan = {
  courseId: string;
  courseName: string;
  /** Estudiantes del grupo sin matrícula en este curso: son los que se inscriben. */
  toEnroll: number;
  /** Ya tenían matrícula (activa o terminada): no cambian. */
  alreadyEnrolled: number;
  /** Se retiraron de este curso: no se reactivan aquí. */
  withdrawn: string[];
  /** Por qué este curso no se toca; null si se puede inscribir. */
  blocked: "full" | "archived" | null;
  /** Cupos libres del curso; null si el curso no tiene límite. */
  seatsLeft: number | null;
};

export type GroupEnrollmentPlan = { students: number; courses: CourseEnrollmentPlan[] };

type CourseRow = { id: string; name: string; maxStudents: number | null; archivedAt: Date | null };
type Student = { id: string; name: string };

/** Qué pasaría (o qué pasa) con un curso. Con `tx` de una transacción que ya bloqueó la fila del curso, el cálculo es firme. */
async function planCourse(tx: Prisma.TransactionClient, course: CourseRow, students: Student[]) {
  const [existing, active] = await Promise.all([
    tx.enrollment.findMany({ where: { courseId: course.id, studentId: { in: students.map((student) => student.id) } }, select: { studentId: true, status: true } }),
    tx.enrollment.count({ where: { courseId: course.id, status: "ACTIVE" } }),
  ]);
  const statusByStudent = new Map(existing.map((row) => [row.studentId, row.status]));
  const missing = students.filter((student) => !statusByStudent.has(student.id));
  const withdrawn = students.filter((student) => statusByStudent.get(student.id) === "DROPPED").map((student) => student.name);
  const seatsLeft = course.maxStudents === null ? null : Math.max(0, course.maxStudents - active);
  const blocked = course.archivedAt ? ("archived" as const) : seatsLeft !== null && missing.length > seatsLeft ? ("full" as const) : null;
  const plan: CourseEnrollmentPlan = {
    courseId: course.id,
    courseName: course.name,
    toEnroll: missing.length,
    alreadyEnrolled: existing.length - withdrawn.length,
    withdrawn,
    blocked,
    seatsLeft,
  };
  return { plan, missing };
}

async function loadEnrollmentScope(institutionId: string, groupId: string) {
  const group = await db.studentGroup.findFirst({
    where: { id: groupId, institutionId },
    select: {
      id: true,
      // Solo estudiantes activos: a una persona suspendida no se le abren cursos nuevos.
      members: { where: { user: { institutionId, role: "STUDENT", status: "ACTIVE" } }, orderBy: { user: { name: "asc" } }, select: { user: { select: { id: true, name: true } } } },
      courses: { where: { course: { institutionId } }, orderBy: { course: { name: "asc" } }, select: { course: { select: { id: true, name: true, maxStudents: true, archivedAt: true } } } },
    },
  });
  if (!group) return null;
  return { students: group.members.map((member) => member.user), courses: group.courses.map((row) => row.course) };
}

/** Resumen previo: no cambia nada. Es lo que la pantalla muestra antes de confirmar. */
export async function previewGroupEnrollment(institutionId: string, groupId: string): Promise<GroupEnrollmentPlan | null> {
  const scope = await loadEnrollmentScope(institutionId, groupId);
  if (!scope) return null;
  const courses: CourseEnrollmentPlan[] = [];
  for (const course of scope.courses) courses.push((await planCourse(db, course, scope.students)).plan);
  return { students: scope.students.length, courses };
}

export type GroupEnrollmentResult = { ok: true; students: number; enrolled: number; courses: Array<CourseEnrollmentPlan & { enrolled: number }> } | { ok: false; message: string };

/**
 * Crea las matrículas activas que falten para cada estudiante del grupo en cada curso del grupo.
 *
 * - Repetirlo no duplica nada: quien ya tiene matrícula se deja como está.
 * - Quien se retiró de un curso NO se reactiva; se informa aparte.
 * - Una transacción por curso con la fila del curso bloqueada: si el curso no tiene cupo
 *   para todos los que faltan, ese curso no se toca y los demás sí.
 * - Una sola fila de auditoría por operación.
 */
export async function enrollGroupInCourses(actor: AcademicActor, groupId: string): Promise<GroupEnrollmentResult> {
  const scope = await loadEnrollmentScope(actor.institutionId, groupId);
  if (!scope) return fail(GROUP_NOT_FOUND);
  if (scope.students.length === 0) return fail("El grupo todavía no tiene estudiantes activos. Agrégalos primero.");
  if (scope.courses.length === 0) return fail("El grupo todavía no tiene cursos. Agrégalos primero.");

  const courses: Array<CourseEnrollmentPlan & { enrolled: number }> = [];
  for (const course of scope.courses) {
    const outcome = await db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<CourseRow>>`
        SELECT "id", "name", "maxStudents", "archivedAt" FROM "courses"
        WHERE "id" = ${course.id} AND "institutionId" = ${actor.institutionId}
        FOR UPDATE`;
      if (!locked.length) return null;
      const { plan, missing } = await planCourse(tx, locked[0], scope.students);
      if (plan.blocked || missing.length === 0) return { ...plan, enrolled: 0 };
      const created = await tx.enrollment.createMany({
        data: missing.map((student) => ({ institutionId: actor.institutionId, studentId: student.id, courseId: course.id, status: "ACTIVE" as const })),
        skipDuplicates: true,
      });
      await notifyEnrolledWithinTransaction(tx, actor.institutionId, { courseId: course.id, studentIds: missing.map((student) => student.id) });
      return { ...plan, enrolled: created.count };
    }, rowLocked);
    if (outcome) courses.push(outcome);
  }

  const enrolled = courses.reduce((sum, course) => sum + course.enrolled, 0);
  await db.auditLog.create({
    data: {
      institutionId: actor.institutionId,
      userId: actor.id,
      action: "GROUP_ENROLLED",
      entity: "StudentGroup",
      entityId: groupId,
      changes: {
        students: scope.students.length,
        enrolled,
        courses: courses.map((course) => ({ courseId: course.courseId, enrolled: course.enrolled, alreadyEnrolled: course.alreadyEnrolled, withdrawn: course.withdrawn.length, blocked: course.blocked })),
      },
    },
  });
  return { ok: true, students: scope.students.length, enrolled, courses };
}
