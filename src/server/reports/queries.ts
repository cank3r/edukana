import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { chargeBalances } from "@/server/finance/charges";
import { scopedCourseCondition, type ReportAccess, type ReportFilters } from "./access";

/**
 * Reportes para la dirección. Todas las cifras se calculan en la base (COUNT / AVG / SUM agrupados);
 * nunca se traen filas para sumarlas en memoria, salvo lo pagado de los cobros (ver `getFinanceSummary`). Cada función dice cuántas consultas hace.
 * Todo parte de `scopedCourseCondition`: institución de quien mira + su alcance de cursos + filtros.
 */

export const LOW_PROGRESS_PERCENT = 40;
export const INACTIVITY_DAYS = 14;
export const LOW_ATTENDANCE_PERCENT = 80;
export const PAGE_ROWS = 50;
export const EXPORT_ROWS = 5000;

const DAY_MS = 24 * 60 * 60_000;
const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * DAY_MS);
/** Las columnas de fecha guardan hora UTC sin zona: se compara contra el mismo formato, sin depender de la zona de la conexión. */
const ts = (date: Date) => Prisma.sql`${date.toISOString()}::text::timestamp`;
const day = (date: Date) => Prisma.sql`${date.toISOString().slice(0, 10)}::text::date`;
const percent = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null);

// ---------- Orden por enlaces ----------

export type SortSpec<K extends string> = { key: K; desc: boolean };

/** Lee `avance` o `-avance` (descendente) de la URL; cualquier otro valor cae en el orden por defecto. */
export function parseSort<K extends string>(value: string | null | undefined, allowed: readonly K[], fallback: SortSpec<K>): SortSpec<K> {
  if (!value) return fallback;
  const desc = value.startsWith("-");
  const key = (desc ? value.slice(1) : value) as K;
  return allowed.includes(key) ? { key, desc } : fallback;
}

/** La expresión sale siempre de una lista fija escrita aquí, nunca de la URL. */
function orderBy<K extends string>(sort: SortSpec<K>, columns: Record<K, string>, tieBreak: string): Prisma.Sql {
  return Prisma.raw(`ORDER BY ${columns[sort.key]} ${sort.desc ? "DESC" : "ASC"} NULLS LAST, ${tieBreak} ASC`);
}

/** Quita la columna auxiliar `total` (el conteo de la ventana) de cada fila. */
function strip<Row extends { total: number }>(row: Row): Omit<Row, "total"> {
  const copy: Partial<Row> = { ...row };
  delete copy.total;
  return copy as Omit<Row, "total">;
}

// ---------- Cifras de arriba ----------

export type Compared = { value: number; before: number };
export type FinanceSummary = {
  collectedCents: number;
  pendingCents: number;
  overdueCents: number;
  collectedLast30Cents: number;
  collectedBefore30Cents: number;
  currency: string;
  mixedCurrencies: boolean;
};
export type Overview = {
  activeStudents: Compared;
  runningCourses: Compared;
  averageProgress: number | null;
  onTime: { percent: number | null; expected: number; beforePercent: number | null };
  attendance: { percent: number | null; records: number; beforePercent: number | null };
  /** null cuando quien mira no tiene permiso de cobros: la consulta ni siquiera se hace. */
  finance: FinanceSummary | null;
};

/**
 * Cifras grandes, cada una comparada con la situación de hace 30 días cuando se puede calcular.
 * Consultas: 3 en paralelo (inscripciones y cursos · tareas a tiempo · asistencia) + 1 de cobros solo con permiso.
 */
