export type InstitutionFeatures = { ai: boolean; catalog: boolean; aiLocked: boolean; commissionPercent: number };
export type PlanFeatures = { ai?: boolean; catalog?: boolean } | null;

export function settingsObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Explicit institution values override plan defaults; the platform lock always wins. */
export function resolveInstitutionFeatures(settings: unknown, plan: PlanFeatures = null): InstitutionFeatures {
  const current = settingsObject(settings);
  const ai = settingsObject(current.ai);
  const platform = settingsObject(current.platform);
  const aiLocked = platform.aiLocked === true;
  const commission = platform.commissionPercent;
  return {
    ai: !aiLocked && (typeof ai.enabled === "boolean" ? ai.enabled : plan?.ai ?? true),
    catalog: typeof platform.catalogEnabled === "boolean" ? platform.catalogEnabled : plan?.catalog ?? true,
    aiLocked,
    commissionPercent: typeof commission === "number" && Number.isFinite(commission) && commission >= 0 && commission <= 100
      ? commission : 0,
  };
}

/** Money remains integer cents. The rate is informational; buyer charges are unchanged. */
export function calculateCommission(grossCents: number, percent: number) {
  if (!Number.isSafeInteger(grossCents) || grossCents < 0 || !Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error("Revisa el monto y el porcentaje de comisión.");
  }
  const commissionCents = Math.round(grossCents * percent / 100);
  return { grossCents, commissionCents, netCents: grossCents - commissionCents };
}

export function salesMonth(now = new Date()) {
  return { gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    lt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) };
}

