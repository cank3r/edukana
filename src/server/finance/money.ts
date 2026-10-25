/**
 * Dinero en centavos enteros. Código puro (sin base de datos): sirve en servidor, navegador y pruebas.
 * Nunca se suma ni se compara con decimales; el decimal antiguo `amount` solo se escribe como copia.
 */

export type ChargeStatus = "PENDING" | "PAID" | "PARTIAL" | "OVERDUE" | "CANCELLED";
export type ShownStatus = "PENDING" | "PARTIAL" | "OVERDUE" | "PAID" | "CANCELLED";

export const DEFAULT_CURRENCY = "DOP";
/** `amountCents` es un entero de 32 bits en la base: 20 millones es el tope seguro. */
export const MAX_CENTS = 2_000_000_000;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Convierte lo que escribe una persona («3500», «3,500.00», «3500,5», «RD$ 3,500») a centavos.
 * Devuelve null si no es un monto claro, si es negativo o si tiene más de dos decimales.
 */
export function parseMoneyToCents(text: string): number | null {
  const clean = String(text ?? "").replace(/\s/g, "").replace(/^[A-Za-z]{0,3}\$?/, "");
  let whole: string;
  let fraction = "";
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(clean) || /^\d+(\.\d{1,2})?$/.test(clean)) {
    [whole, fraction = ""] = clean.replace(/,/g, "").split(".");
  } else if (/^\d+,\d{1,2}$/.test(clean)) {
    [whole, fraction = ""] = clean.split(",");
  } else {
    return null;
  }
  if (whole.length > 9) return null;
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0") || "0");
  return Number.isSafeInteger(cents) && cents <= MAX_CENTS ? cents : null;
}

/** Centavos de un cargo: el campo nuevo manda; los cargos antiguos solo tienen el decimal. */
export function chargeCents(charge: { amount: number; amountCents: number | null }): number {
  return charge.amountCents ?? Math.round(charge.amount * 100);
}

/** Valor para el campo decimal antiguo, derivado siempre de los centavos. */
export function centsToDecimal(cents: number): number {
  return cents / 100;
}

/** Texto para volver a llenar un campo de monto: «3500.00». */
export function centsToInput(cents: number): string {
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function isCurrencyCode(value: unknown): value is string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) return false;
  try {
    new Intl.NumberFormat("es-DO", { style: "currency", currency: value });
    return true;
  } catch {
    return false;
  }
}

/** Moneda guardada en los ajustes de la institución (`settings.currency`); si no hay, pesos dominicanos. */
export function institutionCurrency(settings: unknown): string {
  const value = settings && typeof settings === "object" && !Array.isArray(settings) ? (settings as Record<string, unknown>).currency : null;
  return isCurrencyCode(value) ? value : DEFAULT_CURRENCY;
}

/** «RD$3,500.00» */
export function formatMoney(cents: number, currency: string = DEFAULT_CURRENCY): string {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: isCurrencyCode(currency) ? currency : DEFAULT_CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Estado que corresponde guardar según lo pagado. */
export function statusForPaid(amountCents: number, paidCents: number): "PENDING" | "PARTIAL" | "PAID" {
  if (paidCents >= amountCents) return "PAID";
  return paidCents > 0 ? "PARTIAL" : "PENDING";
}

/**
 * Lo pagado de un cargo: la suma de sus pagos registrados. Un cargo antiguo marcado como pagado
 * sin pagos registrados cuenta como pagado completo.
 */
export function paidCentsOf(status: ChargeStatus, amountCents: number, recordedCents: number): number {
  if (status === "PAID" && recordedCents < amountCents) return amountCents;
  return Math.min(recordedCents, amountCents);
}

/** Las fechas de vencimiento se guardan al mediodía UTC del día elegido: el día se lee en UTC. */
export function dueDateKey(dueDate: Date | null): string | null {
  return dueDate ? dueDate.toISOString().slice(0, 10) : null;
}

/** Convierte `AAAA-MM-DD` a la fecha que se guarda (mediodía UTC). Null si la fecha no existe. */
export function dateKeyToStored(key: string): Date | null {
  const match = DATE_RE.exec(key);
  if (!match) return null;
  const date = new Date(`${key}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== key) return null;
  return date;
}

/**
 * Estado que se muestra. Un cargo pendiente o con pago parcial cuyo vencimiento ya pasó se muestra
 * vencido; se calcula al leer con el día de hoy (`todayKey`, `AAAA-MM-DD` en la zona de la institución).
 * El día del vencimiento todavía no está vencido.
 */
export function shownStatus(status: ChargeStatus, dueKey: string | null, todayKey: string): ShownStatus {
  if (status === "CANCELLED" || status === "PAID") return status;
  if (status === "OVERDUE" || (dueKey !== null && dueKey < todayKey)) return "OVERDUE";
  return status;
}