export async function getOverview(access: ReportAccess, filters: ReportFilters, now = new Date()): Promise<Overview> {
  const scoped = scopedCourseCondition(access, filters);
  const scopedWithArchived = scopedCourseCondition(access, filters, { includeArchived: true });
  const d30 = daysAgo(now, 30);
  const d60 = daysAgo(now, 60);

  const [[people], [tasks], [attendance], finance] = await Promise.all([
    db.$queryRaw<Array<{ activeStudents: number; activeStudentsBefore: number; averageProgress: number | null; runningCourses: number; runningCoursesBefore: number }>>(Prisma.sql`
      WITH scoped AS (SELECT c.id FROM courses c WHERE ${scoped})
      SELECT
        (SELECT COUNT(DISTINCT e."studentId") FROM enrollments e JOIN users u ON u.id = e."studentId"
          WHERE e."courseId" IN (SELECT id FROM scoped) AND e.status = 'ACTIVE' AND u.status = 'ACTIVE')::int AS "activeStudents",
        (SELECT COUNT(DISTINCT e."studentId") FROM enrollments e
          WHERE e."courseId" IN (SELECT id FROM scoped) AND e."enrolledAt" < ${ts(d30)}
            AND (e.status = 'ACTIVE' OR e."withdrawnAt" >= ${ts(d30)} OR e."completedAt" >= ${ts(d30)}))::int AS "activeStudentsBefore",
        (SELECT AVG(e."progressPercent") FROM enrollments e JOIN users u ON u.id = e."studentId"
          WHERE e."courseId" IN (SELECT id FROM scoped) AND e.status = 'ACTIVE' AND u.status = 'ACTIVE')::float8 AS "averageProgress",
        (SELECT COUNT(*) FROM courses c WHERE ${scoped} AND c."isPublished")::int AS "runningCourses",
        (SELECT COUNT(*) FROM courses c WHERE ${scopedWithArchived} AND c."isPublished" AND c."createdAt" < ${ts(d30)}
            AND (c."archivedAt" IS NULL OR c."archivedAt" >= ${ts(d30)}))::int AS "runningCoursesBefore"
    `),
    // Tareas que vencieron en los últimos 60 días: una fila esperada por cada estudiante que ya estaba inscrito al vencer.
    db.$queryRaw<Array<{ expected: number; onTime: number; expectedBefore: number; onTimeBefore: number }>>(Prisma.sql`
      WITH scoped AS (SELECT c.id FROM courses c WHERE ${scoped})
      SELECT
        COUNT(*) FILTER (WHERE a."dueDate" >= ${ts(d30)})::int AS expected,
        COUNT(s.id) FILTER (WHERE a."dueDate" >= ${ts(d30)} AND s."submittedAt" <= a."dueDate")::int AS "onTime",
        COUNT(*) FILTER (WHERE a."dueDate" < ${ts(d30)})::int AS "expectedBefore",
        COUNT(s.id) FILTER (WHERE a."dueDate" < ${ts(d30)} AND s."submittedAt" <= a."dueDate")::int AS "onTimeBefore"
      FROM assignments a
      JOIN enrollments e ON e."courseId" = a."courseId" AND e.status IN ('ACTIVE', 'COMPLETED') AND e."enrolledAt" <= a."dueDate"
      LEFT JOIN submissions s ON s."assignmentId" = a.id AND s."studentId" = e."studentId" AND s.status <> 'DRAFT'
      WHERE a."courseId" IN (SELECT id FROM scoped) AND a."isPublished"
        AND a."dueDate" >= ${ts(d60)} AND a."dueDate" < ${ts(now)}
    `),
    // Asistencia: presentes y tardanzas cuentan como asistencia; las ausencias justificadas no entran en la cuenta.
    db.$queryRaw<Array<{ present: number; total: number; presentBefore: number; totalBefore: number }>>(Prisma.sql`
      WITH scoped AS (SELECT c.id FROM courses c WHERE ${scoped})
      SELECT
        COUNT(*) FILTER (WHERE a.date >= ${day(d30)} AND a.status IN ('PRESENT', 'LATE'))::int AS present,
        COUNT(*) FILTER (WHERE a.date >= ${day(d30)} AND a.status <> 'EXCUSED')::int AS total,
        COUNT(*) FILTER (WHERE a.date < ${day(d30)} AND a.status IN ('PRESENT', 'LATE'))::int AS "presentBefore",
        COUNT(*) FILTER (WHERE a.date < ${day(d30)} AND a.status <> 'EXCUSED')::int AS "totalBefore"
      FROM attendances a
      WHERE a."institutionId" = ${access.institutionId} AND a."courseId" IN (SELECT id FROM scoped)
        AND a.date >= ${day(d60)} AND a.date <= ${day(now)}
    `),
    getFinanceSummary(access, filters, now),
  ]);

  return {
    activeStudents: { value: people.activeStudents, before: people.activeStudentsBefore },
    runningCourses: { value: people.runningCourses, before: people.runningCoursesBefore },
    averageProgress: people.averageProgress,
    onTime: { percent: percent(tasks.onTime, tasks.expected), expected: tasks.expected, beforePercent: percent(tasks.onTimeBefore, tasks.expectedBefore) },
    attendance: { percent: percent(attendance.present, attendance.total), records: attendance.total, beforePercent: percent(attendance.presentBefore, attendance.totalBefore) },
    finance,
  };
}

