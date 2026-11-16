import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isPlatformOperator } from "./institutions";

export type AttentionInstitution = { id: string; name: string; reason: string };
export type PlatformMetrics = {
  institutions: number; independent: number; students: number; teachers: number;
  signups7: number; signups30: number; inactive14: number;
  sales: Array<{ currency: string; amountCents: number; count: number }>;
  aiRequests: number; aiTokens: number; attention: AttentionInstitution[];
};

export function metricsWindow(now: Date) {
  return {
    month: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    days7: new Date(now.getTime() - 7 * 86400000),
    days14: new Date(now.getTime() - 14 * 86400000),
    days30: new Date(now.getTime() - 30 * 86400000),
    days3: new Date(now.getTime() - 3 * 86400000),
  };
}

/** Fixed number of aggregate queries; never loads student or audit histories into memory.
 * Activity means recorded non-platform audit activity. Older logins were not recorded.
 * Optional B/C integrations remain compatible while their migrations are not present.
 */
export async function getPlatformMetrics(operatorEmail: string | null | undefined, now = new Date()): Promise<PlatformMetrics | null> {
  if (!isPlatformOperator(operatorEmail)) return null;
  const dates = metricsWindow(now);
  const [institutions, students, teachers, sales, ai, attention, subscriptionTable] = await Promise.all([
    db.$queryRaw<Array<{ institutions: number; independent: number; signups7: number; signups30: number; inactive14: number }>>(Prisma.sql`
      SELECT count(*) FILTER (WHERE coalesce(to_jsonb(i)->>'status', 'ACTIVE') = 'ACTIVE')::int AS institutions,
        count(*) FILTER (WHERE coalesce(to_jsonb(i)->>'status', 'ACTIVE') = 'ACTIVE'
          AND i.settings->>'kind' = 'INDEPENDENT')::int AS independent,
        count(*) FILTER (WHERE i."createdAt" >= ${dates.days7} AND i."createdAt" <= ${now})::int AS "signups7",
        count(*) FILTER (WHERE i."createdAt" >= ${dates.days30} AND i."createdAt" <= ${now})::int AS "signups30",
        count(*) FILTER (WHERE i."createdAt" < ${dates.days14} AND NOT EXISTS (
          SELECT 1 FROM audit_logs a WHERE a."institutionId" = i.id AND a."createdAt" >= ${dates.days14}
            AND a."createdAt" <= ${now} AND a.action NOT LIKE 'PLATFORM_%'
        ))::int AS "inactive14"
      FROM institutions i WHERE i."createdAt" <= ${now}`),
    db.user.count({ where: { role: "STUDENT", status: "ACTIVE", identity: { status: "ACTIVE" } } }),
    db.user.count({ where: { role: "TEACHER", status: "ACTIVE", identity: { status: "ACTIVE" } } }),
    db.courseOrder.groupBy({ by: ["currency"], where: { status: "PAID", paidAt: { gte: dates.month, lte: now } },
      _sum: { amountCents: true }, _count: { _all: true } }),
    db.$queryRaw<Array<{ requests: number; tokens: number }>>(Prisma.sql`
      SELECT count(*)::int AS requests, coalesce(sum(
        CASE WHEN jsonb_typeof(changes->'inputTokens') = 'number' THEN (changes->>'inputTokens')::numeric ELSE 0 END +
        CASE WHEN jsonb_typeof(changes->'outputTokens') = 'number' THEN (changes->>'outputTokens')::numeric ELSE 0 END
      ), 0)::double precision AS tokens FROM audit_logs
      WHERE action = 'AI_USED' AND "createdAt" >= ${dates.month} AND "createdAt" <= ${now}`),
    db.$queryRaw<AttentionInstitution[]>(Prisma.sql`
      SELECT i.id, i.name, CASE WHEN to_jsonb(i)->>'status' = 'SUSPENDED' THEN 'Acceso suspendido'
        ELSE 'Sin entrada registrada de administración después de 3 días' END AS reason
      FROM institutions i WHERE to_jsonb(i)->>'status' = 'SUSPENDED' OR
        (i."createdAt" < ${dates.days3} AND EXISTS (
          SELECT 1 FROM users u WHERE u."institutionId" = i.id AND u.role IN ('ADMIN', 'SUPER_ADMIN')
        ) AND NOT EXISTS (
          SELECT 1 FROM audit_logs a JOIN users u ON u.id = a."userId"
          WHERE a."institutionId" = i.id AND a.action = 'LOGIN_SUCCEEDED' AND u.role IN ('ADMIN', 'SUPER_ADMIN')
        )) ORDER BY i."createdAt", i.id LIMIT 200`),
    db.$queryRaw<Array<{ present: boolean }>>`SELECT to_regclass('public.institution_subscriptions') IS NOT NULL AS present`,
  ]);
  if (subscriptionTable[0]?.present) {
    const overdue = await db.$queryRaw<AttentionInstitution[]>(Prisma.sql`
      SELECT i.id, i.name, 'Período del plan vencido' AS reason FROM institutions i
      JOIN institution_subscriptions s ON s."institutionId" = i.id
      WHERE s.status <> 'CANCELED' AND s."currentPeriodEnd" < ${now}
      ORDER BY s."currentPeriodEnd", i.id LIMIT 200`);
    attention.push(...overdue);
  }
  return {
    ...institutions[0], students, teachers,
    sales: sales.map((row) => ({ currency: row.currency, amountCents: row._sum.amountCents ?? 0, count: row._count._all })),
    aiRequests: ai[0]?.requests ?? 0, aiTokens: ai[0]?.tokens ?? 0, attention,
  };
}
