import "server-only";
import { db } from "@/lib/db";
import { requirePlatformOperator } from "./plans";

export async function getInstitutionPlanUsage(institutionId: string, now = new Date()) {
  const subscription = await db.institutionSubscription.findUnique({ where: { institutionId }, include: { plan: true } });
  if (!subscription) return null;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const [students, storage, aiRequests] = await Promise.all([
    db.user.count({ where: { institutionId, status: "ACTIVE", role: "STUDENT" } }),
    db.storageAsset.aggregate({ where: { institutionId }, _sum: { sizeBytes: true } }),
    db.auditLog.count({ where: { institutionId, action: "AI_USED", createdAt: { gte: start, lt: end } } }),
  ]);
  return { subscription, students, storageMb: (storage._sum.sizeBytes ?? 0) / 1048576, aiRequests };
}
export async function getInstitutionBilling(operator: string | null, institutionId: string) {
  requirePlatformOperator(operator);
  const [institution, usage, invoices] = await Promise.all([
    db.institution.findUniqueOrThrow({ where: { id: institutionId }, select: { name: true } }),
    getInstitutionPlanUsage(institutionId),
    db.platformInvoice.findMany({ where: { institutionId }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return { institution, usage, invoices };
}