/**
 * Cobrado y por cobrar, en centavos. Sin permiso de cobros devuelve null sin consultar.
 * Los cobros no pertenecen a un curso: respetan el filtro de período, no el de programa.
 *
 * Excepción a «todo se suma en la base»: lo pagado sale de `chargeBalances` (pagos reales no anulados,
 * con respaldo para pagos antiguos), la misma función que usan Cobros, el portal y el estado de cuenta
 * del hijo, para que todas las pantallas den la misma cifra. «Cobrado» es el dinero recibido (también el
 * de un cargo anulado después); «por cobrar» y «vencido» son saldos de cargos no anulados.
 * Consultas: 1 + las de `chargeBalances` (4).
 */
export async function getFinanceSummary(access: ReportAccess, filters: ReportFilters, now = new Date()): Promise<FinanceSummary | null> {
  if (!access.canSeeFinance) return null;
  const charges = await db.paymentConcept.findMany({
    where: { institutionId: access.institutionId, ...(filters.periodId ? { periodId: filters.periodId } : {}) },
    select: { id: true },
  });
  const balances = await chargeBalances(access.institutionId, charges.map((charge) => charge.id), now);
  const from30 = daysAgo(now, 30).toISOString().slice(0, 10);
  const from60 = daysAgo(now, 60).toISOString().slice(0, 10);
  const summary = { collectedCents: 0, pendingCents: 0, overdueCents: 0, collectedLast30Cents: 0, collectedBefore30Cents: 0 };
  const currencies = new Set<string>();
  for (const balance of balances.values()) {
    summary.collectedCents += balance.paidCents;
    for (const entry of balance.received) {
      if (entry.paidOn >= from30) summary.collectedLast30Cents += entry.amountCents;
      else if (entry.paidOn >= from60) summary.collectedBefore30Cents += entry.amountCents;
    }
    if (balance.status === "CANCELLED") continue;
    currencies.add(balance.currency);
    summary.pendingCents += balance.balanceCents;
    if (balance.shownStatus === "OVERDUE") summary.overdueCents += balance.balanceCents;
  }
  return { ...summary, currency: [...currencies].sort()[0] ?? "DOP", mixedCurrencies: currencies.size > 1 };
}

// ---------- Cursos ----------

export const COURSE_SORTS = ["nombre", "inscritos", "retirados", "avance", "porCalificar", "nota"] as const;
export type CourseSort = (typeof COURSE_SORTS)[number];
export type CourseReportRow = {
  id: string;
  name: string;
  code: string | null;
  teacherName: string;
  enrolled: number;
  withdrawn: number;
  averageProgress: number | null;
  pendingGrading: number;
  /** Promedio de las notas puestas, llevado a escala de 0 a 100. */
  averageGrade: number | null;
  lowProgress: boolean;
};
export type Listed<Row> = { rows: Row[]; total: number };
export type RiskCounts = { inactive: number; lowProgress: number; lowAttendance: number; overdue: number };

/**
 * Una fila por curso: inscritos, retirados, avance promedio, entregas por calificar y nota promedio.
 * Consultas: 1 (tres agregados agrupados por curso, unidos a la lista de cursos).
 */
