import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { day, ts, type BoardContext } from "./context";
import { formatPercent } from "./format";

/**
 * Estudiantes en riesgo: quienes reúnen más señales de alerta en sus cursos activos.
 *
 * Señales (cada una suma 1):
 * - Asistencia menor de 80 % en la ventana elegida (con al menos una clase registrada).
 * - 2 o más tareas vencidas sin entregar.
 * - Nota promedio por debajo de 70 de 100 en algún curso (los cursos no guardan su propia nota de aprobación).
 * - Avance menor que la mitad del promedio de su grupo en algún curso con 3 o más inscritos (la regla de Reportes).
 * - Cargos vencidos sin pagar (solo si quien mira tiene permiso de cobros).
 *
 * Consultas: 1. Cada tabla grande se recorre una sola vez, agrupada por inscripción.
 */

export const RISK_ATTENDANCE_PERCENT = 80;
export const RISK_OVERDUE_TASKS = 2;
export const PASSING_GRADE_PERCENT = 70;
export const RISK_SIGNALS = ["asistencia", "tareas", "notas", "avance", "cobros"] as const;
export type RiskSignal = (typeof RISK_SIGNALS)[number];

export type RiskStudent = {
  studentId: string;
  name: string;
  courses: number;
  attended: number;
  classes: number;
  overdueTasks: number;
  /** Nota promedio más baja entre sus cursos (0 a 100); null si no tiene notas. */
  lowestGrade: number | null;
  lowestGradeCourse: string | null;
  averageProgress: number;
  overdueCharges: number;
  signals: RiskSignal[];
};
export type RiskList = { total: number; counts: Record<RiskSignal, number>; rows: RiskStudent[] };

export function parseRiskSignal(value: string | null | undefined): RiskSignal | null {
  return RISK_SIGNALS.find((signal) => signal === value) ?? null;
}

type Row = Omit<RiskStudent, "signals"> & {
  lowAttendance: boolean;
  manyOverdue: boolean;
  lowGrade: boolean;
  lowProgress: boolean;
  owes: boolean;
  total: number;
  nAsistencia: number;
  nTareas: number;
  nNotas: number;
  nAvance: number;
  nCobros: number;
};

