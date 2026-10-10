/**
 * Formato de cifras y fechas del panel de la plataforma (es-DO, hora de Santo Domingo).
 * Código puro: sirve en servidor, navegador y pruebas. El dinero usa `formatMoney` de finanzas.
 */
export { formatMoney } from "@/server/finance/money";

export const OPERATOR_TIME_ZONE = "America/Santo_Domingo";

const longDay = new Intl.DateTimeFormat("es-DO", { timeZone: OPERATOR_TIME_ZONE, day: "numeric", month: "long", year: "numeric" });
const longDayUtc = new Intl.DateTimeFormat("es-DO", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
const dayAndTime = new Intl.DateTimeFormat("es-DO", {
  timeZone: OPERATOR_TIME_ZONE, day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit",
});
const integer = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 1 });

/** Instante en hora de Santo Domingo: «9 de octubre de 2026». */
export function formatOperatorDate(instant: Date) {
  return longDay.format(instant);
}

/**
 * Día de calendario guardado a medianoche UTC (vencimientos de facturas y del período del plan, que
 * se eligen con un campo de fecha): se lee en UTC para no mostrar el día anterior.
 */
export function formatOperatorDay(day: Date) {
  return longDayUtc.format(day);
}

/** «10 de octubre de 2026, 2:30 p. m.» en hora de Santo Domingo. */
export function formatOperatorDateTime(instant: Date) {
  return dayAndTime.format(instant).replace(/ /g, " ");
}

/** «1,234» */
export function formatCount(value: number) {
  return integer.format(value);
}

/** Uso de un límite: «120 de 1,600»; sin máximo: «120 (sin límite)». */
export function formatUsage(used: number, max: number | null | undefined) {
  return max === null || max === undefined ? `${integer.format(used)} (sin límite)` : `${integer.format(used)} de ${integer.format(max)}`;
}

/** Tamaño en MB: «0 MB», «512 MB», «1.5 GB», «25 GB». Bajo 10 MB conserva un decimal («2.4 MB»). */
export function formatStorageMb(mb: number) {
  if (mb >= 1000) return `${oneDecimal.format(mb / 1000)} GB`;
  if (mb > 0 && mb < 10) return `${oneDecimal.format(mb)} MB`;
  return `${integer.format(Math.round(mb))} MB`;
}

/** Almacenamiento usado contra el máximo del plan: «0 MB de 25 GB». */
export function formatStorageUsage(usedMb: number, maxMb: number | null | undefined) {
  return maxMb === null || maxMb === undefined ? `${formatStorageMb(usedMb)} (sin límite)` : `${formatStorageMb(usedMb)} de ${formatStorageMb(maxMb)}`;
}