export async function getCourseReport(
  access: ReportAccess,
  filters: ReportFilters,
  options: { sort?: SortSpec<CourseSort>; limit?: number } = {},
): Promise<Listed<CourseReportRow>> {
  const sort = options.sort ?? { key: "avance", desc: false };
  const order = orderBy(sort, { nombre: "c.name", inscritos: "enrolled", retirados: "withdrawn", avance: `"averageProgress"`, porCalificar: `"pendingGrading"`, nota: `"averageGrade"` }, "c.name");
  const rows = await db.$queryRaw<Array<Omit<CourseReportRow, "lowProgress"> & { total: number }>>(Prisma.sql`
    WITH scoped AS (SELECT c.id FROM courses c WHERE ${scopedCourseCondition(access, filters)})
    SELECT c.id, c.name, c.code, u.name AS "teacherName",
      COALESCE(e.enrolled, 0)::int AS enrolled,
      COALESCE(e.withdrawn, 0)::int AS withdrawn,
      e.progress::float8 AS "averageProgress",
      COALESCE(s.pending, 0)::int AS "pendingGrading",
      g.grade::float8 AS "averageGrade",
      (COUNT(*) OVER ())::int AS total
    FROM courses c
    JOIN users u ON u.id = c."teacherId"
    LEFT JOIN (
      SELECT "courseId",
        -- Quien ya completó el curso sigue contando como inscrito (y en el avance).
        COUNT(*) FILTER (WHERE status IN ('ACTIVE', 'COMPLETED')) AS enrolled,
        COUNT(*) FILTER (WHERE status = 'DROPPED') AS withdrawn,
        AVG("progressPercent") FILTER (WHERE status IN ('ACTIVE', 'COMPLETED')) AS progress
      FROM enrollments WHERE "courseId" IN (SELECT id FROM scoped) GROUP BY "courseId"
    ) e ON e."courseId" = c.id
    LEFT JOIN (
      SELECT a."courseId", COUNT(*) AS pending
      FROM submissions sb JOIN assignments a ON a.id = sb."assignmentId"
      WHERE sb.status = 'SUBMITTED' AND a."courseId" IN (SELECT id FROM scoped) GROUP BY a."courseId"
    ) s ON s."courseId" = c.id
    LEFT JOIN (
      SELECT gi."courseId", AVG(ge.score / NULLIF(gi."maxScore", 0) * 100) AS grade
      FROM grade_entries ge JOIN grade_items gi ON gi.id = ge."gradeItemId"
      WHERE ge."institutionId" = ${access.institutionId} AND ge.score IS NOT NULL AND NOT ge."isExcused"
        AND gi."courseId" IN (SELECT id FROM scoped) GROUP BY gi."courseId"
    ) g ON g."courseId" = c.id
    WHERE c.id IN (SELECT id FROM scoped)
    ${order}
    LIMIT ${options.limit ?? PAGE_ROWS}
  `);
  return {
    total: rows[0]?.total ?? 0,
    rows: rows.map((row) => ({ ...strip(row), lowProgress: row.enrolled > 0 && (row.averageProgress ?? 0) < LOW_PROGRESS_PERCENT })),
  };
}

// ---------- Estudiantes en riesgo ----------

export const RISK_SORTS = ["motivos", "nombre", "avance", "asistencia", "vencidas", "actividad"] as const;
export type RiskSort = (typeof RISK_SORTS)[number];
export type RiskRow = {
  studentId: string;
  name: string;
  email: string;
  courses: number;
  averageProgress: number;
  lastActivityAt: Date | null;
  firstEnrolledAt: Date;
  inactive: boolean;
  lowProgress: boolean;
  lowAttendance: boolean;
  attended: number;
  classes: number;
  overdueTasks: number;
};

/**
 * Estudiantes con al menos una señal: sin actividad en 14 días, avance menor que la mitad del promedio de su curso
 * (en cursos con 3 o más inscritos, la misma regla de la pantalla del curso), asistencia menor de 80 % o tareas vencidas sin entregar.
 * Consultas: 1. Cada tabla grande se recorre una sola vez (agrupada por inscripción) y se une por inscripción.
 */
