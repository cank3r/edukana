import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sendInvitations } from "@/server/people/invitations";
import { canManageSales, NO_PERMISSION, type SalesActor, type SalesResult } from "./access";
import { applyEnrollment, checkSeat, rowLocked } from "./buyer";
import { ORDER_STATUSES, orderNumber, type OrderStatus } from "./pricing";

export const PAYMENT_METHODS = ["TRANSFER", "CASH", "CARD", "OTHER"] as const;
const NOT_FOUND = "No encontramos ese pedido en tu institución.";

export type OrderRow = {
  id: string;
  number: string;
  courseName: string;
  buyerName: string;
  buyerEmail: string;
  amountCents: number;
  currency: string;
  status: OrderStatus;
  couponCode: string | null;
  createdAt: Date;
  paidAt: Date | null;
  paymentMethod: string | null;
  paymentNote: string | null;
};

/** Pedidos de la institución con filtros por estado, curso y texto (nombre, correo o número). */
export async function listOrders(actor: SalesActor, filters: { status?: string; courseId?: string; q?: string }) {
  if (!(await canManageSales(actor))) return null;
  const status = ORDER_STATUSES.find((value) => value === filters.status);
  const q = (filters.q ?? "").trim().slice(0, 100);
  const where: Prisma.CourseOrderWhereInput = {
    institutionId: actor.institutionId,
    ...(status ? { status } : {}),
    ...(filters.courseId ? { courseId: filters.courseId } : {}),
    ...(q
      ? {
          OR: [
            { buyer: { name: { contains: q, mode: "insensitive" } } },
            { buyer: { email: { contains: q, mode: "insensitive" } } },
            ...(/^[a-z0-9]{4,8}$/i.test(q) ? [{ id: { endsWith: q.toLowerCase() } }] : []),
          ],
        }
      : {}),
  };
  const [orders, counts] = await Promise.all([
    db.courseOrder.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      select: {
        id: true,
        amountCents: true,
        currency: true,
        status: true,
        createdAt: true,
        paidAt: true,
        paymentMethod: true,
        paymentNote: true,
        course: { select: { name: true } },
        buyer: { select: { name: true, email: true } },
        coupon: { select: { code: true } },
      },
    }),
    db.courseOrder.groupBy({ by: ["status"], where: { institutionId: actor.institutionId }, _count: { _all: true } }),
  ]);
  return {
    orders: orders.map<OrderRow>((order) => ({
      id: order.id,
      number: orderNumber(order.id),
      courseName: order.course.name,
      buyerName: order.buyer.name,
      buyerEmail: order.buyer.email,
      amountCents: order.amountCents,
      currency: order.currency,
      status: (ORDER_STATUSES.find((value) => value === order.status) ?? "PENDING") as OrderStatus,
      couponCode: order.coupon?.code ?? null,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      paymentMethod: order.paymentMethod,
      paymentNote: order.paymentNote,
    })),
    counts: Object.fromEntries(counts.map((row) => [row.status, row._count._all])) as Partial<Record<OrderStatus, number>>,
  };
}

async function lockOrder(tx: Prisma.TransactionClient, institutionId: string, orderId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; status: string; courseId: string; buyerId: string; couponId: string | null }>>`
    SELECT "id", "status", "courseId", "buyerId", "couponId" FROM "course_orders"
    WHERE "id" = ${orderId} AND "institutionId" = ${institutionId} FOR UPDATE`;
  return rows[0] ?? null;
}

/**
 * Confirma el pago: marca el pedido pagado, gasta un uso del cupón, activa a la persona, la
 * inscribe y le envía su invitación. Repetirlo no hace nada más. Si algo impide inscribir
 * (cupos, cupón agotado, persona suspendida) no cambia nada y dice qué hacer.
 */
