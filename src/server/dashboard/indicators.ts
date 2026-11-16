import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { chargeBalances } from "@/server/finance/charges";
import { day, ts, weeksTable, type BoardContext } from "./context";
import { share } from "./format";

/**
 * Indicadores grandes del tablero y su tendencia de 8 semanas.
 * Todo se cuenta en la base con agregados (COUNT / AVG con FILTER) sobre los cursos del alcance;
 * ninguna consulta devuelve filas de estudiantes. La única excepción es Cobros (ver `getFinanceIndicator`).
 * Consultas: 4 en paralelo + 2 de cobros solo con permiso.
 */

export type Series = number[];
export type StudentsIndicator = { active: number; activeBefore: number | null; newInRange: number; newBefore: number | null; trend: Series };
export type RatioIndicator = { percent: number | null; part: number; whole: number; previousPercent: number | null; trend: Array<number | null>; trendPart: Series; trendWhole: Series };
export type ProgressIndicator = { percent: number | null; enrollments: number; lessonsInRange: number; lessonsBefore: number | null; trend: Series };
export type FinanceIndicator = {
  collectedCents: number;
  collectedBeforeCents: number | null;
  pendingCents: number;
  overdueCents: number;
  trend: Series;
  currency: string;
  mixedCurrencies: boolean;
};
export type BoardIndicators = {
  students: StudentsIndicator | null;
  attendance: RatioIndicator | null;
  progress: ProgressIndicator | null;
  onTime: RatioIndicator | null;
  finance: FinanceIndicator | null;
};

const scopedCte = (ctx: BoardContext) => Prisma.sql`scoped AS (SELECT c.id FROM courses c WHERE ${ctx.courses})`;
/** Fragmento que vale NULL cuando no hay ventana anterior con la que comparar. */
const orNull = (ctx: BoardContext, build: (previous: NonNullable<BoardContext["range"]["previous"]>) => Prisma.Sql) =>
  ctx.range.previous ? build(ctx.range.previous) : Prisma.sql`NULL::int`;

export async function getBoardIndicators(ctx: BoardContext): Promise<BoardIndicators> {
  const [students, progress, attendance, onTime, finance] = await Promise.all([
    ctx.can.students ? getStudents(ctx) : null,
    ctx.can.results ? getProgress(ctx) : null,
    ctx.can.results ? getAttendance(ctx) : null,
    ctx.can.results ? getOnTime(ctx) : null,
    ctx.can.finance ? getFinanceIndicator(ctx) : null,
  ]);
  return { students, progress, attendance, onTime, finance };
}

/**
 * Estudiantes con al menos una inscripción activa (cuenta activa). «Nuevos»: activos cuya primera inscripción cae en la ventana.
 * La comparación y la tendencia cuentan quién estaba inscrito en ese momento (inscrito antes, y sin haberse retirado
 * ni terminado todavía). Consultas: 1.
 */