export async function getRiskReport(
  access: ReportAccess,
  filters: ReportFilters,
  options: { sort?: SortSpec<RiskSort>; limit?: number; now?: Date } = {},
): Promise<Listed<RiskRow> & { counts: RiskCounts }> {
  const now = options.now ?? new Date();
  const sort = options.sort ?? { key: "motivos", desc: true };
  const order = orderBy(
    sort,
    {
      motivos: "reasons",
      nombre: "u.name",
      avance: `f."averageProgress"`,
      asistencia: "f.attended::float8 / NULLIF(f.classes, 0)",
      vencidas: `f."overdueTasks"`,
      actividad: `COALESCE(f."lastActivityAt", f."firstEnrolledAt")`,
    },
    "u.name",
  );
  const iid = access.institutionId;
  type Extra = { total: number; reasons: number; nInactive: number; nLowProgress: number; nLowAttendance: number; nOverdue: number };
  const rows = await db.$queryRaw<Array<RiskRow & Extra>>(Prisma.sql`
    WITH scoped AS (SELECT c.id FROM courses c WHERE ${scopedCourseCondition(access, filters)}),
    enr AS (
      SELECT e.id, e."studentId", e."courseId", e."progressPercent" AS progress, e."enrolledAt"
      FROM enrollments e JOIN users u ON u.id = e."studentId"
      WHERE e.status = 'ACTIVE' AND e."courseId" IN (SELECT id FROM scoped) AND u.status = 'ACTIVE' AND u."institutionId" = ${iid}
    ),
    course_avg AS (SELECT "courseId", AVG(progress) AS mean, COUNT(*) AS n FROM enr GROUP BY "courseId"),
    lessons_seen AS (
      SELECT "enrollmentId", MAX("updatedAt") AS seen FROM lesson_progress
      WHERE "institutionId" = ${iid} AND "enrollmentId" IN (SELECT id FROM enr) GROUP BY "enrollmentId"
    ),
    tasks_seen AS (
      SELECT "enrollmentId", MAX("submittedAt") AS seen FROM submissions
      WHERE "enrollmentId" IN (SELECT id FROM enr) GROUP BY "enrollmentId"
    ),
    exams_seen AS (
      SELECT "enrollmentId", MAX("startedAt") AS seen FROM exam_attempts
      WHERE "institutionId" = ${iid} AND "enrollmentId" IN (SELECT id FROM enr) GROUP BY "enrollmentId"
    ),
    attended AS (
      SELECT "enrollmentId",
        COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE')) AS ok,
        COUNT(*) FILTER (WHERE status <> 'EXCUSED') AS total
      FROM attendances WHERE "institutionId" = ${iid} AND "enrollmentId" IN (SELECT id FROM enr) GROUP BY "enrollmentId"
    ),
    overdue AS (
      SELECT enr.id AS "enrollmentId", COUNT(*) AS n
      FROM enr
      JOIN assignments a ON a."courseId" = enr."courseId" AND a."isPublished" AND a."dueDate" < ${ts(now)} AND a."dueDate" >= enr."enrolledAt"
      LEFT JOIN submissions s ON s."assignmentId" = a.id AND s."studentId" = enr."studentId" AND s.status <> 'DRAFT'
      WHERE s.id IS NULL GROUP BY enr.id
    ),
    per AS (
      SELECT enr."studentId",
        COUNT(*)::int AS courses,
        AVG(enr.progress)::float8 AS "averageProgress",
        MAX(GREATEST(lessons_seen.seen, tasks_seen.seen, exams_seen.seen)) AS "lastActivityAt",
        MIN(enr."enrolledAt") AS "firstEnrolledAt",
        COALESCE(BOOL_OR(course_avg.n >= 3 AND enr.progress < course_avg.mean / 2), FALSE) AS "lowProgress",
        COALESCE(SUM(attended.ok), 0)::int AS attended,
        COALESCE(SUM(attended.total), 0)::int AS classes,
        COALESCE(SUM(overdue.n), 0)::int AS "overdueTasks"
      FROM enr
      JOIN course_avg ON course_avg."courseId" = enr."courseId"
      LEFT JOIN lessons_seen ON lessons_seen."enrollmentId" = enr.id
      LEFT JOIN tasks_seen ON tasks_seen."enrollmentId" = enr.id
      LEFT JOIN exams_seen ON exams_seen."enrollmentId" = enr.id
      LEFT JOIN attended ON attended."enrollmentId" = enr.id
      LEFT JOIN overdue ON overdue."enrollmentId" = enr.id
      GROUP BY enr."studentId"
    ),
    flagged AS (
      SELECT per.*,
        (COALESCE(per."lastActivityAt", per."firstEnrolledAt") < ${ts(daysAgo(now, INACTIVITY_DAYS))}) AS inactive,
        (per.classes > 0 AND per.attended::float8 / per.classes < ${Prisma.raw(String(LOW_ATTENDANCE_PERCENT / 100))}) AS "lowAttendance"
      FROM per
    )
    SELECT f."studentId", u.name, u.email, f.courses, f."averageProgress", f."lastActivityAt", f."firstEnrolledAt",
      f.inactive, f."lowProgress", f."lowAttendance", f.attended, f.classes, f."overdueTasks",
      (f.inactive::int + f."lowProgress"::int + f."lowAttendance"::int + (f."overdueTasks" > 0)::int) AS reasons,
      (COUNT(*) OVER ())::int AS total,
      (SUM(f.inactive::int) OVER ())::int AS "nInactive",
      (SUM(f."lowProgress"::int) OVER ())::int AS "nLowProgress",
      (SUM(f."lowAttendance"::int) OVER ())::int AS "nLowAttendance",
      (SUM((f."overdueTasks" > 0)::int) OVER ())::int AS "nOverdue"
    FROM flagged f JOIN users u ON u.id = f."studentId"
    WHERE f.inactive OR f."lowProgress" OR f."lowAttendance" OR f."overdueTasks" > 0
    ${order}
    LIMIT ${options.limit ?? PAGE_ROWS}
  `);
  const first = rows[0];
  return {
    total: first?.total ?? 0,
    // Los totales por motivo cuentan a todos, no solo a los que caben en la página.
    counts: { inactive: first?.nInactive ?? 0, lowProgress: first?.nLowProgress ?? 0, lowAttendance: first?.nLowAttendance ?? 0, overdue: first?.nOverdue ?? 0 },
    rows: rows.map((row) => ({
      studentId: row.studentId,
      name: row.name,
      email: row.email,
      courses: row.courses,
      averageProgress: row.averageProgress,
      lastActivityAt: row.lastActivityAt,
      firstEnrolledAt: row.firstEnrolledAt,
      inactive: row.inactive,
      lowProgress: row.lowProgress,
      lowAttendance: row.lowAttendance,
      attended: row.attended,
      classes: row.classes,
      overdueTasks: row.overdueTasks,
    })),
  };
}