export async function confirmOrderPayment(actor: SalesActor, orderId: string, input: { method: string; note?: string }, now = new Date()): Promise<SalesResult> {
  if (!(await canManageSales(actor))) return { ok: false, message: NO_PERMISSION };
  const method = PAYMENT_METHODS.find((value) => value === input.method);
  if (!method) return { ok: false, message: "Elige cómo se recibió el pago." };
  const note = (input.note ?? "").trim();
  if (note.length > 300) return { ok: false, message: "La nota es demasiado larga (máximo 300 caracteres)." };
  if (!orderId) return { ok: false, message: NOT_FOUND };

  const outcome = await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, actor.institutionId, orderId);
    if (!order) return { ok: false, message: NOT_FOUND } as const;
    if (order.status === "PAID") return { ok: true, message: "Este pedido ya estaba confirmado. No se cambió nada.", invite: null } as const;
    if (order.status !== "PENDING") return { ok: false, message: "Este pedido está cancelado: no se puede confirmar." } as const;

    const buyer = await tx.user.findFirst({ where: { id: order.buyerId, institutionId: actor.institutionId }, select: { id: true, role: true, status: true } });
    if (!buyer || buyer.status === "SUSPENDED") {
      return { ok: false, message: "La persona de este pedido tiene el acceso suspendido. Reactívala en Personas antes de confirmar." } as const;
    }
    if (buyer.role !== "STUDENT") {
      return { ok: false, message: "La persona de este pedido no es estudiante en tu institución, así que no se puede inscribir. Cancela el pedido." } as const;
    }
    const seat = await checkSeat(tx, actor.institutionId, order.courseId, buyer.id);
    if (!seat.ok) return { ok: false, message: `${seat.message} Aumenta el cupo del curso o cancela el pedido.` } as const;

    if (order.couponId) {
      // Incremento atómico: solo suma si quedan usos. Dos confirmaciones a la vez no superan el tope.
      const used = await tx.$executeRaw`
        UPDATE "coupons" SET "usedCount" = "usedCount" + 1
        WHERE "id" = ${order.couponId} AND ("maxUses" IS NULL OR "usedCount" < "maxUses")`;
      if (used === 0) {
        return { ok: false, message: "El cupón de este pedido ya se usó todas las veces permitidas. Cancela el pedido y pide a la persona que lo haga de nuevo sin cupón." } as const;
      }
    }
    if (buyer.status !== "ACTIVE") await tx.user.update({ where: { id: buyer.id }, data: { status: "ACTIVE" } });
    const enrollment = await applyEnrollment(tx, actor.institutionId, order.courseId, buyer.id, seat.enrollment);
    await tx.courseOrder.update({ where: { id: order.id }, data: { status: "PAID", paymentMethod: method, paymentNote: note || null, paidAt: now } });
    await tx.auditLog.create({
      data: { institutionId: actor.institutionId, userId: actor.id, action: "COURSE_ORDER_PAID", entity: "CourseOrder", entityId: order.id, changes: { method, enrollment } },
    });
    return { ok: true, message: "Pago confirmado. La persona quedó inscrita y le enviamos su acceso por correo.", invite: buyer.id } as const;
  }, rowLocked);

  if (!outcome.ok) return { ok: false, message: outcome.message };
  if (outcome.invite) {
    const sent = await sendInvitations(actor, [outcome.invite], now);
    if (!sent.sent) return { ok: true, message: "Pago confirmado y persona inscrita, pero no se pudo enviar el correo. Envíale la invitación desde Personas." };
  }
  return { ok: true, message: outcome.message };
}

/** Cancela un pedido pendiente. No borra nada: queda en la lista como cancelado. */
export async function cancelOrder(actor: SalesActor, orderId: string): Promise<SalesResult> {
  if (!(await canManageSales(actor))) return { ok: false, message: NO_PERMISSION };
  if (!orderId) return { ok: false, message: NOT_FOUND };
  return db.$transaction(async (tx) => {
    const order = await lockOrder(tx, actor.institutionId, orderId);
    if (!order) return { ok: false, message: NOT_FOUND } as const;
    if (order.status === "CANCELLED") return { ok: true, message: "Este pedido ya estaba cancelado." } as const;
    if (order.status !== "PENDING") return { ok: false, message: "Este pedido ya está pagado: no se puede cancelar." } as const;
    await tx.courseOrder.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    await tx.auditLog.create({ data: { institutionId: actor.institutionId, userId: actor.id, action: "COURSE_ORDER_CANCELLED", entity: "CourseOrder", entityId: order.id } });
    return { ok: true, message: "Pedido cancelado." } as const;
  }, rowLocked);
}
