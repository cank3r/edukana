/** Formato de cifras del tablero (es-DO). Código puro: sirve en servidor y en pruebas. */

const integer = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 1 });

/** Raya que se muestra cuando todavía no hay datos. */
export const NO_DATA = "—";

export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined ? NO_DATA : integer.format(value);
}

/** «82 %»; con un decimal solo por debajo de 10 % («7.5 %»), donde el decimal sí cambia la lectura. */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NO_DATA;
  const rounded = Math.abs(value) < 10 ? oneDecimal.format(value) : integer.format(Math.round(value));
  return `${rounded} %`;
}

export function formatMoneyShort(cents: number | null | undefined, currency = "DOP"): string {
  if (cents === null || cents === undefined) return NO_DATA;
  try {
    return new Intl.NumberFormat("es-DO", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
  } catch {
    return `${integer.format(cents / 100)} ${currency}`;
  }
}

/** Parte de un total en porcentaje; null si el total es cero (no hay con qué calcular). */
export function share(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null;
}

export type Change = {
  /** Diferencia ya redondeada como se muestra (puntos para porcentajes, unidades para conteos). */
  diff: number;
  direction: "up" | "down" | "same";
  /** Si subir es bueno (asistencia) o malo (deuda vencida): decide el color. */
  tone: "good" | "bad" | "neutral";
  /** «4 puntos más que la semana pasada». */
  text: string;
};

/**
 * Cambio contra la ventana anterior. Null si alguna de las dos cifras no existe.
 * `kind` decide la unidad: puntos (porcentajes), personas/entregas (conteos) o dinero.
 */
export function compare(
  current: number | null,
  previous: number | null,
  previousLabel: string,
  options: { kind: "points" | "count" | "money"; higherIsBetter: boolean; currency?: string; unit?: [string, string] },
): Change | null {
  if (current === null || previous === null) return null;
  // Se comparan las cifras tal como se ven redondeadas: «82 %» contra «80 %» son 2 puntos, no 1,6.
  const diff = Math.round(current) - Math.round(previous);
  const direction = diff > 0 ? "up" : diff < 0 ? "down" : "same";
  const tone = direction === "same" ? "neutral" : (direction === "up") === options.higherIsBetter ? "good" : "bad";
  const size = Math.abs(diff);
  let amount: string;
  if (options.kind === "points") amount = `${integer.format(size)} ${size === 1 ? "punto" : "puntos"}`;
  else if (options.kind === "money") amount = formatMoneyShort(size, options.currency);
  else amount = options.unit ? `${integer.format(size)} ${size === 1 ? options.unit[0] : options.unit[1]}` : integer.format(size);
  const text = direction === "same" ? `Igual que ${previousLabel}` : `${amount} ${direction === "up" ? "más" : "menos"} que ${previousLabel}`;
  return { diff, direction, tone, text };
}
