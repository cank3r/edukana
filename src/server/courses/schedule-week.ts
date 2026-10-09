import type { Prisma } from "@prisma/client";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { resolveCourseReadScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import { addDaysToDateKey, zonedDateKey, zonedParts, zonedTimeToUtc } from "@/lib/timezone";
import { cleanDateKey, institutionTimeZone, mondayOf, slotRunsOn, toClock, type Actor } from "@/server/courses/schedule";

/** «Mi horario semanal»: los bloques fijos de todos mis cursos y las clases en vivo de una semana. */

export type WeekItem = {
  kind: "slot" | "class";
  id: string;
  courseId: string;
  courseName: string;
  startMinutes: number;
  endMinutes: number;
  start: string;
  end: string;
  classroom: string | null;
  teacherName: string | null;
  /** Título de la clase en vivo. */
  title: string | null;
};
export type WeekDay = { key: string; weekday: number; items: WeekItem[] };
export type WeekSubject =
  | { kind: "own" }
  | { kind: "teacher"; id: string; name: string }
  | { kind: "classroom"; name: string }
  | { kind: "choose" };
export type WeeklySchedule = {
  timeZone: string;
  today: string;
  weekStart: string;
  prevWeek: string;
  nextWeek: string;
  /** Lunes a sábado, y el domingo solo si ese día hay algo. */
  days: WeekDay[];
  subject: WeekSubject;
  /** Solo para quien administra: a quién o qué aula puede mirar. */
  choices: { teachers: Array<{ id: string; name: string }>; classrooms: string[] } | null;
};

const MAX_ITEMS = 500;
const slotSelect = {
  id: true,
  weekday: true,
  startMinutes: true,
  endMinutes: true,
  classroom: true,
  startsOn: true,
  endsOn: true,
  teacher: { select: { name: true } },
  course: { select: { id: true, name: true } },
} satisfies Prisma.ScheduleSlotSelect;

/** Qué cursos y bloques mirar según quién pide y qué eligió. */
async function resolveSubject(actor: Actor, canChoose: boolean, view: string) {
  const live = { institutionId: actor.institutionId, archivedAt: null };
  if (actor.role === "STUDENT") {
    const courses: Prisma.CourseWhereInput = { ...live, isPublished: true, enrollments: { some: { studentId: actor.id, institutionId: actor.institutionId, status: "ACTIVE" } } };
    return { subject: { kind: "own" } as WeekSubject, slots: { course: courses } as Prisma.ScheduleSlotWhereInput, classes: courses as Prisma.CourseWhereInput | null };
  }
  if (!canChoose) {
    const courses: Prisma.CourseWhereInput = { ...live, teacherId: actor.id };
    return { subject: { kind: "own" } as WeekSubject, slots: { OR: [{ course: courses }, { teacherId: actor.id, course: live }] }, classes: courses };
  }
  const [kind, ...rest] = view.split(":");
  const value = rest.join(":").trim();
  if (kind === "docente" && value) {
    const teacher = await db.user.findFirst({ where: { id: value, institutionId: actor.institutionId }, select: { id: true, name: true } });
    if (teacher) {
      const courses: Prisma.CourseWhereInput = { ...live, teacherId: teacher.id };
      return { subject: { kind: "teacher", ...teacher } as WeekSubject, slots: { OR: [{ course: courses }, { teacherId: teacher.id, course: live }] }, classes: courses };
    }
  }
  if (kind === "aula" && value) {
    return {
      subject: { kind: "classroom", name: value } as WeekSubject,
      slots: { classroom: { equals: value, mode: "insensitive" }, course: live } as Prisma.ScheduleSlotWhereInput,
      classes: null,
    };
  }
  return { subject: { kind: "choose" } as WeekSubject, slots: null, classes: null };
}

async function adminChoices(institutionId: string): Promise<NonNullable<WeeklySchedule["choices"]>> {
  const [teachers, rooms] = await Promise.all([
    db.user.findMany({
      where: { institutionId, OR: [{ role: "TEACHER", status: "ACTIVE" }, { taughtCourses: { some: { archivedAt: null } } }] },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 300,
    }),
    db.scheduleSlot.findMany({ where: { institutionId, course: { archivedAt: null } }, select: { classroom: true }, distinct: ["classroom"], take: 300 }),
  ]);
  const classrooms = new Map<string, string>();
  for (const room of rooms) if (!classrooms.has(room.classroom.toLowerCase())) classrooms.set(room.classroom.toLowerCase(), room.classroom);
  return { teachers, classrooms: [...classrooms.values()].sort((a, b) => a.localeCompare(b, "es")) };
}

/**
 * Semana (de lunes a domingo) que contiene `week`, o la actual. El estudiante ve sus cursos activos y publicados;
 * el docente, los suyos; quien ve todos los cursos elige un docente (`docente:<id>`) o un aula (`aula:<nombre>`).
 * Null si la persona no puede ver horarios.
 */
export async function getWeeklySchedule(actor: Actor, options: { week?: string; view?: string } = {}, now = new Date()): Promise<WeeklySchedule | null> {
  if (!actor.institutionId) return null;
  const capabilities = await getEffectiveCapabilities(actor.institutionId, actor.role);
  const scope = resolveCourseReadScope(actor, capabilities);
  if (!capabilities.has("schedule.view") || scope.kind === "none") return null;
  const canChoose = scope.kind === "all";

  const timeZone = await institutionTimeZone(actor.institutionId);
  const today = zonedDateKey(now, timeZone);
  const weekStart = mondayOf(cleanDateKey(options.week) ?? today);
  const keys = Array.from({ length: 7 }, (_, index) => addDaysToDateKey(weekStart, index) ?? weekStart);
  const nextWeek = addDaysToDateKey(weekStart, 7) ?? weekStart;
  const from = zonedTimeToUtc(weekStart, "00:00", timeZone);
  const until = zonedTimeToUtc(nextWeek, "00:00", timeZone);

  const { subject, slots, classes } = await resolveSubject(actor, canChoose, options.view ?? "");
  const [slotRows, classRows, choices] = await Promise.all([
    slots
      ? db.scheduleSlot.findMany({ where: { AND: [slots, { institutionId: actor.institutionId }] }, select: slotSelect, orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }], take: MAX_ITEMS })
      : Promise.resolve([]),
    classes && from && until
      ? db.liveClass.findMany({
          where: { institutionId: actor.institutionId, course: classes, startsAt: { gte: from, lt: until } },
          select: { id: true, title: true, startsAt: true, durationMinutes: true, course: { select: { id: true, name: true } } },
          orderBy: { startsAt: "asc" },
          take: MAX_ITEMS,
        })
      : Promise.resolve([]),
    canChoose ? adminChoices(actor.institutionId) : Promise.resolve(null),
  ]);

  const days: WeekDay[] = keys.map((key, index) => ({ key, weekday: index + 1, items: [] }));
  const byKey = new Map(days.map((day) => [day.key, day]));
  for (const slot of slotRows) {
    const range = { weekday: slot.weekday, startsOn: slot.startsOn?.toISOString().slice(0, 10) ?? null, endsOn: slot.endsOn?.toISOString().slice(0, 10) ?? null };
    const day = days[slot.weekday - 1];
    if (!day || !slotRunsOn(range, day.key)) continue;
    day.items.push({
      kind: "slot",
      id: slot.id,
      courseId: slot.course.id,
      courseName: slot.course.name,
      startMinutes: slot.startMinutes,
      endMinutes: slot.endMinutes,
      start: toClock(slot.startMinutes),
      end: toClock(slot.endMinutes),
      classroom: slot.classroom,
      teacherName: slot.teacher.name,
      title: null,
    });
  }
  for (const item of classRows) {
    const day = byKey.get(zonedDateKey(item.startsAt, timeZone));
    if (!day) continue;
    const parts = zonedParts(item.startsAt, timeZone);
    const startMinutes = parts.hour * 60 + parts.minute;
    const endMinutes = Math.min(24 * 60, startMinutes + item.durationMinutes);
    day.items.push({
      kind: "class",
      id: item.id,
      courseId: item.course.id,
      courseName: item.course.name,
      startMinutes,
      endMinutes,
      start: toClock(startMinutes),
      end: toClock(endMinutes),
      classroom: null,
      teacherName: null,
      title: item.title,
    });
  }
  for (const day of days) day.items.sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);

  return {
    timeZone,
    today,
    weekStart,
    prevWeek: addDaysToDateKey(weekStart, -7) ?? weekStart,
    nextWeek,
    days: days[6].items.length ? days : days.slice(0, 6),
    subject,
    choices,
  };
}
