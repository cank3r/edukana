/**
 * Cómo se MUESTRAN las notas (no cómo se calculan). Formato local de República Dominicana (es-DO).
 * - Promedios y notas finales van de 0 a 100: se muestran enteros («89 de 100»).
 * - Puntos de una actividad o examen («8.5 de 10») conservan hasta dos decimales, sin ceros de relleno,
 *   para que coincidan con lo que escribió el docente.
 * Para CSV y mensajes de validación sigue usándose `formatNumber` de `gradebook-calc` (punto decimal fijo).
 */

const LOCALE = "es-DO";
const whole = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0, useGrouping: false });
const precise = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2, useGrouping: false });

/** Promedio o nota final sobre 100, entero: 88.91 → «89». */
export function formatAverage(value: number): string {
  return whole.format(value);
}

/** Puntos o porcentajes con precisión: 85 → «85», 8.5 → «8.5», 2.333 → «2.33». */
export function formatScore(value: number): string {
  return precise.format(value);
}