export async function getAtRiskStudents(ctx: BoardContext, options: { limit: number; offset?: number; signal?: RiskSignal | null }): Promise<RiskList> {
  const empty: RiskList = { total: 0, counts: { asistencia: 0, tareas: 0, notas: 0, avance: 0, cobros: 0 }, rows: [] };
  if (!ctx.can.results) return empty;
  const iid = ctx.institutionId;
  const { range } = ctx;
  const finance = ctx.can.finance;
  const filter: Record<RiskSignal, Prisma.Sql> = {
    asistencia: Prisma.sql`f."lowAttendance"`,
    tareas: Prisma.sql`f."manyOverdue"`,
    notas: Prisma.sql`f."lowGrade"`,
    avance: Prisma.sql`f."lowProgress"`,
    cobros: Prisma.sql`f.owes`,
  };
  const signalFilter = options.signal && (options.signal !== "cobros" || finance) ? Prisma.sql`AND ${filter[options.signal]}` : Prisma.empty;

  const rows = await db.$queryRaw<Row[]>(Prisma.sql`
    WITH scoped AS (SELECT c.id FROM courses c WHERE ${ctx.courses}),
    enr AS (
      SELECT e.id, e."studentId", e."courseId", e."progressPercent" AS progress, e."enrolledAt"
      FROM enrollments e JOIN users u ON u.id = e."studentId"
      WHERE e.status = 'ACTIVE' AND e."courseId" IN (SELECT id FROM scoped) AND u.status = 'ACTIVE' AND u."institutionId" = ${iid}
    ),
    course_avg AS (SELECT "courseId", AVG(progress) AS mean, COUNT(*) AS n FROM enr GROUP BY "courseId"),
    attended AS (
      SELECT "enrollmentId",
        COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE')) AS ok,
        COUNT(*) FILTER (WHERE status <> 'EXCUSED') AS total
      FROM attendances
      WHERE "institutionId" = ${iid} AND "enrollmentId" IN (SELECT id FROM enr)
        AND date >= ${day(range.fromKey)} AND date <= ${day(range.toKey)}
      GROUP BY "enrollmentId"
    ),
    overdue AS (
      SELECT enr.id AS "enrollmentId", COUNT(*) AS n
      FROM enr
      JOIN assignments a ON a."courseId" = enr."courseId" AND a."isPublished" AND a."dueDate" < ${ts(ctx.now)} AND a."dueDate" >= enr."enrolledAt"
      LEFT JOIN submissions s ON s."assignmentId" = a.id AND s."studentId" = enr."studentId" AND s.status <> 'DRAFT'
      WHERE s.id IS NULL GROUP BY enr.id
    ),
    grades AS (
      SELECT ge."enrollmentId", AVG(ge.score / NULLIF(gi."maxScore", 0) * 100) AS grade
      FROM grade_entries ge JOIN grade_items gi ON gi.id = ge."gradeItemId"
      WHERE ge."institutionId" = ${iid} AND ge."enrollmentId" IN (SELECT id FROM enr) AND ge.score IS NOT NULL AND NOT ge."isExcused"
      GROUP BY ge."enrollmentId"
    ),
    charges AS (
      ${
        finance
          ? Prisma.sql`SELECT pc."studentId", COUNT(*) AS n FROM payment_concepts pc
              WHERE pc."institutionId" = ${iid} AND pc."studentId" IN (SELECT "studentId" FROM enr)
                AND (pc.status = 'OVERDUE' OR (pc.status IN ('PENDING', 'PARTIAL') AND pc."dueDate" IS NOT NULL AND to_char(pc."dueDate", 'YYYY-MM-DD') < ${ctx.todayKey}))
              GROUP BY pc."studentId"`
          : Prisma.sql`SELECT NULL::text AS "studentId", 0::bigint AS n WHERE FALSE`
      }
    ),
    per AS (
      SELECT enr."studentId",
        COUNT(*)::int AS courses,
        AVG(enr.progress)::float8 AS "averageProgress",
        COALESCE(BOOL_OR(course_avg.n >= 3 AND enr.progress < course_avg.mean / 2), FALSE) AS "lowProgress",
        COALESCE(SUM(attended.ok), 0)::int AS attended,
        COALESCE(SUM(attended.total), 0)::int AS classes,
        COALESCE(SUM(overdue.n), 0)::int AS "overdueTasks",
        MIN(grades.grade)::float8 AS "lowestGrade",
        (ARRAY_AGG(enr."courseId" ORDER BY grades.grade ASC NULLS LAST))[1] AS "lowestGradeCourseId"
      FROM enr
      JOIN course_avg ON course_avg."courseId" = enr."courseId"
      LEFT JOIN attended ON attended."enrollmentId" = enr.id
      LEFT JOIN overdue ON overdue."enrollmentId" = enr.id
      LEFT JOIN grades ON grades."enrollmentId" = enr.id
      GROUP BY enr."studentId"
    ),
    flagged AS (
      SELECT per.*,
        COALESCE(charges.n, 0)::int AS "overdueCharges",
        (per.classes > 0 AND per.attended::float8 / per.classes < ${RISK_ATTENDANCE_PERCENT / 100}::float8) AS "lowAttendance",
        (per."overdueTasks" >= ${RISK_OVERDUE_TASKS}) AS "manyOverdue",
        (per."lowestGrade" IS NOT NULL AND per."lowestGrade" < ${PASSING_GRADE_PERCENT}::float8) AS "lowGrade",
        (COALESCE(charges.n, 0) > 0) AS owes
      FROM per LEFT JOIN charges ON charges."studentId" = per."studentId"
    ),
    hits AS (
      SELECT f.*, (f."lowAttendance"::int + f."manyOverdue"::int + f."lowGrade"::int + f."lowProgress"::int + f.owes::int) AS reasons
      FROM flagged f
      WHERE f."lowAttendance" OR f."manyOverdue" OR f."lowGrade" OR f."lowProgress" OR f.owes
    ),
    -- Los totales por señal cuentan a todos, antes del filtro y de la página.
    counted AS (
      SELECT hits.*,
        (SUM(hits."lowAttendance"::int) OVER ())::int AS "nAsistencia",
        (SUM(hits."manyOverdue"::int) OVER ())::int AS "nTareas",
        (SUM(hits."lowGrade"::int) OVER ())::int AS "nNotas",
        (SUM(hits."lowProgress"::int) OVER ())::int AS "nAvance",
        (SUM(hits.owes::int) OVER ())::int AS "nCobros"
      FROM hits
    )
    SELECT f."studentId", u.name, f.courses, f.attended, f.classes, f."overdueTasks", f."lowestGrade", c.name AS "lowestGradeCourse",
      f."averageProgress", f."overdueCharges", f."lowAttendance", f."manyOverdue", f."lowGrade", f."lowProgress", f.owes,
      (COUNT(*) OVER ())::int AS total,
      f."nAsistencia", f."nTareas", f."nNotas", f."nAvance", f."nCobros"
    FROM counted f
    JOIN users u ON u.id = f."studentId"
    LEFT JOIN courses c ON c.id = f."lowestGradeCourseId" AND f."lowestGrade" IS NOT NULL
    WHERE TRUE ${signalFilter}
    ORDER BY f.reasons DESC,
      (CASE WHEN f.classes > 0 THEN f.attended::float8 / f.classes ELSE 1 END) ASC,
      f."overdueTasks" DESC, u.name ASC, f."studentId" ASC
    LIMIT ${options.limit} OFFSET ${options.offset ?? 0}
  `);

  const first = rows[0];
  if (!first) {
    // Con un filtro sin resultados, los totales por señal salen de una lista vacía: se piden sin filtro.
    if (options.signal) {
      const all = await getAtRiskStudents(ctx, { limit: 1 });
      return { ...empty, counts: all.counts };
    }
    return empty;
  }
  return {
    total: first.total,
    counts: { asistencia: first.nAsistencia, tareas: first.nTareas, notas: first.nNotas, avance: first.nAvance, cobros: first.nCobros },
    rows: rows.map((row) => ({
      studentId: row.studentId,
      name: row.name,
      courses: row.courses,
      attended: row.attended,
      classes: row.classes,
      overdueTasks: row.overdueTasks,
      lowestGrade: row.lowestGrade,
      lowestGradeCourse: row.lowestGradeCourse,
      averageProgress: row.averageProgress,
      overdueCharges: row.overdueCharges,
      signals: [
        ...(row.lowAttendance ? (["asistencia"] as const) : []),
        ...(row.manyOverdue ? (["tareas"] as const) : []),
        ...(row.lowGrade ? (["notas"] as const) : []),
        ...(row.lowProgress ? (["avance"] as const) : []),
        ...(row.owes ? (["cobros"] as const) : []),
      ],
    })),
  };
}

