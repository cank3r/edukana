/**
 * CSV para abrir en Excel o en Hojas de cálculo: empieza con la marca UTF-8 (para que las tildes se vean bien),
 * separa con comas y termina cada fila con CRLF. Código puro.
 */

export type CsvValue = string | number | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

/** Una celda segura: sin fórmulas que se ejecuten al abrir el archivo y con comas, comillas y saltos entre comillas. */
export function reportCsvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  // Un texto que empieza con = + - @ se abriría como fórmula: el apóstrofo lo deja como texto.
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function reportCsv(rows: CsvValue[][]): string {
  return `﻿${rows.map((row) => row.map(reportCsvCell).join(",")).join("\r\n")}\r\n`;
}