async function getStudents(ctx: BoardContext): Promise<StudentsIndicator> {
  const { range, now } = ctx;
  const activeAt = (moment: Prisma.Sql) =>
    Prisma.sql`enr."enrolledAt" < ${moment} AND (enr.status = 'ACTIVE' OR enr."withdrawnAt" >= ${moment} OR enr."completedAt" >= ${moment})`;
  const [row] = await db.$queryRaw<Array<{ active: number; activeBefore: number | null; newInRange: number; newBefore: number | null; trend: number[] }>>(Prisma.sql`
    WITH ${scopedCte(ctx)},
    enr AS (
      SELECT e."studentId", e.status, e."enrolledAt", e."withdrawnAt", e."completedAt"
      FROM enrollments e JOIN users u ON u.id = e."studentId"
      WHERE e."courseId" IN (SELECT id FROM scoped) AND u."institutionId" = ${ctx.institutionId} AND u.status = 'ACTIVE'
    ),
    firsts AS (SELECT "studentId", MIN("enrolledAt") AS first FROM enr GROUP BY "studentId")
    SELECT
      (SELECT COUNT(DISTINCT "studentId") FROM enr WHERE status = 'ACTIVE')::int AS active,
      ${orNull(ctx, (previous) => Prisma.sql`(SELECT COUNT(DISTINCT enr."studentId") FROM enr WHERE ${activeAt(ts(previous.to))})::int`)} AS "activeBefore",
      -- Nuevos que siguen activos: así «nuevos» nunca supera a «activos».
      (SELECT COUNT(*) FROM firsts WHERE first >= ${ts(range.from)} AND first < ${ts(range.to)}
        AND "studentId" IN (SELECT "studentId" FROM enr WHERE status = 'ACTIVE'))::int AS "newInRange",
      ${orNull(ctx, (previous) => Prisma.sql`(SELECT COUNT(*) FROM firsts WHERE first >= ${ts(previous.from)} AND first < ${ts(previous.to)})::int`)} AS "newBefore",
      ARRAY(
        SELECT COUNT(DISTINCT enr."studentId")::int
        FROM ${weeksTable(ctx.weeks)}
        LEFT JOIN enr ON ${activeAt(Prisma.sql`LEAST(w.e, ${ts(now)})`)}
        GROUP BY w.i ORDER BY w.i
      ) AS trend
  `);
  return { active: row.active, activeBefore: row.activeBefore, newInRange: row.newInRange, newBefore: row.newBefore, trend: row.trend.map(Number) };
}

/**
 * Avance promedio de las inscripciones activas y terminadas (el avance pasado no se guarda, así que no se compara).
 * Para ver si hay movimiento se cuentan las lecciones completadas en la ventana y por semana. Consultas: 1.
 */
async function getProgress(ctx: BoardContext): Promise<ProgressIndicator> {
  const { range } = ctx;
  const iid = ctx.institutionId;
  const completedIn = (from: Date, to: Date) =>
    Prisma.sql`(SELECT COUNT(*) FROM lesson_progress lp WHERE lp."institutionId" = ${iid} AND lp.completed AND lp."enrollmentId" IN (SELECT id FROM enr)
      AND lp."completedAt" >= ${ts(from)} AND lp."completedAt" < ${ts(to)})::int`;
  const [row] = await db.$queryRaw<Array<{ percent: number | null; enrollments: number; lessonsInRange: number; lessonsBefore: number | null; trend: number[] }>>(Prisma.sql`
    WITH ${scopedCte(ctx)},
    enr AS (SELECT e.id, e."progressPercent" AS p FROM enrollments e WHERE e."courseId" IN (SELECT id FROM scoped) AND e.status IN ('ACTIVE', 'COMPLETED'))
    SELECT
      (SELECT AVG(p) FROM enr)::float8 AS percent,
      (SELECT COUNT(*) FROM enr)::int AS enrollments,
      ${completedIn(range.from, range.to)} AS "lessonsInRange",
      ${orNull(ctx, (previous) => completedIn(previous.from, previous.to))} AS "lessonsBefore",
      ARRAY(
        SELECT COUNT(lp.id)::int
        FROM ${weeksTable(ctx.weeks)}
        LEFT JOIN lesson_progress lp ON lp."institutionId" = ${iid} AND lp.completed AND lp."enrollmentId" IN (SELECT id FROM enr)
          AND lp."completedAt" >= w.s AND lp."completedAt" < w.e
        GROUP BY w.i ORDER BY w.i
      ) AS trend
  `);
  return { percent: row.percent, enrollments: row.enrollments, lessonsInRange: row.lessonsInRange, lessonsBefore: row.lessonsBefore, trend: row.trend.map(Number) };
}

type RatioRow = { part: number; whole: number; partBefore: number | null; wholeBefore: number | null; weekPart: number[]; weekWhole: number[] };

