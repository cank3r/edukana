import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { isPlatformOperator } from "./institutions";

export const planCodeSchema = z.enum(["FREE", "STARTER", "PRO", "ENTERPRISE"]);
const limit = z.number().int().min(0).max(2147483647).nullable();
export const platformPlanSchema = z.object({
  code: planCodeSchema, name: z.string().trim().min(1).max(100), priceCents: z.number().int().min(0).max(2147483647),
  currency: z.string().regex(/^[A-Z]{3}$/), maxStudents: limit, maxStorageMb: limit, aiRequestsPerMonth: limit,
  features: z.object({ catalog: z.boolean(), ai: z.boolean() }), active: z.boolean(),
});
export function requirePlatformOperator(email: string | null | undefined): asserts email is string {
  if (!isPlatformOperator(email)) throw new Error("No tienes permiso para hacer esto.");
}
export async function auditPlatform(tx: Prisma.TransactionClient, operator: string, action: string,
  entity: string, entityId: string, institutionId: string | null, before: unknown, after: unknown) {
  await tx.auditLog.create({ data: { institutionId, action, entity, entityId,
    changes: JSON.parse(JSON.stringify({ operator: operator.trim().toLowerCase(), before, after })) as Prisma.InputJsonValue } });
}
export async function listPlatformPlans(operator: string | null) {
  requirePlatformOperator(operator);
  return db.platformPlan.findMany({ orderBy: { priceCents: "asc" } });
}
export async function updatePlatformPlan(operator: string | null, input: unknown) {
  requirePlatformOperator(operator);
  const { code, ...data } = platformPlanSchema.parse(input);
  return db.$transaction(async (tx) => {
    const before = await tx.platformPlan.findUniqueOrThrow({ where: { code } });
    const after = await tx.platformPlan.update({ where: { code }, data });
    await auditPlatform(tx, operator, "PLATFORM_PLAN_UPDATED", "PlatformPlan", code, null, before, after);
    return after;
  });
}
export async function getInstitutionPlanFeatures(institutionId: string): Promise<{ catalog?: boolean; ai?: boolean } | null> {
  const sub = await db.institutionSubscription.findUnique({ where: { institutionId }, select: { plan: { select: { features: true } } } });
  if (!sub) return null;
  const value = sub.plan.features;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...(typeof value.catalog === "boolean" ? { catalog: value.catalog } : {}),
    ...(typeof value.ai === "boolean" ? { ai: value.ai } : {}) };
}
