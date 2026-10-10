import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { STALE_SUBMISSION_DAYS } from "@/server/admin-home";
import { ts, type BoardContext } from "./context";
import { getAtRiskStudents, type RiskSignal } from "./risk";

/**
 * Pendientes del tablero para «Requiere tu atención»: un resumen por tema, con lo que ya calcula el tablero.
 *
 * - Calificar: entregas y exámenes que esperan nota desde hace más de `STALE_SUBMISSION_DAYS` días.
 * - Riesgo: estudiantes con al menos una señal de alerta (la misma lista del bloque «Estudiantes en riesgo»).
 * - Cobros: cargos vencidos sin pagar (solo con permiso de cobros y viendo toda la institución).
 * - Admisiones: solicitudes que llegaron y nadie ha atendido todavía.
 *
 * Cada tema es null si quien mira no tiene el permiso que lo respalda, o si no hay nada que atender.
 * Consultas: hasta 4 en paralelo (riesgo reutiliza su consulta con una sola fila).
 */
export type BoardAttention = {
  grading: { waiting: number; courses: number } | null;
  risk: { total: number; top: Array<{ signal: RiskSignal; count: number }> } | null;
  charges: { charges: number; students: number } | null;
  admissions: { waiting: number; oldestDays: number } | null;
};

const DAY_MS = 24 * 60 * 60_000;

export async function getBoardAttention(ctx: BoardContext): Promise<BoardAttention> {
  const [grading, risk, charges, admissions] = await Promise.all([
    ctx.can.results ? staleGrading(ctx) : null,
    ctx.can.results ? getAtRiskStudents(ctx, { limit: 1 }) : null,
    ctx.can.finance ? overdueCharges(ctx) : null,
    ctx.can.admissions ? waitingAdmissions(ctx) : null,
  ]);
  return {
    grading: grading && grading.waiting > 0 ? grading : null,
    risk:
      risk && risk.total > 0
        ? {
            total: risk.total,
            top: (Object.entries(risk.counts) as Array<[RiskSignal, number]>)
              .filter(([signal, count]) => count > 0 && (signal !== "cobros" || ctx.can.finance))
              .sort((a, b) => b[1] - a[1])
              .slice(0, 2)
              .map(([signal, count]) => ({ signal, count })),
          }
        : null,
    charges: charges && charges.charges > 0 ? charges : null,
    admissions: admissions && admissions.waiting > 0 ? admissions : null,
  };
}

async function staleGrading(ctx: BoardContext) {
  const before = new Date(ctx.now.getTime() - STALE_SUBMISSION_DAYS * DAY_MS);
  const [row] = await db.$queryRaw<Array<{ waiting: number; courses: number }>>(Prisma.sql`
    WITH scoped AS (SELECT c.id FROM courses c WHERE ${ctx.courses}),
    waiting AS (
      SELECT a."courseId" FROM submissions sb JOIN assignments a ON a.id = sb."assignmentId"
      WHERE sb.status = 'SUBMITTED' AND sb."submittedAt" < ${ts(before)} AND a."courseId" IN (SELECT id FROM scoped)
      UNION ALL
      SELECT x."courseId" FROM exam_attempts ea JOIN exams x ON x.id = ea."examId"
      WHERE ea."institutionId" = ${ctx.institutionId} AND ea.status = 'SUBMITTED'
        AND COALESCE(ea."submittedAt", ea."startedAt") < ${ts(before)} AND x."courseId" IN (SELECT id FROM scoped)
    )
    SELECT COUNT(*)::int AS waiting, COUNT(DISTINCT "courseId")::int AS courses FROM waiting
  `);
  return row ?? { waiting: 0, courses: 0 };
}

/** Misma regla que la señal de cobros de «Estudiantes en riesgo»: vencido, o pendiente con fecha ya pasada. */
async function overdueCharges(ctx: BoardContext) {
  const [row] = await db.$queryRaw<Array<{ charges: number; students: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS charges, COUNT(DISTINCT pc."studentId")::int AS students
    FROM payment_concepts pc
    WHERE pc."institutionId" = ${ctx.institutionId}
      AND (pc.status = 'OVERDUE' OR (pc.status IN ('PENDING', 'PARTIAL') AND pc."dueDate" IS NOT NULL AND to_char(pc."dueDate", 'YYYY-MM-DD') < ${ctx.todayKey}))
  `);
  return row ?? { charges: 0, students: 0 };
}

async function waitingAdmissions(ctx: BoardContext) {
  const where = { institutionId: ctx.institutionId, stage: "INTERESTED" as const };
  const [waiting, oldest] = await Promise.all([
    db.admissionLead.count({ where }),
    db.admissionLead.findFirst({ where, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  return { waiting, oldestDays: oldest ? Math.max(0, Math.floor((ctx.now.getTime() - oldest.createdAt.getTime()) / DAY_MS)) : 0 };
}
