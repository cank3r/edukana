import { formatPercent } from "@/server/dashboard/format";

export type TrendSeries = {
  key: string;
  label: string;
  values: Array<number | null>;
  /** Texto de cada semana para la tabla («12 de 15 clases»). */
  details: string[];
  color: string;
  dashed?: boolean;
};

type Size = { width: number; height: number; font: number; /** Cada cuántas semanas se rotula el eje. */ every: number };
const DESKTOP: Size = { width: 640, height: 220, font: 12, every: 1 };
/** En el celular el dibujo se hace a su propio tamaño: el texto no se achica y se rotulan semanas alternas. */
const MOBILE: Size = { width: 340, height: 220, font: 12, every: 2 };

/**
 * Gráfico de líneas de porcentajes por semana, en SVG propio.
 * Accesible: título y descripción del SVG, y los valores completos en una tabla para lectores de pantalla.
 * Una semana sin datos deja un hueco en la línea (no se inventa un cero).
 */
export function TrendChart({ id, title, summary, weeks, series, threshold }: {
  id: string;
  title: string;
  summary: string;
  weeks: string[];
  series: TrendSeries[];
  threshold?: { value: number; label: string };
}) {
  return (
    <figure className="min-w-0">
      <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-700" aria-hidden="true">
        {series.map((line) => (
          <span key={line.key} className="inline-flex items-center gap-2">
            <svg width="28" height="10" viewBox="0 0 28 10"><line x1="1" x2="27" y1="5" y2="5" stroke={line.color} strokeWidth="3" strokeDasharray={line.dashed ? "6 4" : undefined} strokeLinecap="round" /></svg>
            {line.label}
          </span>
        ))}
      </div>
      <ChartSvg id={`${id}-m`} className="sm:hidden" size={MOBILE} title={title} summary={summary} weeks={weeks} series={series} threshold={threshold} />
      <ChartSvg id={`${id}-e`} className="hidden sm:block" size={DESKTOP} title={title} summary={summary} weeks={weeks} series={series} threshold={threshold} />
      <table className="sr-only">
        <caption>{title}, semana por semana</caption>
        <thead>
          <tr>
            <th scope="col">Semana que empieza</th>
            {series.map((line) => <th key={line.key} scope="col">{line.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {weeks.map((label, index) => (
            <tr key={label + index}>
              <th scope="row">{index === weeks.length - 1 ? `${label} (esta semana)` : label}</th>
              {series.map((line) => <td key={line.key}>{line.values[index] === null ? "Sin datos" : `${formatPercent(line.values[index])} (${line.details[index]})`}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function ChartSvg({ id, className, size, title, summary, weeks, series, threshold }: {
  id: string;
  className: string;
  size: Size;
  title: string;
  summary: string;
  weeks: string[];
  series: TrendSeries[];
  threshold?: { value: number; label: string };
}) {
  const pad = { top: 16, right: 20, bottom: 30, left: 50 };
  const plotW = size.width - pad.left - pad.right;
  const plotH = size.height - pad.top - pad.bottom;
  const x = (index: number) => pad.left + (weeks.length <= 1 ? plotW / 2 : (index / (weeks.length - 1)) * plotW);
  const y = (value: number) => pad.top + plotH - (Math.max(0, Math.min(100, value)) / 100) * plotH;
  const last = weeks.length - 1;
  const paths = series.map((line) => {
    const segments: string[] = [];
    let current = "";
    line.values.forEach((value, index) => {
      if (value === null) {
        if (current) segments.push(current);
        current = "";
        return;
      }
      current += `${current ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`;
    });
    if (current) segments.push(current);
    return { line, segments };
  });
  return (
    <svg viewBox={`0 0 ${size.width} ${size.height}`} className={`h-auto w-full ${className}`} role="img" aria-labelledby={`${id}-t ${id}-d`}>
      <title id={`${id}-t`}>{title}</title>
      <desc id={`${id}-d`}>{summary}</desc>
      {[0, 50, 100].map((tick) => (
        <g key={tick}>
          <line x1={pad.left} x2={size.width - pad.right} y1={y(tick)} y2={y(tick)} stroke="#E2E8F0" strokeWidth="1" />
          <text x={pad.left - 8} y={y(tick) + 4} textAnchor="end" fontSize={size.font} fill="#475569">{tick} %</text>
        </g>
      ))}
      {threshold && (
        <g>
          <line x1={pad.left} x2={size.width - pad.right} y1={y(threshold.value)} y2={y(threshold.value)} stroke="#B91C1C" strokeWidth="1" strokeDasharray="4 4" opacity="0.7" />
          <text x={size.width - pad.right} y={y(threshold.value) - 5} textAnchor="end" fontSize={size.font - 1} fill="#B91C1C">{threshold.label}</text>
        </g>
      )}
      {weeks.map((label, index) =>
        (last - index) % size.every === 0 ? (
          // La semana en curso va en negrita (la tabla oculta dice «esta semana»).
          <text key={`${label}-${index}`} x={x(index)} y={size.height - 8} textAnchor="middle" fontSize={size.font} fill={index === last ? "#0F172A" : "#475569"} fontWeight={index === last ? 700 : 400}>
            {label}
          </text>
        ) : null,
      )}
      {paths.map(({ line, segments }) => (
        <g key={line.key}>
          {segments.map((d) => <path key={d} d={d} fill="none" stroke={line.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={line.dashed ? "8 6" : undefined} />)}
          {line.values.map((value, index) => (value === null ? null : <circle key={index} cx={x(index)} cy={y(value)} r="4" fill="#fff" stroke={line.color} strokeWidth="2.5" />))}
        </g>
      ))}
    </svg>
  );
}
