import Link from "next/link";
import type { ReactNode } from "react";

/** Piezas de la pantalla de reportes. Solo HTML y CSS: funcionan sin JavaScript en el navegador. */

export const REPORTS_PATH = "/dashboard/analitica";
export type Query = Record<string, string | undefined>;

/** Enlace a la misma pantalla cambiando solo algunos parámetros (los vacíos se quitan). */
export function reportHref(current: Query, changes: Query = {}, anchor?: string, path = REPORTS_PATH): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...changes })) if (value) params.set(key, value);
  const query = params.toString();
  return `${path}${query ? `?${query}` : ""}${anchor ? `#${anchor}` : ""}`;
}

export function Figure({ label, value, meaning, comparison }: { label: string; value: string; meaning: string; comparison?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      <p className="mt-1 text-3xl font-bold" style={{ color: "var(--navy)" }}>{value}</p>
      <p className="mt-1 text-sm text-slate-600">{meaning}</p>
      {comparison && <p className="mt-2 text-sm font-medium text-slate-800">{comparison}</p>}
    </div>
  );
}

export function Section({ id, title, description, downloadHref, children }: { id: string; title: string; description: string; downloadHref?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="scroll-mt-4 space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-titulo`} className="text-lg font-bold" style={{ color: "var(--navy)" }}>{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
        {downloadHref && (
          // Descarga directa: un <a> normal, sin precarga.
          <a href={downloadHref} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800">
            Descargar en CSV
          </a>
        )}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">{children}</p>;
}

export type Bar = { label: string; value: number; text: string; warn?: boolean };

/**
 * Barras horizontales hechas con HTML y CSS. Cada barra lleva su texto alternativo y el valor queda escrito al lado,
 * así que se entiende sin ver los colores.
 */
export function Bars({ title, bars, max }: { title: string; bars: Bar[]; max?: number }) {
  const top = max ?? Math.max(1, ...bars.map((bar) => bar.value));
  if (bars.length === 0) return null;
  return (
    <figure className="rounded-lg bg-slate-50 p-3">
      <figcaption className="mb-2 text-sm font-semibold text-slate-700">{title}</figcaption>
      <ul className="space-y-2">
        {bars.map((bar, index) => (
          <li key={`${bar.label}-${index}`} className="grid grid-cols-1 items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(0,14rem)_1fr]">
            <span className="truncate text-slate-800">{bar.label}</span>
            <span className="flex items-center gap-2">
              <span role="img" aria-label={`${bar.label}: ${bar.text}`} className="block h-3 flex-1 overflow-hidden rounded-full bg-slate-200">
                <span
                  className="block h-3 rounded-full"
                  style={{ width: `${Math.max(0, Math.min(100, (bar.value / top) * 100))}%`, background: bar.warn ? "var(--coral)" : "var(--blue)" }}
                />
              </span>
              <span className="w-28 shrink-0 text-right font-semibold text-slate-900">{bar.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export type Column = {
  label: string;
  /** Si se puede ordenar: el nombre que va en la URL. */
  sort?: string;
  /** Los números se ordenan primero de mayor a menor. */
  numeric?: boolean;
};

/**
 * Tabla corta que se ordena con enlaces. En pantallas angostas cada fila se muestra como una ficha
 * con el nombre de cada dato, para no obligar a deslizar hacia los lados.
 */
export function SortableTable({
  caption,
  columns,
  rows,
  query,
  sortParam,
  activeSort,
  anchor,
}: {
  caption: string;
  columns: Column[];
  rows: Array<{ key: string; cells: ReactNode[]; highlight?: boolean }>;
  query: Query;
  sortParam: string;
  activeSort: { key: string; desc: boolean };
  anchor: string;
}) {
  const sortable = columns.filter((column) => column.sort);
  const nextValue = (column: Column) => {
    const active = activeSort.key === column.sort;
    const desc = active ? !activeSort.desc : Boolean(column.numeric);
    return `${desc ? "-" : ""}${column.sort}`;
  };
  return (
    <div>
      {/* En el celular no hay encabezados de tabla: los mismos enlaces de orden van aquí. */}
      <p className="mb-2 flex flex-wrap items-center gap-x-3 text-sm text-slate-600 sm:hidden">
        <span>Ordenar por:</span>
        {sortable.map((column) => (
          <Link key={column.sort} href={reportHref(query, { [sortParam]: nextValue(column) }, anchor)} className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline">
            {column.label}
            {activeSort.key === column.sort ? (activeSort.desc ? " ↓" : " ↑") : ""}
          </Link>
        ))}
      </p>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="hidden sm:table-header-group">
          <tr className="border-b border-slate-200 text-slate-600">
            {columns.map((column) => {
              const active = activeSort.key === column.sort;
              return (
                <th key={column.label} scope="col" aria-sort={active ? (activeSort.desc ? "descending" : "ascending") : undefined} className="px-2 py-1 align-bottom font-semibold">
                  {column.sort ? (
                    <Link href={reportHref(query, { [sortParam]: nextValue(column) }, anchor)} className="inline-flex min-h-11 items-center text-blue-700 underline">
                      {column.label}
                      {active ? (activeSort.desc ? " ↓" : " ↑") : ""}
                    </Link>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="block sm:table-row-group">
          {rows.map((row) => (
            <tr key={row.key} className={`block border-b border-slate-100 py-2 sm:table-row sm:py-0 ${row.highlight ? "bg-amber-50" : ""}`}>
              {row.cells.map((cell, index) => (
                <td key={columns[index].label} className="block px-2 py-0.5 text-slate-900 sm:table-cell sm:py-2">
                  {index > 0 && <span className="text-slate-600 sm:hidden">{columns[index].label}: </span>}
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
