import { db } from "@/lib/db";
import { isPlatformOperator } from "./institutions";
import { calculateCommission, resolveInstitutionFeatures, salesMonth } from "./feature-policy";

export { salesMonth } from "./feature-policy";

/** Group by currency: never add DOP and USD together. The current rate is an estimate, not a settlement. */
export async function getPlatformSales(operatorEmail: string | null | undefined, now = new Date()) {
  if (!isPlatformOperator(operatorEmail)) return null;
  const totals = await db.courseOrder.groupBy({
    by: ["institutionId", "currency"], where: { status: "PAID", paidAt: salesMonth(now) },
    _sum: { amountCents: true }, _count: { _all: true },
  });
  const institutions = await db.institution.findMany({
    where: { id: { in: totals.map((row) => row.institutionId) } }, select: { id: true, name: true, settings: true },
  });
  const byId = new Map(institutions.map((institution) => [institution.id, institution]));
  return totals.map((row) => {
    const institution = byId.get(row.institutionId);
    const commissionPercent = resolveInstitutionFeatures(institution?.settings).commissionPercent;
    return { institutionId: row.institutionId, name: institution?.name ?? "Institución", currency: row.currency,
      count: row._count._all, commissionPercent, ...calculateCommission(row._sum.amountCents ?? 0, commissionPercent) };
  }).sort((a, b) => a.name.localeCompare(b.name) || a.currency.localeCompare(b.currency));
}
