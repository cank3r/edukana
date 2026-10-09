import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { auditPlatform, requirePlatformOperator } from "./plans";
import { lockBilling } from "./subscriptions";

export const invoicePeriodSchema = z.object({ periodStart: z.date(), periodEnd: z.date(), dueDate: z.date() })
  .refine((value) => value.periodEnd > value.periodStart, "El final del período debe ser posterior al inicio.");
export async function generatePlatformInvoice(operator: string | null, institutionId: string, input: unknown) {
  requirePlatformOperator(operator);
  const period = invoicePeriodSchema.parse(input);
  return db.$transaction(async (tx) => {
    await lockBilling(tx, institutionId);
    const sub = await tx.institutionSubscription.findUniqueOrThrow({ where: { institutionId }, include: { plan: true } });
    const duplicate = await tx.platformInvoice.findFirst({ where: { institutionId, periodStart: period.periodStart,
      periodEnd: period.periodEnd, status: { not: "VOID" } } });
    if (duplicate) throw new Error("Ya hay una factura para este período.");
    const after = await tx.platformInvoice.create({ data: { institutionId, ...period,
      amountCents: sub.priceCents, currency: sub.plan.currency, recordedBy: operator.trim().toLowerCase() } });
    await auditPlatform(tx, operator, "PLATFORM_INVOICE_CREATED", "PlatformInvoice", after.id, institutionId, null, after);
    return after;
  });
}
export async function payPlatformInvoice(operator: string | null, institutionId: string, invoiceId: string, input: unknown) {
  requirePlatformOperator(operator);
  const payment = z.object({ paymentMethod: z.enum(["transferencia", "efectivo", "tarjeta", "otro"]),
    reference: z.string().trim().max(200).optional(), paidAt: z.date() }).parse(input);
  if (payment.paidAt > new Date()) throw new Error("La fecha del pago no puede estar en el futuro.");
  return db.$transaction(async (tx) => {
    await lockBilling(tx, institutionId);
    const before = await tx.platformInvoice.findFirstOrThrow({ where: { id: invoiceId, institutionId } });
    if (before.status !== "OPEN") throw new Error("Solo puedes pagar una factura abierta.");
    const after = await tx.platformInvoice.update({ where: { id: invoiceId },
      data: { ...payment, status: "PAID", recordedBy: operator.trim().toLowerCase() } });
    const sub = await tx.institutionSubscription.findUnique({ where: { institutionId } });
    // Current overlapping period or contiguous next period: no gaps, no shortening, no revival of canceled subscriptions.
    if (sub && sub.status !== "CANCELED" && before.periodStart <= sub.currentPeriodEnd && before.periodEnd >= sub.currentPeriodEnd) {
      const updated = await tx.institutionSubscription.update({ where: { institutionId }, data: {
        status: "ACTIVE", currentPeriodEnd: before.periodEnd > sub.currentPeriodEnd ? before.periodEnd : sub.currentPeriodEnd,
      } });
      await auditPlatform(tx, operator, "PLATFORM_SUBSCRIPTION_PAYMENT_APPLIED", "InstitutionSubscription", sub.id, institutionId, sub, updated);
    }
    await auditPlatform(tx, operator, "PLATFORM_INVOICE_PAID", "PlatformInvoice", invoiceId, institutionId, before, after);
    return after;
  });
}
export async function voidPlatformInvoice(operator: string | null, institutionId: string, invoiceId: string) {
  requirePlatformOperator(operator);
  return db.$transaction(async (tx) => {
    await lockBilling(tx, institutionId);
    const before = await tx.platformInvoice.findFirstOrThrow({ where: { id: invoiceId, institutionId } });
    if (before.status !== "OPEN") throw new Error("Solo puedes anular una factura abierta.");
    const after = await tx.platformInvoice.update({ where: { id: invoiceId }, data: { status: "VOID", recordedBy: operator } });
    await auditPlatform(tx, operator, "PLATFORM_INVOICE_VOIDED", "PlatformInvoice", invoiceId, institutionId, before, after);
    return after;
  });
}
export async function listPlatformInvoices(operator: string | null, filter = "OPEN", now = new Date()) {
  requirePlatformOperator(operator);
  const status = z.enum(["OPEN", "OVERDUE", "PAID", "VOID", "ALL"]).parse(filter);
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const [invoices, totals] = await Promise.all([
    db.platformInvoice.findMany({ where: status === "ALL" ? {} : status === "OVERDUE"
      ? { status: "OPEN", dueDate: { lt: now } } : { status }, include: { institution: { select: { name: true } } },
      orderBy: { dueDate: "asc" }, take: 200 }),
    db.platformInvoice.groupBy({ by: ["currency"], where: { status: "OPEN", dueDate: { gte: month, lt: next } },
      _sum: { amountCents: true } }),
  ]);
  return { invoices, totals };
}