/** La señal en palabras cortas, para las etiquetas. */
export function riskSignalLabel(signal: RiskSignal, row: RiskStudent): string {
  switch (signal) {
    case "asistencia":
      return `Asistencia ${formatPercent((row.attended / Math.max(1, row.classes)) * 100)}`;
    case "tareas":
      return `${row.overdueTasks} tareas vencidas`;
    case "notas":
      return `Nota ${Math.round(row.lowestGrade ?? 0)} de 100${row.lowestGradeCourse ? ` en ${row.lowestGradeCourse}` : ""}`;
    case "avance":
      return `Avance ${formatPercent(row.averageProgress)}, muy por debajo de su grupo`;
    case "cobros":
      return row.overdueCharges === 1 ? "1 cargo vencido" : `${row.overdueCharges} cargos vencidos`;
  }
}

/** Nombre de cada señal para los filtros. */
export const RISK_SIGNAL_NAMES: Record<RiskSignal, string> = {
  asistencia: `Asistencia menor de ${RISK_ATTENDANCE_PERCENT} %`,
  tareas: `${RISK_OVERDUE_TASKS} o más tareas vencidas`,
  notas: `Nota por debajo de ${PASSING_GRADE_PERCENT}`,
  avance: "Avance muy bajo",
  cobros: "Cargos vencidos",
};