function toRatio(row: RatioRow): RatioIndicator {
  const trendPart = row.weekPart.map(Number);
  const trendWhole = row.weekWhole.map(Number);
  return {
    percent: share(row.part, row.whole),
    part: row.part,
    whole: row.whole,
    previousPercent: row.partBefore === null || row.wholeBefore === null ? null : share(row.partBefore, row.wholeBefore),
    trend: trendPart.map((part, index) => share(part, trendWhole[index] ?? 0)),
    trendPart,
    trendWhole,
  };
}

/**
 * Asistencia: presentes y tardanzas cuentan como asistencia; las ausencias justificadas no entran en la cuenta
 * (la misma regla de Reportes y de la pantalla del curso). Consultas: 1.
 */
async function getAttendance(ctx: BoardContext): Promise<RatioIndicator> {
  const { range } = ctx;
  const iid = ctx.institutionId;
  const ok = Prisma.sql`a.status IN ('PRESENT', 'LATE')`;
  const counted = Prisma.sql`a.status <> 'EXCUSED'`;
  const inDays = (fromKey: string, toKey: string) => Prisma.sql`a.date >= ${day(fromKey)} AND a.date <= ${day(toKey)}`;
  const [row] = await db.$queryRaw<RatioRow[]>(Prisma.sql`
    WITH ${scopedCte(ctx)},
    att AS (
      SELECT a.date, a.status FROM attendances a
      WHERE a."institutionId" = ${iid} AND a."courseId" IN (SELECT id FROM scoped)
        AND a.date >= LEAST(${day(range.fromKey)}, ${day(range.previous?.fromKey ?? range.fromKey)}, ${day(ctx.weeks[0].startKey)})
        AND a.date < ${day(ctx.weeks[ctx.weeks.length - 1].endKey)}
    )
    SELECT
      (SELECT COUNT(*) FROM att a WHERE ${inDays(range.fromKey, range.toKey)} AND ${ok})::int AS part,
      (SELECT COUNT(*) FROM att a WHERE ${inDays(range.fromKey, range.toKey)} AND ${counted})::int AS whole,
      ${orNull(ctx, (previous) => Prisma.sql`(SELECT COUNT(*) FROM att a WHERE ${inDays(previous.fromKey, previous.toKey)} AND ${ok})::int`)} AS "partBefore",
      ${orNull(ctx, (previous) => Prisma.sql`(SELECT COUNT(*) FROM att a WHERE ${inDays(previous.fromKey, previous.toKey)} AND ${counted})::int`)} AS "wholeBefore",
      ARRAY(SELECT COUNT(a.date) FILTER (WHERE ${ok})::int FROM ${weeksTable(ctx.weeks)} LEFT JOIN att a ON a.date >= w.sk AND a.date < w.ek GROUP BY w.i ORDER BY w.i) AS "weekPart",
      ARRAY(SELECT COUNT(a.date) FILTER (WHERE ${counted})::int FROM ${weeksTable(ctx.weeks)} LEFT JOIN att a ON a.date >= w.sk AND a.date < w.ek GROUP BY w.i ORDER BY w.i) AS "weekWhole"
  `);
  return toRatio(row);
}

/**
 * Entregas a tiempo: por cada tarea publicada que ya venció (dentro de la ventana), una entrega esperada por estudiante
 * que estaba inscrito al vencer. Cuenta a tiempo la entrega enviada hasta la fecha límite. Consultas: 1.
 */