/** El motivo en palabras, para la tabla y para el archivo descargado. */
export function riskReasons(row: RiskRow, now = new Date()): string[] {
  const reasons: string[] = [];
  if (row.inactive) {
    const days = Math.floor((now.getTime() - (row.lastActivityAt ?? row.firstEnrolledAt).getTime()) / DAY_MS);
    reasons.push(row.lastActivityAt ? `Sin actividad hace ${days} días` : `Nunca ha entrado a sus cursos (inscrito hace ${days} días)`);
  }
  if (row.lowProgress) reasons.push(`Avance bajo (${Math.round(row.averageProgress)} %), muy por debajo de su grupo`);
  if (row.lowAttendance) reasons.push(`Asistencia de ${Math.round((row.attended / row.classes) * 100)} % (${row.attended} de ${row.classes} clases)`);
  if (row.overdueTasks > 0) reasons.push(row.overdueTasks === 1 ? "1 tarea vencida sin entregar" : `${row.overdueTasks} tareas vencidas sin entregar`);
  return reasons;
}

// ---------- Docentes ----------

export const TEACHER_SORTS = ["nombre", "cursos", "estudiantes", "porCalificar", "espera"] as const;
export type TeacherSort = (typeof TEACHER_SORTS)[number];
export type TeacherReportRow = { id: string; name: string; courses: number; students: number; pendingGrading: number; oldestPendingAt: Date | null };

/**
 * Una fila por docente con cursos en el alcance: cursos, estudiantes distintos, entregas por calificar y la más antigua.
 * Consultas: 1.
 */
