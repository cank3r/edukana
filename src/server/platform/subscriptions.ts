import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { auditPlatform, planCodeSchema, requirePlatformOperator } from "./plans";

/** Shared institution lock serializes payments, period edits and expiration. */
export async function lockBilling(tx: Prisma.TransactionClient, institutionId: string) {
  await tx.$queryRaw`SELECT id FROM institutions WHERE id = ${institutionId} FOR UPDATE`;
}
export async function changeInstitutionPlan(operator: string | null, institutionId: string, input: unknown) {
  requirePlatformOperator(operator);
  const data = z.object({ planCode: planCodeSchema, confirmation: z.string(),
    priceCents: z.number().int().min(0).max(2147483647), notes: z.string().trim().max(2000).optional() }).parse(input);
  return db.$transaction(async (tx) => {
    await lockBilling(tx, institutionId);
    const institution = await tx.institution.findUniqueOrThrow({ where: { id: institutionId } });
    if (data.confirmation.trim() !== institution.name) throw new Error("Escribe el nombre de la institución para confirmar.");
    const plan = await tx.platformPlan.findUniqueOrThrow({ where: { code: data.planCode } });
    if (!plan.active) throw new Error("Ese plan está inactivo.");
    const before = await tx.institutionSubscription.findUnique({ where: { institutionId } });
    const now = new Date();
    const end = new Date(now); end.setUTCMonth(end.getUTCMonth() + 1);
    const after = await tx.institutionSubscription.upsert({ where: { institutionId },
      update: { planCode: data.planCode, priceCents: data.priceCents, notes: data.notes },
      create: { institutionId, planCode: data.planCode, priceCents: data.priceCents, notes: data.notes,
        status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: end } });
    await tx.institution.update({ where: { id: institutionId }, data: { plan: data.planCode } });
    await auditPlatform(tx, operator, "PLATFORM_SUBSCRIPTION_PLAN_CHANGED", "InstitutionSubscription", after.id, institutionId, before, after);
    return after;
  });
}
export async function extendSubscription(operator: string | null, institutionId: string, end: Date) {
  requirePlatformOperator(operator);
  z.date().parse(end);
  return db.$transaction(async (tx) => {
    await lockBilling(tx, institutionId);
    const before = await tx.institutionSubscription.findUniqueOrThrow({ where: { institutionId } });
    if (end <= before.currentPeriodEnd) throw new Error("La nueva fecha debe ser posterior al vencimiento actual.");
    const after = await tx.institutionSubscription.update({ where: { institutionId }, data: {
      currentPeriodEnd: end, ...(before.status === "PAST_DUE" && end > new Date() ? { status: "ACTIVE" as const } : {}),
    } });
    await auditPlatform(tx, operator, "PLATFORM_SUBSCRIPTION_EXTENDED", "InstitutionSubscription", after.id, institutionId, before, after);
    return after;
  });
}
/** Expiration never suspends an institution. A paid old period does not buy a future period. */
export async function expirePlatformSubscriptions(now = new Date()) {
  const candidates = await db.institutionSubscription.findMany({
    where: { status: { in: ["TRIAL", "ACTIVE"] }, currentPeriodEnd: { lt: now } }, select: { institutionId: true } });
  let changed = 0;
  for (const { institutionId } of candidates) {
    changed += await db.$transaction(async (tx) => {
      await lockBilling(tx, institutionId);
      const sub = await tx.institutionSubscription.findUniqueOrThrow({ where: { institutionId } });
      if (!["TRIAL", "ACTIVE"].includes(sub.status) || sub.currentPeriodEnd >= now) return 0;
      const paid = await tx.platformInvoice.findFirst({ where: { institutionId, status: "PAID",
        periodStart: { lte: sub.currentPeriodEnd }, periodEnd: { gte: now } }, orderBy: { periodEnd: "desc" } });
      const after = await tx.institutionSubscription.update({ where: { institutionId }, data: paid
        ? { status: "ACTIVE", currentPeriodEnd: paid.periodEnd } : { status: "PAST_DUE" } });
      await auditPlatform(tx, "system:cron", "PLATFORM_SUBSCRIPTION_EXPIRATION_CHECKED", "InstitutionSubscription",
        sub.id, institutionId, sub, after);
      return paid ? 0 : 1;
    });
  }
  return changed;
}