async function getOnTime(ctx: BoardContext): Promise<RatioIndicator> {
  const { range, now } = ctx;
  const earliest = new Date(Math.min(range.from.getTime(), range.previous?.from.getTime() ?? Infinity, ctx.weeks[0].start.getTime()));
  const inWindow = (from: Date, to: Date) => Prisma.sql`x."dueDate" >= ${ts(from)} AND x."dueDate" < ${ts(to)}`;
  const [row] = await db.$queryRaw<RatioRow[]>(Prisma.sql`
    WITH ${scopedCte(ctx)},
    x AS (
      SELECT a."dueDate", (s.id IS NOT NULL AND s."submittedAt" <= a."dueDate") AS ok
      FROM assignments a
      JOIN enrollments e ON e."courseId" = a."courseId" AND e.status IN ('ACTIVE', 'COMPLETED') AND e."enrolledAt" <= a."dueDate"
      LEFT JOIN submissions s ON s."assignmentId" = a.id AND s."studentId" = e."studentId" AND s.status <> 'DRAFT'
      WHERE a."courseId" IN (SELECT id FROM scoped) AND a."isPublished" AND a."dueDate" IS NOT NULL
        AND a."dueDate" >= ${ts(earliest)} AND a."dueDate" < ${ts(now)}
    )
    SELECT
      (SELECT COUNT(*) FROM x WHERE ${inWindow(range.from, range.to)} AND x.ok)::int AS part,
      (SELECT COUNT(*) FROM x WHERE ${inWindow(range.from, range.to)})::int AS whole,
      ${orNull(ctx, (previous) => Prisma.sql`(SELECT COUNT(*) FROM x WHERE ${inWindow(previous.from, previous.to)} AND x.ok)::int`)} AS "partBefore",
      ${orNull(ctx, (previous) => Prisma.sql`(SELECT COUNT(*) FROM x WHERE ${inWindow(previous.from, previous.to)})::int`)} AS "wholeBefore",
      ARRAY(SELECT COUNT(x."dueDate") FILTER (WHERE x.ok)::int FROM ${weeksTable(ctx.weeks)} LEFT JOIN x ON x."dueDate" >= w.s AND x."dueDate" < w.e GROUP BY w.i ORDER BY w.i) AS "weekPart",
      ARRAY(SELECT COUNT(x."dueDate")::int FROM ${weeksTable(ctx.weeks)} LEFT JOIN x ON x."dueDate" >= w.s AND x."dueDate" < w.e GROUP BY w.i ORDER BY w.i) AS "weekWhole"
  `);
  return toRatio(row);
}

/**
 * Cobrado en la ventana, por cobrar y vencido. Excepción a «todo se suma en la base», igual que en Reportes:
 * los saldos salen de `chargeBalances`, la misma función de Cobros, el portal y el estado de cuenta,
 * para que todas las pantallas den la misma cifra. Consultas: 1 + las de `chargeBalances`.
 */
async function getFinanceIndicator(ctx: BoardContext): Promise<FinanceIndicator> {
  const charges = await db.paymentConcept.findMany({ where: { institutionId: ctx.institutionId }, select: { id: true } });
  const balances = await chargeBalances(ctx.institutionId, charges.map((charge) => charge.id), ctx.now);
  const { range } = ctx;
  const within = (key: string, fromKey: string, toKey: string) => key >= fromKey && key <= toKey;
  const result = { collectedCents: 0, collectedBeforeCents: range.previous ? 0 : null, pendingCents: 0, overdueCents: 0, trend: ctx.weeks.map(() => 0) } as FinanceIndicator;
  const currencies = new Set<string>();
  for (const balance of balances.values()) {
    for (const entry of balance.received) {
      if (within(entry.paidOn, range.fromKey, range.toKey)) result.collectedCents += entry.amountCents;
      if (range.previous && within(entry.paidOn, range.previous.fromKey, range.previous.toKey)) result.collectedBeforeCents! += entry.amountCents;
      const week = ctx.weeks.find((candidate) => entry.paidOn >= candidate.startKey && entry.paidOn < candidate.endKey);
      if (week) result.trend[week.index] += entry.amountCents;
    }
    if (balance.status === "CANCELLED") continue;
    currencies.add(balance.currency);
    result.pendingCents += balance.balanceCents;
    if (balance.shownStatus === "OVERDUE") result.overdueCents += balance.balanceCents;
  }
  result.currency = [...currencies].sort()[0] ?? "DOP";
  result.mixedCurrencies = currencies.size > 1;
  return result;
}
