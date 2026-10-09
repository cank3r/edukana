import { getEffectiveCapabilities } from "@/lib/authorization";
import { courseWhereForScope, resolveCourseReadScope, resolveCourseWriteScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import { findScheduleConflicts } from "@/lib/lms";
import { addDaysToDateKey, isValidTimeZone, zonedDateKey } from "@/lib/timezone";
import type { EdukanaRole } from "@/types/next-auth";

/**
 * Horario semanal de un curso: bloques fijos (día, hora de inicio y fin, aula y docente) que se repiten
 * cada semana, con vigencia opcional. Las horas son «de pared» en la zona de la institución.
 */

export type Actor = { id: string; institutionId: string; role: EdukanaRole };

export const WEEKDAY_NAMES = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;
export const DEFAULT_TIME_ZONE = "America/Santo_Domingo";
const MAX_CLASSROOM = 100;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_RE = /^(\d{2}):(\d{2})$/;
const NO_ACCESS = "No encontramos ese curso o no tienes permiso para cambiar su horario.";
const ARCHIVED = "Este curso está archivado. Recupéralo antes de cambiar su horario.";

export type SlotInput = { weekday: number | string; start: string; end: string; classroom: string; startsOn?: string; endsOn?: string };
export type SlotView = {
  id: string;
  weekday: number;
  startMinutes: number;
  endMinutes: number;
  start: string;
  end: string;
  classroom: string;
  teacherName: string;
  startsOn: string | null;
  endsOn: string | null;
  /** «ended»: su vigencia ya terminó; «upcoming»: todavía no empieza. */
  status: "active" | "upcoming" | "ended";
};
export type CourseSchedule = { course: { id: string; name: string; archived: boolean }; canManage: boolean; timeZone: string; today: string; slots: SlotView[] };
export type SaveSlotResult = { ok: true; slotId: string; created: boolean; warning: string | null } | { ok: false; message: string };
export type DeleteSlotResult = { ok: true } | { ok: false; message: string };

const pad = (value: number) => String(value).padStart(2, "0");
/** 450 → «07:30». */
export const toClock = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
/** «07:30» → 450, o null si no es una hora válida. */
export function parseClock(value: unknown): number | null {
  const match = typeof value === "string" ? CLOCK_RE.exec(value.trim()) : null;
  if (!match) return null;
  const [hour, minute] = [Number(match[1]), Number(match[2])];
  return hour > 23 || minute > 59 ? null : hour * 60 + minute;
}
/** Fecha válida `AAAA-MM-DD`, o null. */
export function cleanDateKey(value: unknown): string | null {
  if (typeof value !== "string" || !DATE_RE.test(value.trim())) return null;
  const key = value.trim();
  return addDaysToDateKey(key, 0) === key ? key : null;
}
/** Día de la semana de una fecha `AAAA-MM-DD`: 1 = lunes … 7 = domingo. */
export function weekdayOf(key: string): number {
  const day = new Date(`${key}T12:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}
/** Lunes de la semana a la que pertenece la fecha. */
export function mondayOf(key: string): string {
  return addDaysToDateKey(key, 1 - weekdayOf(key)) ?? key;
}
/** ¿Se cruzan dos vigencias? null = sin límite por ese lado. */
export function periodsOverlap(a: { startsOn: string | null; endsOn: string | null }, b: { startsOn: string | null; endsOn: string | null }) {
  return (!a.startsOn || !b.endsOn || a.startsOn <= b.endsOn) && (!b.startsOn || !a.endsOn || b.startsOn <= a.endsOn);
}
/** ¿El bloque se dicta en esa fecha? */
export function slotRunsOn(slot: { weekday: number; startsOn: string | null; endsOn: string | null }, key: string) {
  return slot.weekday === weekdayOf(key) && (!slot.startsOn || slot.startsOn <= key) && (!slot.endsOn || key <= slot.endsOn);
}

const toDbDate = (key: string) => new Date(`${key}T00:00:00.000Z`);
const toKey = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);
const span = (slot: { weekday: number; startMinutes: number; endMinutes: number }) =>
  `el ${WEEKDAY_NAMES[slot.weekday].toLowerCase()} de ${toClock(slot.startMinutes)} a ${toClock(slot.endMinutes)}`;

export async function institutionTimeZone(institutionId: string): Promise<string> {
  const institution = await db.institution.findUnique({ where: { id: institutionId }, select: { timezone: true } });
  return institution && isValidTimeZone(institution.timezone) ? institution.timezone : DEFAULT_TIME_ZONE;
}

/** Curso de la institución que la persona gestiona (su docente o quien gestiona todos), o null. */
async function manageableCourse(actor: Actor, courseId: string) {
  if (!actor.institutionId || !courseId) return null;
  const capabilities = await getEffectiveCapabilities(actor.institutionId, actor.role);
  const where = courseWhereForScope(actor.institutionId, resolveCourseWriteScope(actor, capabilities));
  if (!where) return null;
  return db.course.findFirst({
    where: { AND: [where, { id: courseId, institutionId: actor.institutionId }] },
    select: { id: true, name: true, archivedAt: true, teacherId: true, teacher: { select: { name: true } } },
  });
}

/** Curso que la persona puede ver: el estudiante, solo si está inscrito y el curso está publicado. */
async function readableCourse(actor: Actor, courseId: string) {
  if (!actor.institutionId || !courseId) return null;
  const capabilities = await getEffectiveCapabilities(actor.institutionId, actor.role);
  const scope = resolveCourseReadScope(actor, capabilities);
  const where = courseWhereForScope(actor.institutionId, scope);
  if (!where) return null;
  const extra = scope.kind === "student" ? { isPublished: true, archivedAt: null } : {};
  return db.course.findFirst({ where: { AND: [where, { id: courseId, institutionId: actor.institutionId, ...extra }] }, select: { id: true, name: true, archivedAt: true } });
}

/** Horario de un curso. Quien lo gestiona puede cambiarlo; el estudiante inscrito lo ve. Null si no tiene acceso. */
export async function getCourseSchedule(actor: Actor, courseId: string, now = new Date()): Promise<CourseSchedule | null> {
  const managed = await manageableCourse(actor, courseId);
  const course = managed ?? (await readableCourse(actor, courseId));
  if (!course) return null;
  const timeZone = await institutionTimeZone(actor.institutionId);
  const today = zonedDateKey(now, timeZone);
  const slots = await db.scheduleSlot.findMany({
    where: { courseId: course.id, institutionId: actor.institutionId },
    orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }],
    select: { id: true, weekday: true, startMinutes: true, endMinutes: true, classroom: true, startsOn: true, endsOn: true, teacher: { select: { name: true } } },
  });
  return {
    course: { id: course.id, name: course.name, archived: Boolean(course.archivedAt) },
    canManage: Boolean(managed),
    timeZone,
    today,
    slots: slots.map((slot) => {
      const startsOn = toKey(slot.startsOn);
      const endsOn = toKey(slot.endsOn);
      const status = endsOn && endsOn < today ? "ended" : startsOn && startsOn > today ? "upcoming" : "active";
      return { ...slot, start: toClock(slot.startMinutes), end: toClock(slot.endMinutes), teacherName: slot.teacher.name, startsOn, endsOn, status };
    }),
  };
}

type CleanSlot = { weekday: number; startMinutes: number; endMinutes: number; classroom: string; startsOn: string | null; endsOn: string | null };

function cleanSlot(input: SlotInput): CleanSlot | string {
  const weekday = Number(input.weekday);
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return "Elige el día de la semana.";
  const startMinutes = parseClock(input.start);
  const endMinutes = parseClock(input.end);
  if (startMinutes === null || endMinutes === null) return "Escribe la hora de inicio y la hora de fin.";
  if (endMinutes <= startMinutes) return "La hora de fin debe ser después de la hora de inicio.";
  const classroom = String(input.classroom ?? "").trim().replace(/\s+/g, " ");
  if (!classroom) return "Escribe el aula o el lugar de la clase.";
  if (classroom.length > MAX_CLASSROOM) return `El nombre del aula es demasiado largo (máximo ${MAX_CLASSROOM} letras).`;
  const rawFrom = String(input.startsOn ?? "").trim();
  const rawTo = String(input.endsOn ?? "").trim();
  const startsOn = rawFrom ? cleanDateKey(rawFrom) : null;
  const endsOn = rawTo ? cleanDateKey(rawTo) : null;
  if (rawFrom && !startsOn) return "La fecha «desde» no es válida.";
  if (rawTo && !endsOn) return "La fecha «hasta» no es válida.";
  if (startsOn && endsOn && endsOn < startsOn) return "La fecha «hasta» debe ser igual o posterior a la fecha «desde».";
  return { weekday, startMinutes, endMinutes, classroom, startsOn, endsOn };
}

/** Otros cursos (no archivados) donde estudiantes activos de este curso tienen clase a la misma hora. */
async function studentClashWarning(institutionId: string, courseId: string, slot: CleanSlot): Promise<string | null> {
  const enrolled = await db.enrollment.findMany({ where: { courseId, institutionId, status: "ACTIVE" }, select: { studentId: true } });
  const ids = enrolled.map((item) => item.studentId);
  if (!ids.length) return null;
  const sharing = { studentId: { in: ids }, status: "ACTIVE" as const };
  const others = await db.scheduleSlot.findMany({
    where: {
      institutionId,
      weekday: slot.weekday,
      courseId: { not: courseId },
      startMinutes: { lt: slot.endMinutes },
      endMinutes: { gt: slot.startMinutes },
      course: { archivedAt: null, enrollments: { some: sharing } },
    },
    select: { startsOn: true, endsOn: true, course: { select: { name: true, enrollments: { where: sharing, select: { studentId: true } } } } },
  });
  const students = new Set<string>();
  const courses = new Set<string>();
  for (const other of others) {
    if (!periodsOverlap(slot, { startsOn: toKey(other.startsOn), endsOn: toKey(other.endsOn) })) continue;
    courses.add(`«${other.course.name}»`);
    for (const enrollment of other.course.enrollments) students.add(enrollment.studentId);
  }
  if (!students.size) return null;
  const who = students.size === 1 ? "1 estudiante de este curso tiene" : `${students.size} estudiantes de este curso tienen`;
  return `Ojo: ${who} otra clase a esa hora en ${[...courses].join(", ")}. El bloque se guardó; revisa si conviene moverlo.`;
}

/**
 * Agrega un bloque (sin `slotId`) o lo cambia. Se rechaza si el docente del curso o el aula ya están ocupados
 * a esa hora en otro bloque vigente; un cruce con otros cursos de los mismos estudiantes solo se avisa.
 */
export async function saveScheduleSlot(actor: Actor, courseId: string, input: SlotInput, slotId?: string): Promise<SaveSlotResult> {
  const course = await manageableCourse(actor, courseId);
  if (!course) return { ok: false, message: NO_ACCESS };
  if (course.archivedAt) return { ok: false, message: ARCHIVED };
  const slot = cleanSlot(input);
  if (typeof slot === "string") return { ok: false, message: slot };

  const existing = slotId
    ? await db.scheduleSlot.findFirst({ where: { id: slotId, courseId: course.id, institutionId: actor.institutionId }, select: { id: true } })
    : null;
  if (slotId && !existing) return { ok: false, message: "Ese bloque ya no existe. Recarga la página." };

  const sameDay = await db.scheduleSlot.findMany({
    where: { institutionId: actor.institutionId, weekday: slot.weekday, course: { archivedAt: null }, ...(existing ? { id: { not: existing.id } } : {}) },
    select: { id: true, teacherId: true, classroom: true, weekday: true, startMinutes: true, endMinutes: true, startsOn: true, endsOn: true, course: { select: { name: true } } },
  });
  const current = sameDay.filter((other) => periodsOverlap(slot, { startsOn: toKey(other.startsOn), endsOn: toKey(other.endsOn) }));
  const conflicts = findScheduleConflicts({ ...slot, id: existing?.id, teacherId: course.teacherId }, current);
  const teacherClash = conflicts.find((conflict) => conflict.type === "TEACHER");
  const roomClash = conflicts.find((conflict) => conflict.type === "CLASSROOM");
  const named = (clash: { slot: { id?: string } } | undefined) => current.find((other) => other.id === clash?.slot.id);
  const messages = [
    teacherClash ? `${course.teacher.name} ya da clase ${span(teacherClash.slot)} en «${named(teacherClash)?.course.name ?? "otro curso"}».` : "",
    roomClash ? `El aula «${roomClash.slot.classroom}» ya está ocupada ${span(roomClash.slot)} por «${named(roomClash)?.course.name ?? "otro curso"}».` : "",
  ].filter(Boolean);
  if (messages.length) return { ok: false, message: `${messages.join(" ")} Elige otra hora${roomClash ? " u otra aula" : ""}. No se guardó nada.` };

  const data = {
    weekday: slot.weekday,
    startMinutes: slot.startMinutes,
    endMinutes: slot.endMinutes,
    classroom: slot.classroom,
    startsOn: slot.startsOn ? toDbDate(slot.startsOn) : null,
    endsOn: slot.endsOn ? toDbDate(slot.endsOn) : null,
    teacherId: course.teacherId,
  };
  const saved = await db.$transaction(async (tx) => {
    const row = existing
      ? await tx.scheduleSlot.update({ where: { id: existing.id }, data, select: { id: true } })
      : await tx.scheduleSlot.create({ data: { ...data, institutionId: actor.institutionId, courseId: course.id }, select: { id: true } });
    await tx.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        userId: actor.id,
        action: existing ? "SCHEDULE_SLOT_UPDATED" : "SCHEDULE_SLOT_CREATED",
        entity: "ScheduleSlot",
        entityId: row.id,
        changes: { courseId: course.id, ...slot },
      },
    });
    return row;
  });
  return { ok: true, slotId: saved.id, created: !existing, warning: await studentClashWarning(actor.institutionId, course.id, slot) };
}

/** Borra un bloque del horario del curso. */
export async function deleteScheduleSlot(actor: Actor, courseId: string, slotId: string): Promise<DeleteSlotResult> {
  const course = await manageableCourse(actor, courseId);
  if (!course) return { ok: false, message: NO_ACCESS };
  if (course.archivedAt) return { ok: false, message: ARCHIVED };
  const slot = slotId
    ? await db.scheduleSlot.findFirst({
        where: { id: slotId, courseId: course.id, institutionId: actor.institutionId },
        select: { id: true, weekday: true, startMinutes: true, endMinutes: true, classroom: true },
      })
    : null;
  if (!slot) return { ok: false, message: "Ese bloque ya no existe. Recarga la página." };
  await db.$transaction([
    db.scheduleSlot.delete({ where: { id: slot.id } }),
    db.auditLog.create({
      data: { institutionId: actor.institutionId, userId: actor.id, action: "SCHEDULE_SLOT_DELETED", entity: "ScheduleSlot", entityId: slot.id, changes: { courseId: course.id, ...slot } },
    }),
  ]);
  return { ok: true };
}
