import { calculateWeightedGrade, type WeightedCategory } from "@/lib/lms";

export type AveragePeriod = { weight: number; categories: WeightedCategory[] };

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Promedio del curso, de 0 a 100, con dos decimales.
 *
 * Cada actividad cuenta como porcentaje de su puntaje máximo. Dentro de una categoría se
 * promedian las actividades con nota; las exoneradas y las que aún no tienen nota no cuentan.
 * Las categorías se combinan según su peso, repartido solo entre las que ya tienen notas, y
 * los períodos igual. Devuelve null si todavía no hay ninguna nota que cuente.
 */
export function courseAverage(periods: AveragePeriod[]): number | null {
  let total = 0;
  let usedWeight = 0;
  for (const period of periods) {
    if (!(period.weight > 0)) continue;
    const grade = calculateWeightedGrade(period.categories);
    if (grade === null) continue;
    total += grade * period.weight;
    usedWeight += period.weight;
  }
  return usedWeight ? round2(total / usedWeight) : null;
}

/** Explica por qué unos pesos no sirven, o devuelve null si suman 100. */
export function categoryWeightsProblem(weights: number[]): string | null {
  if (weights.length === 0) return "Deja al menos una categoría.";
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0 || weight > 100)) {
    return "Cada peso debe ser un número entre 0 y 100.";
  }
  const sum = round2(weights.reduce((acc, weight) => acc + weight, 0));
  if (sum === 100) return null;
  return sum < 100
    ? `Los pesos suman ${formatNumber(sum)} %. Faltan ${formatNumber(100 - sum)} para llegar a 100 %.`
    : `Los pesos suman ${formatNumber(sum)} %. Sobran ${formatNumber(sum - 100)} para quedar en 100 %.`;
}

/** Número sin ceros de relleno: 85, 85.5, 85.25. */
export function formatNumber(value: number): string {
  return String(round2(value));
}

/**
 * Una celda de CSV segura para Excel: el texto que empieza con = + - @ (o tabulador / retorno)
 * lleva un apóstrofo delante para que no se ejecute como fórmula; comas, comillas y saltos de
 * línea van entre comillas. Los números se escriben tal cual.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? formatNumber(value) : "";
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV con BOM UTF-8 y saltos CRLF, para que Excel muestre bien tildes y eñes. */
export function buildCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
