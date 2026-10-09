import { z } from "zod";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { courseWhereForScope, resolveCourseReadScope, resolveCourseWriteScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import { addDaysToDateKey, formatZonedDay, formatZonedTime, isValidTimeZone, zonedDateKey, zonedTimeToUtc } from "@/lib/timezone";
import type { EdukanaRole } from "@/types/next-auth";

type Actor = { id: string; institutionId: string; role: EdukanaRole };

export const LIVE_CLASS_DURATIONS = [30, 45, 60, 90, 120] as const;
export const MAX_REPEAT_WEEKS = 16;
const DEFAULT_TIME_ZONE = "America/Santo_Domingo";
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** Ninguna clase dura más que esto; sirve para buscar las que empezaron antes y siguen en curso. */
const MAX_DURATION_MINUTES = 600;

export type LiveClassItem = {
  id: string;
  title: string;
  description: string | null;
  startsAt: Date;
  durationMinutes: number;
  joinUrl: string;
};
export type LiveClassList = {
  courseId: string;
  courseName: string;
  timeZone: string;
  canManage: boolean;
  upcoming: LiveClassItem[];
  past: LiveClassItem[];
};
export type LiveClassResult = { ok: true; courseId: string; created: number; warning: string | null } | { ok: false; message: string };
export type LiveClassDeleteResult = { ok: true; courseId: string } | { ok: false; message: string };

export type AgendaItem =
  | { kind: "class"; id: string; at: Date; title: string; courseId: string; courseName: string; durationMinutes: number; joinUrl: string }
  | { kind: "assignment"; id: string; at: Date; title: string; courseId: string; courseName: string };
export type AgendaDay = { key: string; items: AgendaItem[] };
export type Agenda = { timeZone: string; days: AgendaDay[] };

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.includes(".");
  } catch {
    return false;
  }
}

const baseSchema = z.object({
  title: z.string().trim().min(3, "Escribe un título de al menos 3 letras.").max(120, "El título es demasiado largo."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige la fecha de la clase."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Elige la hora de inicio."),
  durationMinutes: z.coerce
    .number({ message: "Elige cuánto dura la clase." })
    .int("Elige cuánto dura la clase.")
    .positive("La duración debe ser mayor que cero.")
    .max(MAX_DURATION_MINUTES, "La clase no puede durar más de 10 horas."),
  joinUrl: z
    .string()
    .trim()
    .max(1000, "El enlace es demasiado largo.")
    .refine(isHttpsUrl, "El enlace de la reunión debe empezar con https:// (cópialo completo desde Zoom, Meet o Teams)."),
  description: z.string().trim().max(1000, "La nota es demasiado larga.").optional(),
});
const createSchema = baseSchema.extend({
  weeks: z.coerce
    .number({ message: "Escribe cuántas semanas se repite." })
    .int("Escribe cuántas semanas se repite.")
    .min(1, "Debe ser al menos 1 semana.")
    .max(MAX_REPEAT_WEEKS, `Se puede repetir hasta ${MAX_REPEAT_WEEKS} semanas.`)
    .default(1),
});

export type LiveClassInput = { title: string; date: string; time: string; durationMinutes: number | string; joinUrl: string; description?: string };

const itemSelect = { id: true, title: true, description: true, startsAt: true, durationMinutes: true, joinUrl: true } as const;
const endsAt = (item: { startsAt: Date; durationMinutes: number }) => item.startsAt.getTime() + item.durationMinutes * MINUTE;

async function institutionTimeZone(institutionId: string): Promise<string> {
  const institution = await db.institution.findUnique({ where: { id: institutionId }, select: { timezone: true } });
  return institution && isValidTimeZone(institution.timezone) ? institution.timezone : DEFAULT_TIME_ZONE;
}

/** Curso que la persona puede gestionar (docente del curso o quien gestiona todos), o null. */
async function manageableCourse(actor: Actor, courseId: string) {
  if (!actor.institutionId || !courseId) return null;
  const capabilities = await getEffectiveCapabilities(actor.institutionId, actor.role);
  const where = courseWhereForScope(actor.institutionId, resolveCourseWriteScope(actor, capabilities));
  if (!where) return null;
  return db.course.findFirst({ where: { ...where, id: courseId }, select: { id: true, name: true } });
}

/** Cursos cuyas clases puede ver la persona. El estudiante solo ve cursos publicados donde está inscrito y activo. */
async function readableCourseWhere(actor: Actor) {
  if (!actor.institutionId) return null;
  const capabilities = await getEffectiveCapabilities(actor.institutionId, actor.role);
  const scope = resolveCourseReadScope(actor, capabilities);
  if (scope.kind === "student") {
    return {
      institutionId: actor.institutionId,
      isPublished: true,
      archivedAt: null,
      enrollments: { some: { studentId: actor.id, institutionId: actor.institutionId, status: "ACTIVE" as const } },
    };
  }
  return courseWhereForScope(actor.institutionId, scope);
}

