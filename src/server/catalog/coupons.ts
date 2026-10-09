import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { addDaysToDateKey, zonedDateKey, zonedTimeToUtc } from "@/lib/timezone";
import { canManageSales, NO_PERMISSION, type SalesActor, type SalesResult } from "./access";
import { normalizeCouponCode } from "./pricing";

export type CouponRow = {
  id: string;
  code: string;
  percentOff: number;
  maxUses: number | null;
  usedCount: number;
  orders: number;
  expiresOn: string | null;
  expired: boolean;
  isActive: boolean;
};

async function timezoneOf(institutionId: string) {
  return (await db.institution.findUnique({ where: { id: institutionId }, select: { timezone: true } }))?.timezone ?? "America/Santo_Domingo";
}

export async function listCoupons(actor: SalesActor, now = new Date()): Promise<CouponRow[] | null> {
  if (!(await canManageSales(actor))) return null;
  const [coupons, timeZone] = await Promise.all([
    db.coupon.findMany({
      where: { institutionId: actor.institutionId },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      take: 200,
      select: { id: true, code: true, percentOff: true, maxUses: true, usedCount: true, expiresAt: true, isActive: true, _count: { select: { orders: true } } },
    }),
    timezoneOf(actor.institutionId),
  ]);
  return coupons.map((coupon) => ({
    id: coupon.id,
    code: coupon.code,
    percentOff: coupon.percentOff,
    maxUses: coupon.maxUses,
    usedCount: coupon.usedCount,
    orders: coupon._count.orders,
    // Vence al terminar ese día en la zona de la institución: se muestra el día, no la medianoche siguiente.
    expiresOn: coupon.expiresAt ? zonedDateKey(new Date(coupon.expiresAt.getTime() - 1), timeZone) : null,
    expired: Boolean(coupon.expiresAt && coupon.expiresAt <= now),
    isActive: coupon.isActive,
  }));
}

/**
 * Crea un cupón de descuento por porcentaje para todos los cursos de la institución.
 * `expiresOn` (AAAA-MM-DD, opcional): último día en que se puede usar. `maxUses` vacío = sin tope.
 */
export async function createCoupon(
  actor: SalesActor,
  input: { code: string; percentOff: string | number; maxUses?: string | number | null; expiresOn?: string | null },
  now = new Date(),
): Promise<SalesResult> {
  if (!(await canManageSales(actor))) return { ok: false, message: NO_PERMISSION };
  const code = normalizeCouponCode(input.code);
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return { ok: false, message: "El código debe tener de 3 a 30 letras o números, sin espacios. Ejemplo: BIENVENIDA10." };
  const percentOff = Number(input.percentOff);
  if (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 100) return { ok: false, message: "El descuento debe ser un número entero entre 1 y 100." };
  const usesText = String(input.maxUses ?? "").trim();
  const maxUses = usesText ? Number(usesText) : null;
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1_000_000)) return { ok: false, message: "Los usos deben ser un número entero mayor que cero, o déjalo vacío para no poner tope." };

  let expiresAt: Date | null = null;
  const expiresOn = String(input.expiresOn ?? "").trim();
  if (expiresOn) {
    const timeZone = await timezoneOf(actor.institutionId);
    const nextDay = /^\d{4}-\d{2}-\d{2}$/.test(expiresOn) ? addDaysToDateKey(expiresOn, 1) : null;
    expiresAt = nextDay ? zonedTimeToUtc(nextDay, "00:00", timeZone) : null;
    if (!expiresAt) return { ok: false, message: "Elige una fecha de vencimiento válida." };
    if (expiresAt <= now) return { ok: false, message: "La fecha de vencimiento ya pasó. Elige hoy o un día futuro." };
  }

  try {
    const coupon = await db.coupon.create({ data: { institutionId: actor.institutionId, code, percentOff, maxUses, expiresAt }, select: { id: true } });
    await db.auditLog.create({ data: { institutionId: actor.institutionId, userId: actor.id, action: "COUPON_CREATED", entity: "Coupon", entityId: coupon.id, changes: { code, percentOff, maxUses } } });
    return { ok: true, message: `Cupón ${code} creado.` };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, message: `Ya existe un cupón con el código ${code}. Elige otro.` };
    throw error;
  }
}

/** Activa o desactiva un cupón. Desactivarlo no cambia los pedidos que ya lo usan. */
export async function setCouponActive(actor: SalesActor, couponId: string, isActive: boolean): Promise<SalesResult> {
  if (!(await canManageSales(actor))) return { ok: false, message: NO_PERMISSION };
  const updated = await db.coupon.updateMany({ where: { id: String(couponId ?? ""), institutionId: actor.institutionId }, data: { isActive } });
  if (!updated.count) return { ok: false, message: "No encontramos ese cupón." };
  await db.auditLog.create({ data: { institutionId: actor.institutionId, userId: actor.id, action: "COUPON_UPDATED", entity: "Coupon", entityId: couponId, changes: { isActive } } });
  return { ok: true, message: isActive ? "Cupón activado." : "Cupón desactivado. Ya no se puede usar en pedidos nuevos." };
}

/** Borra un cupón que nadie ha usado. Si ya está en algún pedido, se desactiva en su lugar. */
export async function deleteCoupon(actor: SalesActor, couponId: string): Promise<SalesResult> {
  if (!(await canManageSales(actor))) return { ok: false, message: NO_PERMISSION };
  const deleted = await db.coupon.deleteMany({ where: { id: String(couponId ?? ""), institutionId: actor.institutionId, usedCount: 0, orders: { none: {} } } });
  if (!deleted.count) return { ok: false, message: "Este cupón ya está en algún pedido y no se puede borrar. Desactívalo para que no se use más." };
  await db.auditLog.create({ data: { institutionId: actor.institutionId, userId: actor.id, action: "COUPON_DELETED", entity: "Coupon", entityId: couponId } });
  return { ok: true, message: "Cupón borrado." };
}
