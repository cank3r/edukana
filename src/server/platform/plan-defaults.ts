import type { Prisma } from "@prisma/client";

export const PLATFORM_TRIAL_DAYS = 30;
export const DEFAULT_PLATFORM_PLANS = [
  { code: "FREE", name: "Gratis", priceCents: 0, maxStudents: 30, maxStorageMb: 500, aiRequestsPerMonth: 20 },
  { code: "STARTER", name: "Inicial", priceCents: 150000, maxStudents: 150, maxStorageMb: 5000, aiRequestsPerMonth: 200 },
  { code: "PRO", name: "Profesional", priceCents: 450000, maxStudents: 1600, maxStorageMb: 25000, aiRequestsPerMonth: 2000 },
  { code: "ENTERPRISE", name: "Empresa", priceCents: 900000, maxStudents: null, maxStorageMb: null, aiRequestsPerMonth: null },
] as const;

/** Idempotent seed: never overwrite prices edited by an operator. */
export async function seedPlatformPlans(tx: Prisma.TransactionClient) {
  for (const plan of DEFAULT_PLATFORM_PLANS) {
    await tx.platformPlan.upsert({ where: { code: plan.code }, update: {},
      create: { ...plan, currency: "DOP", features: { catalog: true, ai: true } } });
  }
}

export async function createTrialSubscription(tx: Prisma.TransactionClient, institutionId: string, now = new Date()) {
  await seedPlatformPlans(tx);
  const end = new Date(now.getTime() + PLATFORM_TRIAL_DAYS * 86400000);
  return tx.institutionSubscription.create({ data: {
    institutionId, planCode: "FREE", status: "TRIAL", priceCents: 0,
    currentPeriodStart: now, currentPeriodEnd: end, trialEndsAt: end,
  } });
}