function overlapWarning(
  candidates: { startsAt: Date; durationMinutes: number }[],
  existing: { title: string; startsAt: Date; durationMinutes: number }[],
  timeZone: string,
): string | null {
  for (const candidate of candidates) {
    const clash = existing.find((other) => other.startsAt.getTime() < endsAt(candidate) && candidate.startsAt.getTime() < endsAt(other));
    if (clash) {
      return `Ojo: se cruza con «${clash.title}», que es el ${formatZonedDay(clash.startsAt, timeZone)} a las ${formatZonedTime(clash.startsAt, timeZone)}. Se guardó de todos modos; cámbiala si fue un error.`;
    }
  }
  return null;
}

async function classesAround(courseId: string, institutionId: string, from: number, to: number, excludeId?: string) {
  return db.liveClass.findMany({
    where: {
      courseId,
      institutionId,
      startsAt: { gte: new Date(from - MAX_DURATION_MINUTES * MINUTE), lt: new Date(to) },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { title: true, startsAt: true, durationMinutes: true },
  });
}

/**
 * Clases en vivo de un curso: próximas (incluye la que está en curso) y pasadas.
 * Devuelve null si la persona no puede ver ese curso.
 */
export async function listLiveClasses(actor: Actor, courseId: string, now: Date = new Date()): Promise<LiveClassList | null> {
  const managed = await manageableCourse(actor, courseId);
  let course = managed;
  if (!course) {
    const where = await readableCourseWhere(actor);
    if (!where) return null;
    course = await db.course.findFirst({ where: { ...where, id: courseId }, select: { id: true, name: true } });
  }
  if (!course) return null;
  const [timeZone, classes] = await Promise.all([
    institutionTimeZone(actor.institutionId),
    db.liveClass.findMany({ where: { courseId: course.id, institutionId: actor.institutionId }, orderBy: { startsAt: "asc" }, select: itemSelect }),
  ]);
  const upcoming = classes.filter((item) => endsAt(item) > now.getTime());
  const past = classes.filter((item) => endsAt(item) <= now.getTime()).reverse();
  return { courseId: course.id, courseName: course.name, timeZone, canManage: Boolean(managed), upcoming, past };
}

/**
 * Programa una clase, o una por semana durante `weeks` semanas a la misma hora local (clases independientes).
 * La fecha y la hora se interpretan en la zona horaria de la institución y se guardan en UTC.
 */
export async function createLiveClasses(actor: Actor, input: LiveClassInput & { courseId: string; weeks?: number | string }, now: Date = new Date()): Promise<LiveClassResult> {
  const course = await manageableCourse(actor, input.courseId);
  if (!course) return { ok: false, message: "No puedes programar clases en este curso." };
  const parsed = createSchema.safeParse({ ...input, weeks: input.weeks === "" || input.weeks == null ? 1 : input.weeks });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const data = parsed.data;
  const timeZone = await institutionTimeZone(actor.institutionId);

  const starts: Date[] = [];
  for (let week = 0; week < data.weeks; week += 1) {
    const dateKey = addDaysToDateKey(data.date, week * 7);
    const startsAt = dateKey ? zonedTimeToUtc(dateKey, data.time, timeZone) : null;
    if (!startsAt) return { ok: false, message: "La fecha o la hora no es válida. Elígelas de nuevo." };
    starts.push(startsAt);
  }
  if (starts[0].getTime() <= now.getTime()) return { ok: false, message: "Esa fecha y hora ya pasaron. Elige una fecha futura." };

  const candidates = starts.map((startsAt) => ({ startsAt, durationMinutes: data.durationMinutes }));
  const existing = await classesAround(course.id, actor.institutionId, starts[0].getTime(), endsAt(candidates[candidates.length - 1]));
  const warning = overlapWarning(candidates, existing, timeZone);

  await db.$transaction(async (tx) => {
    const created = await Promise.all(
      starts.map((startsAt) =>
        tx.liveClass.create({
          data: {
            institutionId: actor.institutionId,
            courseId: course.id,
            title: data.title,
            description: data.description || null,
            startsAt,
            durationMinutes: data.durationMinutes,
            joinUrl: data.joinUrl,
            createdById: actor.id,
          },
          select: { id: true },
        }),
      ),
    );
    await tx.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        userId: actor.id,
        action: "LIVE_CLASS_CREATED",
        entity: "LiveClass",
        entityId: created[0].id,
        changes: { courseId: course.id, count: created.length, ids: created.map((item) => item.id), firstStartsAt: starts[0].toISOString() },
      },
    });
  });
  return { ok: true, courseId: course.id, created: starts.length, warning };
}

