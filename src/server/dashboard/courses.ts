import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { day, ts, type BoardContext } from "./context";
import { PASSING_GRADE_PERCENT, RISK_ATTENDANCE_PERCENT } from "./risk";

/**
 * Salud de cada curso sin archivar del alcance, y carga de cada docente.
 * Consultas: cursos 1 · docentes 1. Ninguna trae filas de estudiantes: todo se agrupa por curso en la base.
 */

export const LOW_COURSE_PROGRESS = 40;
/** Días sin lecciones nuevas, asistencia ni calificaciones para decir que un curso no tiene actividad. */
export const QUIET_DAYS = 14;
const DAY_MS = 24 * 60 * 60_000;

export const COURSE_SORT_KEYS = ["atencion", "nombre", "inscritos", "avance", "asistencia", "nota", "porCalificar"] as const;
export type CourseSortKey = (typeof COURSE_SORT_KEYS)[number];

export type CourseHealth = {
  id: string;
  name: string;
  teacherName: string;
  enrolled: number;
  averageProgress: number | null;
  /** Asistencia en la ventana elegida; null si no hay clases registradas. */
  attendance: number | null;
  averageGrade: number | null;
  /** Entregas y exámenes que esperan calificación. */
  pendingGrading: number;
  /** Señales de atención: asistencia baja, notas bajas, avance bajo, pendientes por calificar o sin inscritos. */
  attention: number;
};

export function parseCourseSort(value: string | null | undefined): CourseSortKey {
  return COURSE_SORT_KEYS.find((key) => key === value) ?? "atencion";
}

export async function getCourseHealth(ctx: BoardContext, options: { sort?: CourseSortKey; limit: number }): Promise<{ total: number; rows: CourseHealth[] }> {
  if (!ctx.can.results) return { total: 0, rows: [] };
  const iid = ctx.institutionId;
  // Las expresiones de orden salen de esta lista fija, nunca de la URL.
  const orders: Record<CourseSortKey, string> = {
    atencion: `attention DESC, "pendingGrading" DESC, c.name ASC`,
    nombre: `c.name ASC`,
    inscritos: `enrolled DESC, c.name ASC`,
    avance: `"averageProgress" ASC NULLS LAST, c.name ASC`,
    asistencia: `attendance ASC NULLS LAST, c.name ASC`,
    nota: `"averageGrade" ASC NULLS LAST, c.name ASC`,
    porCalificar: `"pendingGrading" DESC, c.name ASC`,
  };
  const rows = await db.$queryRaw<Array<CourseHealth & { total: number }>>(Prisma.sql`
    WITH scoped AS (SELECT c.id FROM courses c WHERE ${ctx.courses}),
    e AS (
      SELECT "courseId", COUNT(*) AS enrolled, AVG("progressPercent") AS progress
      FROM enrollments WHERE "courseId" IN (SELECT id FROM scoped) AND status IN ('ACTIVE', 'COMPLETED') GROUP BY "courseId"
    ),
    att AS (
      SELECT "courseId", COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE')) AS ok, COUNT(*) FILTER (WHERE status <> 'EXCUSED') AS total
      FROM attendances
      WHERE "institutionId" = ${iid} AND "courseId" IN (SELECT id FROM scoped) AND date >= ${day(ctx.range.fromKey)} AND date <= ${day(ctx.range.toKey)}
      GROUP BY "courseId"
    ),
    g AS (
      SELECT gi."courseId", AVG(ge.score / NULLIF(gi."maxScore", 0) * 100) AS grade
      FROM grade_entries ge JOIN grade_items gi ON gi.id = ge."gradeItemId"
      WHERE ge."institutionId" = ${iid} AND ge.score IS NOT NULL AND NOT ge."isExcused" AND gi."courseId" IN (SELECT id FROM scoped)
      GROUP BY gi."courseId"
    ),
    p AS (
      SELECT "courseId", SUM(n) AS pending FROM (
        SELECT a."courseId", COUNT(*) AS n FROM submissions sb JOIN assignments a ON a.id = sb."assignmentId"
        WHERE sb.status = 'SUBMITTED' AND a."courseId" IN (SELECT id FROM scoped) GROUP BY a."courseId"
        UNION ALL
        SELECT x."courseId", COUNT(*) AS n FROM exam_attempts ea JOIN exams x ON x.id = ea."examId"
        WHERE ea."institutionId" = ${iid} AND ea.status = 'SUBMITTED' AND x."courseId" IN (SELECT id FROM scoped) GROUP BY x."courseId"
      ) both_kinds GROUP BY "courseId"
    ),
    course_rows AS (
      SELECT c.id, c.name, u.name AS "teacherName",
        COALESCE(e.enrolled, 0)::int AS enrolled,
        e.progress::float8 AS "averageProgress",
        (CASE WHEN att.total > 0 THEN att.ok::float8 / att.total * 100 END)::float8 AS attendance,
        g.grade::float8 AS "averageGrade",
        COALESCE(p.pending, 0)::int AS "pendingGrading"
      FROM courses c
      JOIN users u ON u.id = c."teacherId"
      LEFT JOIN e ON e."courseId" = c.id
      LEFT JOIN att ON att."courseId" = c.id
      LEFT JOIN g ON g."courseId" = c.id
      LEFT JOIN p ON p."courseId" = c.id
      WHERE c.id IN (SELECT id FROM scoped)
    )
    SELECT c.*,
      (
        (c.enrolled = 0)::int
        + (c.attendance IS NOT NULL AND c.attendance < ${RISK_ATTENDANCE_PERCENT}::float8)::int
        + (c."averageGrade" IS NOT NULL AND c."averageGrade" < ${PASSING_GRADE_PERCENT}::float8)::int
        + (c.enrolled > 0 AND COALESCE(c."averageProgress", 0) < ${LOW_COURSE_PROGRESS}::float8)::int
        + (c."pendingGrading" > 0)::int
      )::int AS attention,
      (COUNT(*) OVER ())::int AS total
    FROM course_rows c
    ORDER BY ${Prisma.raw(orders[options.sort ?? "atencion"])}, c.id ASC
    LIMIT ${options.limit}
  `);
  return { total: rows[0]?.total ?? 0, rows: rows.map((row) => ({ id: row.id, name: row.name, teacherName: row.teacherName, enrolled: row.enrolled, averageProgress: row.averageProgress, attendance: row.attendance, averageGrade: row.averageGrade, pendingGrading: row.pendingGrading, attention: row.attention })) };
}

