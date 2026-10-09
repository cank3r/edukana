import { Prisma } from "@prisma/client";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { courseWhereForScope, resolveCourseReadScope, resolveCourseWriteScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import { addDaysToDateKey, zonedDateKey, zonedTimeToUtc } from "@/lib/timezone";
import type { EdukanaRole } from "@/types/next-auth";

type Actor = { id: string; institutionId: string; role: EdukanaRole };

export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export type AttendanceCounts = { present: number; absent: number; late: number; excused: number };

export type AttendanceEntry = { studentId: string; status: string; note?: string };
export type AttendanceInput = { date: string; title?: string; entries: AttendanceEntry[] };
export type SaveAttendanceResult =
  | { ok: true; sessionId: string; created: boolean; counts: AttendanceCounts }
  | { ok: false; message: string };
export type DeleteSessionResult = { ok: true } | { ok: false; message: string };

export type AttendanceSheet = {
  course: { id: string; name: string; archived: boolean };
  today: string;
  date: string;
  session: { id: string; title: string } | null;
  /** Títulos de las clases en vivo de ese día, para ofrecerlos como título de la sesión. */
  classTitles: string[];
  rows: Array<{ studentId: string; name: string; status: AttendanceStatus; note: string; withdrawn: boolean }>;
};
export type AttendanceSessionSummary = { id: string; date: string; title: string; total: number } & AttendanceCounts;
export type StudentAttendanceSummary = {
  studentId: string;
  name: string;
  email: string;
  recorded: number;
  /** Null cuando todavía no hay nada que contar (sin registros, o todos justificados). */
  percent: number | null;
  low: boolean;
} & AttendanceCounts;
export type AttendanceOverview = {
  course: { id: string; name: string; archived: boolean };
  sessions: AttendanceSessionSummary[];
  students: StudentAttendanceSummary[];
};
export type MyAttendance = {
  course: { id: string; name: string };
  percent: number | null;
  low: boolean;
  counts: AttendanceCounts;
  days: Array<{ date: string; title: string; status: AttendanceStatus }>;
};

export const LOW_ATTENDANCE_PERCENT = 80;
const MAX_ENTRIES = 500;
const MAX_NOTE = 300;
const MAX_TITLE = 120;
const NO_ACCESS = "No encontramos ese curso o no tienes permiso para tomar su asistencia.";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const KEY: Record<AttendanceStatus, keyof AttendanceCounts> = { PRESENT: "present", ABSENT: "absent", LATE: "late", EXCUSED: "excused" };
const zero = (): AttendanceCounts => ({ present: 0, absent: 0, late: 0, excused: 0 });
const isStatus = (value: unknown): value is AttendanceStatus => ATTENDANCE_STATUSES.includes(value as AttendanceStatus);

/**
 * Porcentaje de asistencia de un estudiante.
 *
 * Regla: una tardanza cuenta como asistencia (llegó a clase) y una falta justificada no cuenta
 * ni a favor ni en contra: se saca de la cuenta. Así, 3 presentes + 1 justificada + 1 ausencia
 * da 3 de 4 = 75 %. Si no queda nada que contar (sin registros o todos justificados) devuelve null.
 */
export function attendancePercent(counts: AttendanceCounts): number | null {
  const counted = counts.present + counts.late + counts.absent;
  if (counted === 0) return null;
  return Math.round(((counts.present + counts.late) / counted) * 100);
}

const isLow = (percent: number | null) => percent !== null && percent < LOW_ATTENDANCE_PERCENT;

/** Día guardado en la base (columna de solo fecha) ↔ `AAAA-MM-DD`. */
const toDbDate = (key: string) => new Date(`${key}T00:00:00.000Z`);
const toKey = (date: Date) => date.toISOString().slice(0, 10);

/** Fecha válida del calendario en formato `AAAA-MM-DD`, o null. */
function cleanDateKey(value: unknown): string | null {
  if (typeof value !== "string" || !DATE_RE.test(value)) return null;
  return addDaysToDateKey(value, 0) === value ? value : null;
}

async function institutionTimeZone(institutionId: string) {
  const institution = await db.institution.findUnique({ where: { id: institutionId }, select: { timezone: true } });
  return institution?.timezone || "America/Santo_Domingo";
}

/** Curso de la institución de quien actúa, solo si lo gestiona (su docente o quien ve todos los cursos). */
async function manageableCourse(actor: Actor, courseId: string) {
  if (!courseId) return null;
  const capabilities = await getEffectiveCapabilities(actor.institutionId, actor.role);
  const where = courseWhereForScope(actor.institutionId, resolveCourseWriteScope(actor, capabilities));
  if (!where) return null;
  return db.course.findFirst({
    where: { AND: [where, { id: courseId, institutionId: actor.institutionId }] },
    select: { id: true, name: true, archivedAt: true },
  });
}

/**
 * Hoja para tomar o corregir la asistencia de un día: los inscritos activos, todos en Presente
 * salvo lo que ya esté guardado para esa fecha. Devuelve null si quien actúa no gestiona el curso.
 * Una fecha inválida o futura se cambia por hoy.
 */
export async function getAttendanceSheet(actor: Actor, courseId: string, date?: string, now = new Date()): Promise<AttendanceSheet | null> {
  const course = await manageableCourse(actor, courseId);
  if (!course) return null;
  const timeZone = await institutionTimeZone(actor.institutionId);
  const today = zonedDateKey(now, timeZone);
  const wanted = cleanDateKey(date);
  const day = wanted && wanted <= today ? wanted : today;
  const dayStart = zonedTimeToUtc(day, "00:00", timeZone);
  const nextDay = addDaysToDateKey(day, 1);
  const dayEnd = nextDay ? zonedTimeToUtc(nextDay, "00:00", timeZone) : null;

  const [session, active, classes] = await Promise.all([
    db.attendanceSession.findFirst({
      where: { courseId: course.id, institutionId: actor.institutionId, date: toDbDate(day) },
      select: {
        id: true,
        title: true,
        records: {
          select: {
            status: true,
            notes: true,
            enrollment: { select: { studentId: true, status: true, student: { select: { name: true } } } },
          },
        },
      },
    }),
    db.enrollment.findMany({
      where: { courseId: course.id, institutionId: actor.institutionId, status: "ACTIVE" },
      select: { studentId: true, student: { select: { name: true } } },
    }),
    dayStart && dayEnd
      ? db.liveClass.findMany({
          where: { courseId: course.id, institutionId: actor.institutionId, startsAt: { gte: dayStart, lt: dayEnd } },
          select: { title: true },
          orderBy: { startsAt: "asc" },
        })
      : Promise.resolve([] as Array<{ title: string }>),
  ]);

  const rows = new Map<string, AttendanceSheet["rows"][number]>();
  for (const enrollment of active) {
    rows.set(enrollment.studentId, { studentId: enrollment.studentId, name: enrollment.student.name, status: "PRESENT", note: "", withdrawn: false });
  }
  // Lo ya guardado manda; quien se retiró después conserva su registro de ese día y se puede corregir.
  for (const record of session?.records ?? []) {
    rows.set(record.enrollment.studentId, {
      studentId: record.enrollment.studentId,
      name: record.enrollment.student.name,
      status: record.status as AttendanceStatus,
      note: record.notes ?? "",
      withdrawn: record.enrollment.status !== "ACTIVE",
    });
  }

  return {
    course: { id: course.id, name: course.name, archived: Boolean(course.archivedAt) },
    today,
    date: day,
    session: session ? { id: session.id, title: session.title ?? "" } : null,
    classTitles: [...new Set(classes.map((item) => item.title))],
    rows: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, "es")),
  };
}