/** Cambia una clase. Si se mueve de fecha u hora, la nueva debe ser futura. */
export async function updateLiveClass(actor: Actor, input: LiveClassInput & { id: string }, now: Date = new Date()): Promise<LiveClassResult> {
  const current = input.id ? await db.liveClass.findFirst({ where: { id: input.id, institutionId: actor.institutionId } }) : null;
  const course = current ? await manageableCourse(actor, current.courseId) : null;
  if (!current || !course) return { ok: false, message: "No encontramos esa clase o no puedes cambiarla." };
  const parsed = baseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const data = parsed.data;
  const timeZone = await institutionTimeZone(actor.institutionId);
  const startsAt = zonedTimeToUtc(data.date, data.time, timeZone);
  if (!startsAt) return { ok: false, message: "La fecha o la hora no es válida. Elígelas de nuevo." };
  const moved = startsAt.getTime() !== current.startsAt.getTime();
  if (moved && startsAt.getTime() <= now.getTime()) return { ok: false, message: "Esa fecha y hora ya pasaron. Elige una fecha futura." };

  const candidate = { startsAt, durationMinutes: data.durationMinutes };
  const existing = await classesAround(course.id, actor.institutionId, startsAt.getTime(), endsAt(candidate), current.id);
  const warning = overlapWarning([candidate], existing, timeZone);

  await db.$transaction([
    db.liveClass.update({
      where: { id: current.id },
      data: { title: data.title, description: data.description || null, startsAt, durationMinutes: data.durationMinutes, joinUrl: data.joinUrl },
    }),
    db.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        userId: actor.id,
        action: "LIVE_CLASS_UPDATED",
        entity: "LiveClass",
        entityId: current.id,
        changes: {
          courseId: course.id,
          startsAtFrom: current.startsAt.toISOString(),
          startsAtTo: startsAt.toISOString(),
          durationFrom: current.durationMinutes,
          durationTo: data.durationMinutes,
          titleChanged: current.title !== data.title,
          linkChanged: current.joinUrl !== data.joinUrl,
        },
      },
    }),
  ]);
  return { ok: true, courseId: course.id, created: 0, warning };
}

/** Borra una clase del curso. Los estudiantes dejan de verla de inmediato. */
export async function deleteLiveClass(actor: Actor, id: string): Promise<LiveClassDeleteResult> {
  const current = id ? await db.liveClass.findFirst({ where: { id, institutionId: actor.institutionId } }) : null;
  const course = current ? await manageableCourse(actor, current.courseId) : null;
  if (!current || !course) return { ok: false, message: "No encontramos esa clase o no puedes borrarla." };
  await db.$transaction([
    db.liveClass.delete({ where: { id: current.id } }),
    db.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        userId: actor.id,
        action: "LIVE_CLASS_DELETED",
        entity: "LiveClass",
        entityId: current.id,
        changes: { courseId: course.id, title: current.title, startsAt: current.startsAt.toISOString() },
      },
    }),
  ]);
  return { ok: true, courseId: course.id };
}

/**
 * Agenda de los próximos `days` días, agrupada por día local de la institución:
 * clases en vivo (incluye la que está en curso) y fechas límite de tareas publicadas,
 * solo de los cursos que le tocan a la persona.
 */
export async function getAgenda(actor: Actor, now: Date = new Date(), days = 14): Promise<Agenda> {
  const timeZone = actor.institutionId ? await institutionTimeZone(actor.institutionId) : DEFAULT_TIME_ZONE;
  const courseWhere = await readableCourseWhere(actor);
  if (!courseWhere) return { timeZone, days: [] };
  const until = new Date(now.getTime() + days * DAY);
  const [classes, assignments] = await Promise.all([
    db.liveClass.findMany({
      where: {
        institutionId: actor.institutionId,
        course: { ...courseWhere, archivedAt: null },
        startsAt: { gte: new Date(now.getTime() - MAX_DURATION_MINUTES * MINUTE), lt: until },
      },
      orderBy: { startsAt: "asc" },
      take: 300,
      select: { ...itemSelect, course: { select: { id: true, name: true } } },
    }),
    db.assignment.findMany({
      where: { isPublished: true, dueDate: { gte: now, lt: until }, course: { ...courseWhere, archivedAt: null } },
      orderBy: { dueDate: "asc" },
      take: 300,
      select: { id: true, title: true, dueDate: true, course: { select: { id: true, name: true } } },
    }),
  ]);
  const items: AgendaItem[] = [
    ...classes
      .filter((item) => endsAt(item) > now.getTime())
      .map((item) => ({
        kind: "class" as const,
        id: item.id,
        at: item.startsAt,
        title: item.title,
        courseId: item.course.id,
        courseName: item.course.name,
        durationMinutes: item.durationMinutes,
        joinUrl: item.joinUrl,
      })),
    ...assignments.flatMap((item) =>
      item.dueDate ? [{ kind: "assignment" as const, id: item.id, at: item.dueDate, title: item.title, courseId: item.course.id, courseName: item.course.name }] : [],
    ),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const grouped = new Map<string, AgendaItem[]>();
  for (const item of items) {
    // Una clase que empezó ayer y sigue en curso se muestra hoy.
    const key = zonedDateKey(item.at.getTime() < now.getTime() ? now : item.at, timeZone);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return { timeZone, days: [...grouped].map(([key, dayItems]) => ({ key, items: dayItems })) };
}
