/**
 * Reglas puras de la venta de cursos: precio con cupón, número de pedido y validez del cupón.
 * Dinero siempre en centavos enteros.
 */

export type CouponRule = { percentOff: number; maxUses: number | null; usedCount: number; expiresAt: Date | null; isActive: boolean };

export const ORDER_STATUSES = ["PENDING", "PAID", "CANCELLED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Un curso es gratis si no tiene precio o el precio es cero. */
export const isFree = (priceCents: number | null | undefined) => !priceCents || priceCents <= 0;

/** Precio final tras el descuento, redondeado al centavo. */
export function discountedCents(priceCents: number, percentOff: number) {
  const pct = Math.min(100, Math.max(0, Math.trunc(percentOff)));
  return Math.round((priceCents * (100 - pct)) / 100);
}

/** «A1B2C3D4»: lo que la persona ve y dicta al pagar. */
export const orderNumber = (id: string) => id.slice(-8).toUpperCase();

export const normalizeCouponCode = (code: string) => String(code ?? "").trim().toUpperCase().replace(/\s+/g, "");

/** null si el cupón se puede usar ahora; si no, por qué no, en palabras de quien compra. */
export function couponProblem(coupon: CouponRule | null, now = new Date()): string | null {
  if (!coupon || !coupon.isActive) return "Ese cupón no existe o ya no está activo. Revisa cómo lo escribiste o déjalo vacío.";
  if (coupon.expiresAt && coupon.expiresAt.getTime() <= now.getTime()) return "Ese cupón ya venció. Puedes continuar sin cupón.";
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return "Ese cupón ya se usó todas las veces permitidas. Puedes continuar sin cupón.";
  return null;
}

/** Texto de ajustes de la institución (`settings.paymentInstructions`), o uno genérico. */
export function paymentInstructionsOf(settings: unknown, institutionName: string): string {
  const value = settings && typeof settings === "object" && !Array.isArray(settings) ? (settings as Record<string, unknown>).paymentInstructions : null;
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 2000);
  return `Comunícate con ${institutionName} para hacer el pago por transferencia o en persona. Menciona tu número de pedido. Cuando confirmen el pago, te llegará un correo para entrar al curso.`;
}