export type QuietCourse = { id: string; name: string };
export type TeacherLoad = { id: string; name: string; courses: number; pendingGrading: number; oldestPendingAt: Date | null; quiet: QuietCourse[] };

/**
 * Por docente: cursos, entregas y exámenes por calificar, la espera más larga y los cursos sin actividad
 * (sin lecciones nuevas, asistencia ni calificaciones) en los últimos `QUIET_DAYS` días. Un curso creado
 * hace menos de `QUIET_DAYS` días todavía no se considera sin actividad.
 */
export async function getTeacherLoad(ctx: BoardContext, options: { limit: number }): Promise<{ total: number; rows: TeacherLoad[] }> {
  if (!ctx.can.teachers) return { total: 0, rows: [] };
  const iid = ctx.institutionId;
  const since = new Date(ctx.now.getTime() - QUIET_DAYS * DAY_MS);
  const sinceKey = since.toISOString().slice(0, 10);
  const rows = await db.$queryRaw<Array<Omit<TeacherLoad, "quiet"> & { quiet: Array<{ id: string; name: string }> | null; total: number }>>(Prisma.sql`
    WITH scoped AS (SELECT c.id, c."teacherId", c.name, c."createdAt" FROM courses c WHERE ${ctx.courses}),
    pending AS (
      SELECT "courseId", COUNT(*) AS n, MIN(waited_at) AS oldest FROM (
        SELECT a."courseId", sb."submittedAt" AS waited_at FROM submissions sb JOIN assignments a ON a.id = sb."assignmentId"
        WHERE sb.status = 'SUBMITTED' AND a."courseId" IN (SELECT id FROM scoped)
        UNION ALL
        SELECT x."courseId", COALESCE(ea."submittedAt", ea."startedAt") AS waited_at FROM exam_attempts ea JOIN exams x ON x.id = ea."examId"
        WHERE ea."institutionId" = ${iid} AND ea.status = 'SUBMITTED' AND x."courseId" IN (SELECT id FROM scoped)
      ) waiting GROUP BY "courseId"
    ),
    active AS (
      SELECT "courseId" FROM lessons WHERE "institutionId" = ${iid} AND "courseId" IN (SELECT id FROM scoped) AND "createdAt" >= ${ts(since)}
      UNION SELECT "courseId" FROM attendance_sessions WHERE "institutionId" = ${iid} AND "courseId" IN (SELECT id FROM scoped) AND date >= ${day(sinceKey)}
      UNION SELECT gi."courseId" FROM grade_entries ge JOIN grade_items gi ON gi.id = ge."gradeItemId"
        WHERE ge."institutionId" = ${iid} AND gi."courseId" IN (SELECT id FROM scoped) AND ge."gradedAt" >= ${ts(since)}
      UNION SELECT a."courseId" FROM submissions sb JOIN assignments a ON a.id = sb."assignmentId"
        WHERE a."courseId" IN (SELECT id FROM scoped) AND sb."gradedAt" >= ${ts(since)}
    ),
    marked AS (
      SELECT s.*, (s.id NOT IN (SELECT "courseId" FROM active) AND s."createdAt" < ${ts(since)}) AS is_quiet FROM scoped s
    ),
    per AS (
      SELECT s."teacherId",
        COUNT(*)::int AS courses,
        COALESCE(SUM(pending.n), 0)::int AS "pendingGrading",
        MIN(pending.oldest) AS "oldestPendingAt",
        JSON_AGG(JSON_BUILD_OBJECT('id', s.id, 'name', s.name) ORDER BY s.name) FILTER (WHERE s.is_quiet) AS quiet
      FROM marked s LEFT JOIN pending ON pending."courseId" = s.id
      GROUP BY s."teacherId"
    )
    SELECT u.id, u.name, per.courses, per."pendingGrading", per."oldestPendingAt", per.quiet, (COUNT(*) OVER ())::int AS total
    FROM per JOIN users u ON u.id = per."teacherId" AND u."institutionId" = ${iid}
    ORDER BY per."pendingGrading" DESC, JSON_ARRAY_LENGTH(COALESCE(per.quiet, '[]'::json)) DESC, u.name ASC, u.id ASC
    LIMIT ${options.limit}
  `);
  return { total: rows[0]?.total ?? 0, rows: rows.map((row) => ({ id: row.id, name: row.name, courses: row.courses, pendingGrading: row.pendingGrading, oldestPendingAt: row.oldestPendingAt, quiet: row.quiet ?? [] })) };
}
