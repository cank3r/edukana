import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";
import type { Change } from "@/server/dashboard/format";

/** Piezas visuales del tablero del inicio. Solo HTML, CSS y SVG: funcionan sin JavaScript en el navegador. */

export const NAVY = "var(--navy)";
/** Colores de texto con contraste suficiente sobre blanco para lo que está bien o mal. */
const TONE_CLASS: Record<Change["tone"], string> = { good: "text-emerald-700", bad: "text-red-700", neutral: "text-slate-600" };

export function Panel({ id, title, action, children, className = "" }: { id: string; title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className={`min-w-0 scroll-mt-20 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={`${id}-titulo`} className="text-base font-bold sm:text-lg" style={{ color: NAVY }}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Enlace pequeño de la esquina de un bloque («Ver todos»). */
export function CornerLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-blue-700 underline-offset-2 hover:underline">
      {children}
      <ArrowRight size={16} aria-hidden="true" />
    </Link>
  );
}

/** Línea que dice cuándo se llena un bloque vacío. */
export function WhenFilled({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{children}</p>;
}

export function Delta({ change, fallback }: { change: Change | null; fallback: string }) {
  if (!change) return <p className="text-xs text-slate-500 sm:text-sm">{fallback}</p>;
  const Icon = change.direction === "up" ? ArrowUpRight : change.direction === "down" ? ArrowDownRight : Minus;
  return (
    <p className={`flex items-start gap-1 text-xs font-medium sm:text-sm ${TONE_CLASS[change.tone]}`}>
      <Icon className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
      <span>{change.text}</span>
    </p>
  );
}

/**
 * Mini tendencia de 8 semanas. Es decorativa para quien no ve la pantalla: la cifra y su comparación
 * ya están escritas al lado, y el detalle semana a semana está en la tabla del gráfico de tendencia.
 */
export function Sparkline({ values }: { values: Array<number | null> }) {
  const known = values.filter((value): value is number => value !== null);
  const width = 120;
  const height = 32;
  if (known.length === 0 || known.every((value) => value === 0)) {
    return <svg aria-hidden="true" viewBox={`0 0 ${width} ${height}`} className="h-8 w-full"><line x1="0" x2={width} y1={height - 2} y2={height - 2} stroke="#CBD5E1" strokeWidth="2" strokeDasharray="3 4" /></svg>;
  }
  const max = Math.max(...known);
  const min = Math.min(0, ...known);
  const span = max - min || 1;
  const step = width / Math.max(1, values.length - 1);
  const points = values.map((value, index) => (value === null ? null : { x: index * step, y: height - 3 - ((value - min) / span) * (height - 6) }));
  const segments: string[] = [];
  let current = "";
  for (const point of points) {
    if (!point) {
      if (current) segments.push(current);
      current = "";
      continue;
    }
    current += `${current ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  }
  if (current) segments.push(current);
  const last = [...points].reverse().find(Boolean);
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-8 w-full overflow-visible">
      {segments.map((path) => <path key={path} d={path} fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
      {/* Punto final como trazo de largo cero: con el dibujo estirado, un círculo saldría ovalado. */}
      {last && <path d={`M${last.x.toFixed(1)},${last.y.toFixed(1)}h0`} stroke={NAVY} strokeWidth="7" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

/** Una cifra grande del tablero: toda la tarjeta es el enlace a la pantalla que la explica. */
export function Indicator({ href, label, value, detail, change, fallback, trend, compact = false }: {
  href: string;
  label: string;
  value: string;
  detail: ReactNode;
  change: Change | null;
  fallback: string;
  trend: Array<number | null>;
  /** Cifras largas (dinero): un tamaño menor para que no se salgan de la tarjeta. */
  compact?: boolean;
}) {
  return (
    <Link href={href} className="group flex min-w-0 flex-col gap-1 bg-white p-3 hover:bg-slate-50 sm:p-5">
      <span className="text-sm font-semibold text-slate-700 group-hover:underline">{label}</span>
      <span className={`break-words font-bold tabular-nums tracking-tight ${compact ? "text-xl sm:text-2xl lg:text-xl 2xl:text-2xl" : "text-2xl sm:text-4xl"}`} style={{ color: NAVY }}>{value}</span>
      <span className="text-xs text-slate-600 sm:text-sm">{detail}</span>
      <span className="mt-auto pt-2"><Delta change={change} fallback={fallback} /></span>
      <span className="pt-2"><Sparkline values={trend} /></span>
    </Link>
  );
}

/** Etiqueta corta de una señal (en riesgo, necesita atención). */
export function Tag({ children, tone = "warn", title }: { children: ReactNode; tone?: "warn" | "info"; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone === "warn" ? "bg-red-50 text-red-800 ring-1 ring-red-200" : "bg-slate-100 text-slate-700 ring-1 ring-slate-200"}`}>
      {children}
    </span>
  );
}

/** Opciones de la ventana de tiempo como enlaces: funcionan sin JavaScript y se pueden compartir. */
export function RangeSwitch({ options, current }: { options: Array<{ key: string; label: string; href: string }>; current: string }) {
  return (
    <nav aria-label="Período de las cifras" className="inline-flex w-full rounded-xl border border-slate-300 bg-white p-1 sm:w-auto">
      {options.map((option) => {
        const active = option.key === current;
        return (
          <Link
            key={option.key}
            href={option.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-lg px-2 text-sm font-semibold sm:flex-none sm:px-4 ${active ? "text-white" : "text-slate-700 hover:bg-slate-100"}`}
            style={active ? { background: "var(--brand)" } : undefined}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Esqueleto mientras llega un bloque. */
export function BlockSkeleton({ title, rows = 3, className = "" }: { title: string; rows?: number; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 ${className}`} aria-busy="true">
      <p className="mb-3 text-base font-bold sm:text-lg" style={{ color: NAVY }}>{title}</p>
      <p className="sr-only">Cargando…</p>
      <div className="space-y-2" aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => <div key={index} className="h-10 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />)}
      </div>
    </div>
  );
}