/**
 * Guarda la asistencia de un día. Hay una sola sesión por curso y fecha: guardar otra vez la misma
 * fecha la corrige, no la duplica. Si algún estudiante no está inscrito en el curso, no se guarda nada.
 */
export async function saveAttendance(actor: Actor, courseId: string, input: AttendanceInput, now = new Date()): Promise<SaveAttendanceResult> {
  const course = await manageableCourse(actor, courseId);
  if (!course) return { ok: false, message: NO_ACCESS };
  if (course.archivedAt) return { ok: false, message: "Este curso está archivado. Recupéralo antes de cambiar su asistencia." };

  const day = cleanDateKey(input.date);
  if (!day) return { ok: false, message: "Elige una fecha válida." };
  const today = zonedDateKey(now, await institutionTimeZone(actor.institutionId));
  if (day > today) return { ok: false, message: "Esa fecha todavía no llega. Solo puedes tomar asistencia de hoy o de días pasados." };

  const title = (input.title ?? "").trim();
  if (title.length > MAX_TITLE) return { ok: false, message: `El título es demasiado largo (máximo ${MAX_TITLE} letras).` };

  const entries = Array.isArray(input.entries) ? input.entries : [];
  if (!entries.length) return { ok: false, message: "No hay estudiantes inscritos para tomar asistencia." };
  if (entries.length > MAX_ENTRIES) return { ok: false, message: `Puedes guardar hasta ${MAX_ENTRIES} estudiantes a la vez.` };
  const clean = new Map<string, { status: AttendanceStatus; note: string | null }>();
  for (const entry of entries) {
    if (!entry || typeof entry.studentId !== "string" || !entry.studentId || !isStatus(entry.status) || clean.has(entry.studentId)) {
      return { ok: false, message: "La lista no se pudo leer. Recarga la página y vuelve a intentarlo." };
    }
    const note = entry.status === "PRESENT" ? "" : String(entry.note ?? "").trim();
    if (note.length > MAX_NOTE) return { ok: false, message: `Una de las notas es demasiado larga (máximo ${MAX_NOTE} letras).` };
    clean.set(entry.studentId, { status: entry.status, note: note || null });
  }
  const studentIds = [...clean.keys()];
  const date = toDbDate(day);
  const counts = zero();
  for (const entry of clean.values()) counts[KEY[entry.status]] += 1;

  try {
    return await db.$transaction(
      async (tx) => {
        const existing = await tx.attendanceSession.findFirst({
          where: { courseId: course.id, institutionId: actor.institutionId, date },
          select: { id: true, records: { select: { enrollmentId: true } } },
        });
        const enrollments = await tx.enrollment.findMany({
          where: { courseId: course.id, institutionId: actor.institutionId, studentId: { in: studentIds } },
          select: { id: true, studentId: true, status: true },
        });
        // Vale quien está inscrito activo; quien ya no lo está solo si ya tenía registro ese día.
        const recorded = new Set(existing?.records.map((record) => record.enrollmentId));
        const allowed = enrollments.filter((enrollment) => enrollment.status === "ACTIVE" || recorded.has(enrollment.id));
        if (allowed.length !== studentIds.length) {
          return { ok: false, message: "Alguien de la lista ya no está inscrito en este curso. Recarga la página y vuelve a intentarlo. No se guardó nada." } as const;
        }

        const session = existing
          ? await tx.attendanceSession.update({ where: { id: existing.id }, data: { title: title || null }, select: { id: true } })
          : await tx.attendanceSession.create({
              data: { institutionId: actor.institutionId, courseId: course.id, date, title: title || null, recordedById: actor.id },
              select: { id: true },
            });

        for (const enrollment of allowed) {
          const entry = clean.get(enrollment.studentId)!;
          await tx.attendance.upsert({
            where: { sessionId_enrollmentId: { sessionId: session.id, enrollmentId: enrollment.id } },
            create: {
              institutionId: actor.institutionId,
              courseId: course.id,
              sessionId: session.id,
              enrollmentId: enrollment.id,
              date,
              classSession: title || null,
              status: entry.status,
              notes: entry.note,
            },
            update: { status: entry.status, notes: entry.note, classSession: title || null, recordedAt: now },
          });
        }

        await tx.auditLog.create({
          data: {
            institutionId: actor.institutionId,
            userId: actor.id,
            action: existing ? "ATTENDANCE_CORRECTED" : "ATTENDANCE_TAKEN",
            entity: "AttendanceSession",
            entityId: session.id,
            changes: { courseId: course.id, date: day, students: allowed.length, ...counts },
          },
        });
        return { ok: true, sessionId: session.id, created: !existing, counts } as const;
      },
      { timeout: 20_000 },
    );
  } catch (error) {
    // Dos personas guardaron la misma fecha nueva a la vez: la segunda vuelve a intentar y corrige la primera.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, message: "Otra persona acaba de guardar la asistencia de este día. Recarga la página para verla y corregirla." };
    }
    throw error;
  }
}