export async function getTeacherReport(
  access: ReportAccess,
  filters: ReportFilters,
  options: { sort?: SortSpec<TeacherSort>; limit?: number } = {},
): Promise<Listed<TeacherReportRow>> {
  const sort = options.sort ?? { key: "espera", desc: false };
  const order = orderBy(sort, { nombre: "u.name", cursos: "t.courses", estudiantes: "students", porCalificar: `"pendingGrading"`, espera: `"oldestPendingAt"` }, "u.name");
  const rows = await db.$queryRaw<Array<TeacherReportRow & { total: number }>>(Prisma.sql`
    WITH scoped AS (SELECT c.id, c."teacherId" FROM courses c WHERE ${scopedCourseCondition(access, filters)})
    SELECT u.id, u.name, t.courses,
      COALESCE(st.students, 0)::int AS students,
      COALESCE(p.pending, 0)::int AS "pendingGrading",
      p.oldest AS "oldestPendingAt",
      (COUNT(*) OVER ())::int AS total
    FROM (SELECT "teacherId", COUNT(*)::int AS courses FROM scoped GROUP BY "teacherId") t
    JOIN users u ON u.id = t."teacherId" AND u."institutionId" = ${access.institutionId}
    LEFT JOIN (
      SELECT sc."teacherId", COUNT(DISTINCT e."studentId") AS students
      FROM scoped sc JOIN enrollments e ON e."courseId" = sc.id AND e.status = 'ACTIVE' GROUP BY sc."teacherId"
    ) st ON st."teacherId" = t."teacherId"
    LEFT JOIN (
      SELECT sc."teacherId", COUNT(*) AS pending, MIN(sb."submittedAt") AS oldest
      FROM scoped sc JOIN assignments a ON a."courseId" = sc.id JOIN submissions sb ON sb."assignmentId" = a.id AND sb.status = 'SUBMITTED'
      GROUP BY sc."teacherId"
    ) p ON p."teacherId" = t."teacherId"
    ${order}
    LIMIT ${options.limit ?? PAGE_ROWS}
  `);
  return { total: rows[0]?.total ?? 0, rows: rows.map(strip) };
}

// ---------- Acceso ----------

export type AccessReportRow = { role: string; total: number; withoutAccess: number };

/**
 * Personas activas que todavía no pueden entrar porque no han creado su contraseña, por rol.
 * Es un dato de toda la institución: solo se devuelve a quien ve todos los cursos.
 * Consultas: 1.
 */
export async function getAccessReport(access: ReportAccess): Promise<AccessReportRow[] | null> {
  if (!access.canSeeAccess) return null;
  return db.$queryRaw<AccessReportRow[]>(Prisma.sql`
    SELECT u.role::text AS role, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE i."passwordHash" IS NULL)::int AS "withoutAccess"
    FROM users u LEFT JOIN identities i ON i.id = u."identityId"
    WHERE u."institutionId" = ${access.institutionId} AND u.status = 'ACTIVE'
    GROUP BY u.role
    ORDER BY "withoutAccess" DESC, role ASC
  `);
}

/** Lista para descargar: quiénes son, para poder invitarlos. Consultas: 1. */
export async function listPeopleWithoutAccess(access: ReportAccess): Promise<Array<{ name: string; email: string; role: string }> | null> {
  if (!access.canSeeAccess) return null;
  return db.user.findMany({
    where: { institutionId: access.institutionId, status: "ACTIVE", OR: [{ identityId: null }, { identity: { passwordHash: null } }] },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    take: EXPORT_ROWS,
    select: { name: true, email: true, role: true },
  });
}

// ---------- Grupos y programas ----------

export const GROUP_SORTS = ["nombre", "estudiantes", "avance"] as const;
export type GroupSort = (typeof GROUP_SORTS)[number];
export type GroupReportRow = { id: string; name: string; programName: string | null; members: number; capacity: number | null; averageProgress: number | null };
export type ProgramReportRow = { id: string; name: string; courses: number; students: number; averageProgress: number | null };

/** Quien solo ve sus cursos solo ve los grupos y programas que los tocan. */
function scopeOnly(access: ReportAccess, touched: Prisma.Sql): Prisma.Sql {
  if (access.scope.kind === "all") return Prisma.empty;
  return access.scope.kind === "teacher" ? Prisma.sql`AND ${touched}` : Prisma.sql`AND FALSE`;
}

