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

/**
 * Saldo de un cargo a partir de lo pagado (pagos no anulados), en centavos.
 *
 * - `hasPaymentRows`: el cargo tiene filas en la tabla de pagos (aunque estén anuladas). Entonces lo
 *   pagado es exactamente la suma de los pagos vigentes y el estado se deriva de ella.
 * - Sin filas (cargo antiguo): se respeta la regla anterior; un cargo guardado como pagado sin pagos
 *   registrados cuenta como pagado completo.
 *
 * El estado devuelto es el que corresponde guardar (PENDING, PARTIAL, PAID o CANCELLED); un OVERDUE
 * antiguo guardado se conserva mientras no esté pagado.
 */
export function chargeBalanceOf(stored: ChargeStatus, amountCents: number, activePaidCents: number, hasPaymentRows: boolean) {
  const paidCents = hasPaymentRows ? Math.min(activePaidCents, amountCents) : paidCentsOf(stored, amountCents, activePaidCents);
  if (stored === "CANCELLED") return { paidCents, balanceCents: 0, status: "CANCELLED" as ChargeStatus };
  const derived = statusForPaid(amountCents, paidCents);
  const status: ChargeStatus = derived !== "PAID" && stored === "OVERDUE" ? "OVERDUE" : derived;
  return { paidCents, balanceCents: Math.max(0, amountCents - paidCents), status };
}

/** Número corto y estable del recibo, derivado del identificador del pago: «A1B2C3D4». */
export function receiptNumber(paymentId: string): string {
  const clean = paymentId.replace(/[^A-Za-z0-9]/g, "");
  return clean.slice(-8).toUpperCase().padStart(8, "0");
}

const UNITS = [
  "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
  "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve",
  "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve",
];
const TENS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const HUNDREDS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

function belowThousand(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cien";
  const rest = n % 100;
  const parts = n >= 100 ? [HUNDREDS[Math.floor(n / 100)]] : [];
  if (rest > 0) parts.push(rest < 30 ? UNITS[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? ` y ${UNITS[rest % 10]}` : ""}`);
  return parts.join(" ");
}

/** «uno» delante de un sustantivo se acorta: «un mil» no, pero «veintiún mil», «un peso», «treinta y un pesos». */
const shorten = (words: string) => words.replace(/veintiuno$/, "veintiún").replace(/uno$/, "un");

/** Número entero en letras, en español: 3500 → «tres mil quinientos». */
export function integerToWords(value: number): string {
  const n = Math.trunc(Math.abs(value));
  if (n === 0) return "cero";
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions) parts.push(millions === 1 ? "un millón" : `${shorten(integerToWords(millions))} millones`);
  if (thousands) parts.push(thousands === 1 ? "mil" : `${shorten(belowThousand(thousands))} mil`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(" ");
}

const CURRENCY_WORDS: Record<string, [string, string]> = {
  DOP: ["peso dominicano", "pesos dominicanos"],
  USD: ["dólar estadounidense", "dólares estadounidenses"],
  EUR: ["euro", "euros"],
  MXN: ["peso mexicano", "pesos mexicanos"],
  COP: ["peso colombiano", "pesos colombianos"],
};

/** Monto en letras para un recibo: 350000 centavos DOP → «Tres mil quinientos pesos dominicanos con 00/100». */
export function amountInWords(cents: number, currency: string = DEFAULT_CURRENCY): string {
  const units = Math.trunc(cents / 100);
  const fraction = String(Math.abs(cents % 100)).padStart(2, "0");
  const [one, many] = CURRENCY_WORDS[currency] ?? [currency, currency];
  const words = units === 1 ? "un" : shorten(integerToWords(units));
  // «un millón de pesos», «dos millones de pesos»: con millones exactos se agrega «de».
  const joiner = units >= 1_000_000 && units % 1_000_000 === 0 ? " de" : "";
  const text = `${words}${joiner} ${units === 1 ? one : many} con ${fraction}/100`;
  return text.charAt(0).toUpperCase() + text.slice(1);
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
