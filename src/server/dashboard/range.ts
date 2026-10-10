import { addDaysToDateKey, zonedDateKey, zonedParts, zonedTimeToUtc } from "@/lib/timezone";

/**
 * Ventanas de tiempo del tablero del inicio. Código puro: no consulta la base.
 *
 * - «Esta semana»: desde el lunes a las 00:00 (hora de la institución) hasta ahora.
 * - «Este mes»: desde el día 1 a las 00:00 hasta ahora.
 * - «Este período»: desde que empezó el período activo hasta ahora (o hasta su fin, si ya terminó).
 *
 * La comparación es siempre «a esta misma altura» de la ventana anterior: la semana pasada desde el lunes
 * hasta el mismo día y hora, el mes pasado desde el día 1 hasta el mismo día, y el período anterior desde
 * su inicio hasta la misma cantidad de días. Así un lunes por la mañana no se compara contra una semana entera.
 */

export const RANGE_KEYS = ["semana", "mes", "periodo"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export type PeriodRef = { id: string; name: string; startDate: Date; endDate: Date };

export type BoardRange = {
  key: RangeKey;
  /** «Esta semana», «Este mes», «Este período». */
  label: string;
  /** «la semana pasada», «el mes pasado», «el período anterior». */
  previousLabel: string;
  from: Date;
  to: Date;
  /** Días locales `AAAA-MM-DD` (para columnas de fecha sin hora, como la asistencia), ambos incluidos. */
  fromKey: string;
  toKey: string;
  /** Ventana anterior para comparar; null si no hay con qué (por ejemplo, no existe un período anterior). */
  previous: { from: Date; to: Date; fromKey: string; toKey: string } | null;
};

/** Una semana de la tendencia: de lunes a lunes en la zona de la institución. */
export type BoardWeek = { index: number; start: Date; end: Date; startKey: string; endKey: string; label: string };

export const TREND_WEEKS = 8;
const DAY_MS = 24 * 60 * 60_000;

export function parseRangeKey(value: string | null | undefined, hasPeriod: boolean): RangeKey {
  const key = RANGE_KEYS.find((candidate) => candidate === value);
  if (key === "periodo" && !hasPeriod) return "mes";
  return key ?? "mes";
}

/** Medianoche local del día `key` como instante UTC. */
function midnight(key: string, timeZone: string): Date {
  return zonedTimeToUtc(key, "00:00", timeZone) ?? new Date(`${key}T00:00:00Z`);
}

/** Lunes (día local) de la semana de `instant`. */
export function mondayKey(instant: Date, timeZone: string): string {
  const key = zonedDateKey(instant, timeZone);
  const weekday = new Date(`${key}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return addDaysToDateKey(key, -((weekday + 6) % 7)) ?? key;
}

function windowOf(from: Date, to: Date, timeZone: string) {
  return { from, to, fromKey: zonedDateKey(from, timeZone), toKey: zonedDateKey(new Date(Math.max(from.getTime(), to.getTime() - 1)), timeZone) };
}

/**
 * Ventana actual y la anterior para la opción elegida.
 * `previousPeriod` es el período que terminó antes de que empezara el activo (si existe).
 */
export function resolveRange(key: RangeKey, now: Date, timeZone: string, period: PeriodRef | null, previousPeriod: PeriodRef | null): BoardRange {
  if (key === "periodo" && period) {
    const to = period.endDate < now ? period.endDate : now;
    const from = period.startDate < to ? period.startDate : new Date(to.getTime() - DAY_MS);
    const elapsed = to.getTime() - from.getTime();
    const previous = previousPeriod
      ? windowOf(previousPeriod.startDate, new Date(Math.min(previousPeriod.startDate.getTime() + elapsed, previousPeriod.endDate.getTime(), from.getTime())), timeZone)
      : null;
    return { key, label: "Este período", previousLabel: "el período anterior", ...windowOf(from, to, timeZone), previous };
  }
  if (key === "semana") {
    const from = midnight(mondayKey(now, timeZone), timeZone);
    const prevFrom = midnight(addDaysToDateKey(mondayKey(now, timeZone), -7)!, timeZone);
    const prevTo = new Date(prevFrom.getTime() + (now.getTime() - from.getTime()));
    return { key, label: "Esta semana", previousLabel: "la semana pasada", ...windowOf(from, now, timeZone), previous: windowOf(prevFrom, prevTo, timeZone) };
  }
  const parts = zonedParts(now, timeZone);
  const pad = (value: number) => String(value).padStart(2, "0");
  const firstKey = `${parts.year}-${pad(parts.month)}-01`;
  const from = midnight(firstKey, timeZone);
  const prevYear = parts.month === 1 ? parts.year - 1 : parts.year;
  const prevMonth = parts.month === 1 ? 12 : parts.month - 1;
  const prevFrom = midnight(`${prevYear}-${pad(prevMonth)}-01`, timeZone);
  // El mes pasado hasta el mismo punto, sin pasarse de su último día (31 de marzo → 28 de febrero).
  const prevTo = new Date(Math.min(prevFrom.getTime() + (now.getTime() - from.getTime()), from.getTime()));
  return { key, label: "Este mes", previousLabel: "el mes pasado", ...windowOf(from, now, timeZone), previous: windowOf(prevFrom, prevTo, timeZone) };
}

/** Las últimas `TREND_WEEKS` semanas (lunes a lunes), la última es la semana en curso. */
export function trendWeeks(now: Date, timeZone: string, weeks = TREND_WEEKS): BoardWeek[] {
  const thisMonday = mondayKey(now, timeZone);
  const label = new Intl.DateTimeFormat("es-DO", { timeZone, day: "numeric", month: "short" });
  return Array.from({ length: weeks }, (_, position) => {
    const startKey = addDaysToDateKey(thisMonday, -7 * (weeks - 1 - position))!;
    const endKey = addDaysToDateKey(startKey, 7)!;
    const start = midnight(startKey, timeZone);
    return { index: position, start, end: midnight(endKey, timeZone), startKey, endKey, label: label.format(new Date(start.getTime() + 12 * 60 * 60_000)) };
  });
}

/** Qué tan avanzado va el período: «Semana 6 de 16». Null si no hay período o si no ha empezado. */
export function periodProgress(period: PeriodRef | null, now: Date): { week: number; weeks: number; percent: number; ended: boolean } | null {
  if (!period || period.startDate > now) return null;
  const total = Math.max(1, period.endDate.getTime() - period.startDate.getTime());
  const elapsed = Math.min(total, now.getTime() - period.startDate.getTime());
  const weeks = Math.max(1, Math.ceil(total / (7 * DAY_MS)));
  return { week: Math.min(weeks, Math.floor(elapsed / (7 * DAY_MS)) + 1), weeks, percent: (elapsed / total) * 100, ended: period.endDate < now };
}