/**
 * Tamaño de cada grupo y avance promedio de sus estudiantes en los cursos del alcance.
 * Consultas: 1.
 */
export async function getGroupReport(
  access: ReportAccess,
  filters: ReportFilters,
  options: { sort?: SortSpec<GroupSort>; limit?: number } = {},
): Promise<Listed<GroupReportRow>> {
  const sort = options.sort ?? { key: "avance", desc: false };
  const order = orderBy(sort, { nombre: "g.name", estudiantes: "members", avance: `"averageProgress"` }, "g.name");
  const iid = access.institutionId;
  const rows = await db.$queryRaw<Array<GroupReportRow & { total: number }>>(Prisma.sql`
    WITH scoped AS (SELECT c.id FROM courses c WHERE ${scopedCourseCondition(access, filters)})
    SELECT g.id, g.name, p.name AS "programName", COALESCE(m.members, 0)::int AS members, g.capacity,
      pr.progress::float8 AS "averageProgress", (COUNT(*) OVER ())::int AS total
    FROM student_groups g
    LEFT JOIN programs p ON p.id = g."programId" AND p."institutionId" = ${iid}
    LEFT JOIN (SELECT "groupId", COUNT(*) AS members FROM student_group_members WHERE "institutionId" = ${iid} GROUP BY "groupId") m ON m."groupId" = g.id
    LEFT JOIN (
      SELECT gm."groupId", AVG(e."progressPercent") AS progress
      FROM student_group_members gm
      JOIN enrollments e ON e."studentId" = gm."userId" AND e.status = 'ACTIVE' AND e."courseId" IN (SELECT id FROM scoped)
      WHERE gm."institutionId" = ${iid} GROUP BY gm."groupId"
    ) pr ON pr."groupId" = g.id
    WHERE g."institutionId" = ${iid}
      ${filters.programId ? Prisma.sql`AND g."programId" = ${filters.programId}` : Prisma.empty}
      ${scopeOnly(access, Prisma.sql`pr."groupId" IS NOT NULL`)}
    ${order}
    LIMIT ${options.limit ?? PAGE_ROWS}
  `);
  return { total: rows[0]?.total ?? 0, rows: rows.map(strip) };
}

/**
 * Cursos, estudiantes distintos y avance promedio de cada programa (dentro del alcance).
 * Consultas: 1.
 */
export async function getProgramReport(
  access: ReportAccess,
  filters: ReportFilters,
  options: { sort?: SortSpec<GroupSort>; limit?: number } = {},
): Promise<Listed<ProgramReportRow>> {
  const sort = options.sort ?? { key: "avance", desc: false };
  const order = orderBy(sort, { nombre: "p.name", estudiantes: "students", avance: `"averageProgress"` }, "p.name");
  const iid = access.institutionId;
  const rows = await db.$queryRaw<Array<ProgramReportRow & { total: number }>>(Prisma.sql`
    WITH scoped AS (SELECT c.id FROM courses c WHERE ${scopedCourseCondition(access, filters)})
    SELECT p.id, p.name, COALESCE(x.courses, 0)::int AS courses, COALESCE(x.students, 0)::int AS students,
      x.progress::float8 AS "averageProgress", (COUNT(*) OVER ())::int AS total
    FROM programs p
    LEFT JOIN (
      SELECT pc."programId", COUNT(DISTINCT pc."courseId") AS courses, COUNT(DISTINCT e."studentId") AS students, AVG(e."progressPercent") AS progress
      FROM program_courses pc
      JOIN scoped sc ON sc.id = pc."courseId"
      LEFT JOIN enrollments e ON e."courseId" = pc."courseId" AND e.status = 'ACTIVE'
      WHERE pc."institutionId" = ${iid} GROUP BY pc."programId"
    ) x ON x."programId" = p.id
    WHERE p."institutionId" = ${iid}
      ${filters.programId ? Prisma.sql`AND p.id = ${filters.programId}` : Prisma.empty}
      ${scopeOnly(access, Prisma.sql`x."programId" IS NOT NULL`)}
    ${order}
    LIMIT ${options.limit ?? PAGE_ROWS}
  `);
  return { total: rows[0]?.total ?? 0, rows: rows.map(strip) };
}
