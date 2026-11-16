import type { Plan, PrismaClient } from "@prisma/client";
import { PLATFORM_TRIAL_DAYS, seedPlatformPlans } from "./plan-defaults";

export type BackfillRow = { institutionId: string; name: string; slug: string; planCode: Plan };
export type BackfillResult = { pending: BackfillRow[]; created: number; dryRun: boolean };

/**
 * Da a cada institución que todavía no tiene suscripción la misma prueba que reciben las nuevas:
 * TRIAL de `PLATFORM_TRIAL_DAYS` días desde `now`, precio 0. Usa el plan que ya marca
 * `Institution.plan` (FREE por omisión), para no bajar de plan a nadie. Lo deja en la bitácora.
 * No toca instituciones que ya tienen suscripción, así que se puede correr las veces que haga falta.
 * Con `dryRun` solo devuelve la lista de las que recibirían plan.
 */
export async function backfillMissingSubscriptions(
  db: PrismaClient,
  { dryRun, now = new Date(), actor = "script:asignar-planes" }: { dryRun: boolean; now?: Date; actor?: string },
): Promise<BackfillResult> {
  const pending = await db.institution.findMany({
    where: { platformSubscription: null },
    select: { id: true, name: true, slug: true, plan: true },
    orderBy: { createdAt: "asc" },
  });
  const rows = pending.map((i) => ({ institutionId: i.id, name: i.name, slug: i.slug, planCode: i.plan }));
  if (dryRun) return { pending: rows, created: 0, dryRun };

  const end = new Date(now.getTime() + PLATFORM_TRIAL_DAYS * 86400000);
  let created = 0;
  for (const row of rows) {
    const done = await db.$transaction(async (tx) => {
      await seedPlatformPlans(tx);
      // Otra corrida o el operador pudo crearla entre la lista y este paso.
      const existing = await tx.institutionSubscription.findUnique({ where: { institutionId: row.institutionId }, select: { id: true } });
      if (existing) return false;
      const subscription = await tx.institutionSubscription.create({ data: {
        institutionId: row.institutionId, planCode: row.planCode, status: "TRIAL", priceCents: 0,
        currentPeriodStart: now, currentPeriodEnd: end, trialEndsAt: end,
      } });
      await tx.auditLog.create({ data: {
        institutionId: row.institutionId, action: "PLATFORM_SUBSCRIPTION_TRIAL_CREATED", entity: "InstitutionSubscription",
        entityId: subscription.id,
        changes: { operator: actor, reason: "backfill", before: null, after: { planCode: row.planCode, status: "TRIAL", trialDays: PLATFORM_TRIAL_DAYS } },
      } });
      return true;
    });
    if (done) created += 1;
  }
  return { pending: rows, created, dryRun };
}
