import "server-only";

import { db } from "@/lib/db";
import { chargeBalances } from "@/server/finance/charges";
import { listMyChildren, type ChildCard, type GuardianActor } from "@/server/family/guardian-portal";

const OWED_STATUSES = new Set(["PENDING", "PARTIAL", "OVERDUE"]);

export type ParentHomeChild = ChildCard & {
  /** Cargos vencidos con saldo; null cuando el vínculo no permite ver el estado de cuenta. */
  overdueCharges: number | null;
};

export type ParentHome = { children: ParentHomeChild[]; alertsTotal: number };

/**
 * Inicio del tutor: sus hijos (ya autorizados por `listMyChildren`) con sus alertas,
 * más los cargos vencidos de quienes tienen permitido el estado de cuenta.
 */
export async function getParentHome(actor: GuardianActor, now = new Date()): Promise<ParentHome> {
  const cards = await listMyChildren(actor, now);
  const financeIds = cards.filter((card) => card.permissions.finance).map((card) => card.studentId);

  const overdueByStudent = new Map<string, number>();
  if (financeIds.length) {
    const charges = await db.paymentConcept.findMany({
      where: { institutionId: actor.institutionId, studentId: { in: financeIds }, status: { not: "CANCELLED" } },
      select: { id: true, studentId: true, dueDate: true },
    });
    // Mismo criterio que el estado de cuenta del hijo: cuenta el saldo real, no el estado guardado.
    const balances = await chargeBalances(actor.institutionId, charges.map((charge) => charge.id), now);
    for (const charge of charges) {
      const balance = balances.get(charge.id);
      if (!balance || balance.balanceCents <= 0 || !OWED_STATUSES.has(balance.status)) continue;
      const overdue = balance.shownStatus === "OVERDUE" || (charge.dueDate !== null && charge.dueDate < now);
      if (overdue && charge.studentId) overdueByStudent.set(charge.studentId, (overdueByStudent.get(charge.studentId) ?? 0) + 1);
    }
  }

  const children = cards.map((card) => ({ ...card, overdueCharges: card.permissions.finance ? (overdueByStudent.get(card.studentId) ?? 0) : null }));
  const alertsTotal = children.reduce((sum, child) => sum + child.alerts.length + (child.overdueCharges ? 1 : 0), 0);
  return { children, alertsTotal };
}