/** Borra la sesión de un día con todos sus registros. */
export async function deleteAttendanceSession(actor: Actor, courseId: string, sessionId: string): Promise<DeleteSessionResult> {
  const course = await manageableCourse(actor, courseId);
  if (!course) return { ok: false, message: NO_ACCESS };
  if (course.archivedAt) return { ok: false, message: "Este curso está archivado. Recupéralo antes de cambiar su asistencia." };
  return db.$transaction(async (tx) => {
    const session = sessionId
      ? await tx.attendanceSession.findFirst({
          where: { id: sessionId, courseId: course.id, institutionId: actor.institutionId },
          select: { id: true, date: true, _count: { select: { records: true } } },
        })
      : null;
    if (!session) return { ok: false, message: "Esa asistencia ya no existe. Recarga la página." } as const;
    await tx.attendanceSession.delete({ where: { id: session.id } });
    await tx.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        userId: actor.id,
        action: "ATTENDANCE_DELETED",
        entity: "AttendanceSession",
        entityId: session.id,
        changes: { courseId: course.id, date: toKey(session.date), students: session._count.records },
      },
    });
    return { ok: true } as const;
  });
}

/** Historial de sesiones y resumen por estudiante. Devuelve null si quien actúa no gestiona el curso. */
export async function getAttendanceOverview(actor: Actor, courseId: string): Promise<AttendanceOverview | null> {
  const course = await manageableCourse(actor, courseId);
  if (!course) return null;
  const scope = { courseId: course.id, institutionId: actor.institutionId };

  const [sessions, bySession, byEnrollment, enrollments] = await Promise.all([
    db.attendanceSession.findMany({ where: scope, select: { id: true, date: true, title: true }, orderBy: { date: "desc" } }),
    db.attendance.groupBy({ by: ["sessionId", "status"], where: scope, _count: { _all: true } }),
    db.attendance.groupBy({ by: ["enrollmentId", "status"], where: scope, _count: { _all: true } }),
    db.enrollment.findMany({
      where: { ...scope, status: { not: "DROPPED" } },
      select: { id: true, studentId: true, student: { select: { name: true, email: true } } },
    }),
  ]);

  const tally = (rows: Array<{ status: string; _count: { _all: number } }>) => {
    const counts = zero();
    for (const row of rows) if (isStatus(row.status)) counts[KEY[row.status]] += row._count._all;
    return counts;
  };

  return {
    course: { id: course.id, name: course.name, archived: Boolean(course.archivedAt) },
    sessions: sessions.map((session) => {
      const counts = tally(bySession.filter((row) => row.sessionId === session.id));
      return { id: session.id, date: toKey(session.date), title: session.title ?? "", total: counts.present + counts.absent + counts.late + counts.excused, ...counts };
    }),
    students: enrollments
      .map((enrollment) => {
        const counts = tally(byEnrollment.filter((row) => row.enrollmentId === enrollment.id));
        const percent = attendancePercent(counts);
        return {
          studentId: enrollment.studentId,
          name: enrollment.student.name,
          email: enrollment.student.email,
          recorded: counts.present + counts.absent + counts.late + counts.excused,
          percent,
          low: isLow(percent),
          ...counts,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "es")),
  };
}

/** Evita que Excel lea una celda como fórmula y escapa comas, comillas y saltos de línea. */
export function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Resumen por estudiante como CSV para Excel (con BOM UTF-8). Null si no gestiona el curso. */
export async function attendanceCsv(actor: Actor, courseId: string): Promise<{ filename: string; content: string } | null> {
  const overview = await getAttendanceOverview(actor, courseId);
  if (!overview) return null;
  const rows: Array<Array<string | number>> = [
    ["Estudiante", "Correo", "Días registrados", "Presente", "Tarde", "Ausente", "Justificado", "% de asistencia"],
    ...overview.students.map((student) => [
      student.name,
      student.email,
      student.recorded,
      student.present,
      student.late,
      student.absent,
      student.excused,
      student.percent === null ? "" : student.percent,
    ]),
  ];
  const slug =
    overview.course.name
      .normalize("NFD")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "curso";
  return { filename: `asistencia-${slug}.csv`, content: `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n` };
}

/**
 * «Mi asistencia»: lo que ve un estudiante inscrito (activo o que ya terminó) en un curso publicado.
 * Solo sus propios registros; las notas internas del docente no se muestran.
 */
export async function getMyAttendance(actor: Actor, courseId: string): Promise<MyAttendance | null> {
  if (!courseId || actor.role !== "STUDENT") return null;
  const capabilities = await getEffectiveCapabilities(actor.institutionId, actor.role);
  const where = courseWhereForScope(actor.institutionId, resolveCourseReadScope(actor, capabilities));
  if (!where) return null;
  const course = await db.course.findFirst({
    where: { AND: [where, { id: courseId, institutionId: actor.institutionId, isPublished: true }] },
    select: { id: true, name: true },
  });
  if (!course) return null;

  const records = await db.attendance.findMany({
    where: {
      courseId: course.id,
      institutionId: actor.institutionId,
      enrollment: { studentId: actor.id, courseId: course.id, status: { in: ["ACTIVE", "COMPLETED"] } },
    },
    select: { status: true, session: { select: { date: true, title: true } } },
    orderBy: { session: { date: "desc" } },
  });
  const counts = zero();
  for (const record of records) counts[KEY[record.status as AttendanceStatus]] += 1;
  const percent = attendancePercent(counts);
  return {
    course,
    percent,
    low: isLow(percent),
    counts,
    days: records.map((record) => ({ date: toKey(record.session.date), title: record.session.title ?? "", status: record.status as AttendanceStatus })),
  };
}
