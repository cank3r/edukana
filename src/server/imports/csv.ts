/**
 * Lector CSV mínimo (RFC 4180): comillas dobles, comillas escapadas, saltos de línea dentro de
 * un campo, BOM de Excel y separador coma, punto y coma o tabulación (detectado en la cabecera).
 */
export function detectDelimiter(headerLine: string) {
  const counts = [",", ";", "\t"].map((delimiter) => ({ delimiter, count: headerLine.split(delimiter).length }));
  return counts.sort((a, b) => b.count - a.count)[0].delimiter;
}

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const delimiter = detectDelimiter(text.split(/\r?\n/, 1)[0] ?? "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

/** Escribe un CSV que Excel abre bien: BOM, comillas cuando hacen falta y fórmulas neutralizadas. */
export function toCsv(rows: string[][]) {
  const escape = (value: string) => {
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return `﻿${rows.map((row) => row.map(escape).join(",")).join("\r\n")}\r\n`;
}
