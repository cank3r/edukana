import "server-only";

import { Prisma } from "@prisma/client";
import type { Capability } from "@/lib/capabilities";
import { resolveCourseReadScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import { zonedDateKey } from "@/lib/timezone";
import { scopedCourseCondition, type ReportAccess } from "@/server/reports/access";
import { safeTimezone } from "@/server/student-home";
import type { EdukanaRole } from "@/types/next-auth";
import { parseRangeKey, periodProgress, resolveRange, trendWeeks, type BoardRange, type BoardWeek, type PeriodRef } from "./range";

export type BoardActor = { id: string; institutionId: string; role: EdukanaRole };

/** Qué bloques del tablero puede ver quien entra. Cada uno sale de una capacidad del rol, nunca del nombre del rol. */
export type BoardPermissions = {
  /** Estudiantes activos y nuevos. */
  students: boolean;
  /** Asistencia, avance, entregas, tendencia, cursos y estudiantes en riesgo: resultados de estudiantes. */
  results: boolean;
  /** Abrir la ficha de cada estudiante. */
  personLink: boolean;
  /** «Ver todos» lleva a la lista completa (está dentro de Reportes). */
  fullRiskList: boolean;
  /** Puede abrir Reportes: las cifras enlazan allí para ver el detalle. */
  reports: boolean;
  /** Cobros: con permiso de cobros y viendo toda la institución. */
  finance: boolean;
  /** Carga de cada docente: solo quien ve todos los cursos. */
  teachers: boolean;
  admissions: boolean;
};

export type BoardContext = {
  institutionId: string;
  institutionName: string;
  timezone: string;
  now: Date;
  /** Hoy en la zona de la institución, `AAAA-MM-DD`. */
  todayKey: string;
  period: PeriodRef | null;
  progress: ReturnType<typeof periodProgress>;
  range: BoardRange;
  weeks: BoardWeek[];
  can: BoardPermissions;
  /** Condición SQL (alias `c` de `courses`): cursos sin archivar de la institución dentro del alcance de quien mira. */
  courses: Prisma.Sql;
};

/**
 * Autoriza y prepara el tablero. Todo lo que sigue se filtra por la institución de la sesión.
 * Consultas: 2 en paralelo (institución, períodos).
 */
export async function resolveBoardContext(actor: BoardActor, capabilities: ReadonlySet<Capability>, rangeParam: string | null | undefined, now = new Date()): Promise<BoardContext> {
  const scope = resolveCourseReadScope(actor, capabilities);
  const whole = scope.kind === "all";
  const access: ReportAccess = {
    institutionId: actor.institutionId,
    scope: scope.kind === "all" ? { kind: "all" } : scope.kind === "teacher" ? { kind: "teacher", teacherId: scope.teacherId } : { kind: "none" },
    canSeeFinance: whole && capabilities.has("finance.manage"),
    canSeeAccess: whole,
  };

  const [institution, activePeriod] = await Promise.all([
    db.institution.findUnique({ where: { id: actor.institutionId }, select: { name: true, timezone: true } }),
    // Si hay varios períodos activos, cuenta el que termina más tarde (igual que el resto del inicio).
    db.academicPeriod.findFirst({
      where: { institutionId: actor.institutionId, isActive: true },
      orderBy: { endDate: "desc" },
      select: { id: true, name: true, startDate: true, endDate: true },
    }),
  ]);
  const previousPeriod = activePeriod
    ? await db.academicPeriod.findFirst({
        where: { institutionId: actor.institutionId, id: { not: activePeriod.id }, startDate: { lt: activePeriod.startDate } },
        orderBy: { startDate: "desc" },
        select: { id: true, name: true, startDate: true, endDate: true },
      })
    : null;

  const timezone = safeTimezone(institution?.timezone);
  const key = parseRangeKey(rangeParam, Boolean(activePeriod));
  const results = scope.kind !== "none" && capabilities.has("course.roster.view");
  return {
    institutionId: actor.institutionId,
    institutionName: institution?.name ?? "",
    timezone,
    now,
    todayKey: zonedDateKey(now, timezone),
    period: activePeriod,
    progress: periodProgress(activePeriod, now),
    range: resolveRange(key, now, timezone, activePeriod, previousPeriod),
    weeks: trendWeeks(now, timezone),
    can: {
      students: scope.kind !== "none" && (capabilities.has("people.view") || capabilities.has("course.roster.view")),
      results,
      personLink: capabilities.has("people.view"),
      fullRiskList: results && whole && capabilities.has("analytics.view"),
      reports: capabilities.has("analytics.view"),
      finance: access.canSeeFinance,
      teachers: whole && capabilities.has("course.view.all"),
      admissions: capabilities.has("admissions.manage"),
    },
    courses: scopedCourseCondition(access, { periodId: null, programId: null }),
  };
}

// ---------- Piezas SQL comunes ----------

/** Las columnas de fecha guardan hora UTC sin zona: se compara contra el mismo formato. */
export const ts = (date: Date) => Prisma.sql`${date.toISOString()}::text::timestamp`;
export const day = (key: string) => Prisma.sql`${key}::text::date`;

/** Tabla en línea con las semanas de la tendencia: (i, s, e) en instantes y (i, sk, ek) en días. */
export function weeksTable(weeks: BoardWeek[]): Prisma.Sql {
  const rows = weeks.map((week) => Prisma.sql`(${week.index}::int, ${ts(week.start)}, ${ts(week.end)}, ${day(week.startKey)}, ${day(week.endKey)})`);
  return Prisma.sql`(VALUES ${Prisma.join(rows)}) AS w(i, s, e, sk, ek)`;
}

/** Ordena la serie por semana y rellena con ceros las que no tienen filas. */
export function bySeries<Row extends { i: number }>(weeks: BoardWeek[], rows: Row[], empty: Omit<Row, "i">): Row[] {
  const found = new Map(rows.map((row) => [Number(row.i), row]));
  return weeks.map((week) => found.get(week.index) ?? ({ ...empty, i: week.index } as Row));
}
