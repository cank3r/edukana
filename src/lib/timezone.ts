/**
 * Conversión entre la hora "de pared" de una zona horaria y UTC, sin librerías:
 * solo `Intl.DateTimeFormat` con `timeZone`. Código puro (sirve en servidor y navegador).
 */

export type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;
const pad = (value: number) => String(value).padStart(2, "0");

const partsFormatters = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(timeZone: string) {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    partsFormatters.set(timeZone, formatter);
  }
  return formatter;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Fecha y hora que marca el reloj en `timeZone` para un instante dado. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const values: Record<string, number> = {};
  for (const part of partsFormatter(timeZone).formatToParts(instant)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return { year: values.year, month: values.month, day: values.day, hour: values.hour % 24, minute: values.minute };
}

/** Día local en formato `AAAA-MM-DD` (sirve para agrupar por día y para `<input type="date">`). */
export function zonedDateKey(instant: Date, timeZone: string): string {
  const parts = zonedParts(instant, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** Hora local en formato `HH:MM` de 24 horas (sirve para `<input type="time">`). */
export function zonedTimeValue(instant: Date, timeZone: string): string {
  const parts = zonedParts(instant, timeZone);
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

/**
 * Convierte una fecha `AAAA-MM-DD` y una hora `HH:MM` escritas en `timeZone` al instante UTC.
 * Devuelve null si la fecha, la hora o la zona no son válidas.
 * Una hora que no existe por el cambio de horario (el salto de primavera) se corre hacia adelante;
 * una hora que ocurre dos veces (otoño) toma la primera.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date | null {
  const dateMatch = DATE_RE.exec(date);
  const timeMatch = TIME_RE.exec(time);
  if (!dateMatch || !timeMatch || !isValidTimeZone(timeZone)) return null;
  const [year, month, day] = [Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3])];
  const [hour, minute] = [Number(timeMatch[1]), Number(timeMatch[2])];
  if (hour > 23 || minute > 59) return null;
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(wall);
  // Rechaza fechas imposibles como el 31 de febrero (Date.UTC las correría al mes siguiente).
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;

  const offsetAt = (instant: number) => {
    const parts = zonedParts(new Date(instant), timeZone);
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - instant;
  };
  // Se prueban los desfases vigentes un día antes y un día después: cubren ambos lados de cualquier cambio de horario.
  const day_ms = 24 * 60 * 60_000;
  const candidates = [...new Set([wall - offsetAt(wall - day_ms), wall - offsetAt(wall + day_ms)])];
  const exact = candidates.filter((instant) => instant + offsetAt(instant) === wall);
  // Hora repetida: la primera. Hora inexistente: se interpreta con el desfase anterior al cambio, que la corre adelante.
  return new Date(exact.length ? Math.min(...exact) : Math.max(...candidates));
}

/** Suma días a una fecha `AAAA-MM-DD` sin pasar por ninguna zona horaria. Null si la fecha no es válida. */
export function addDaysToDateKey(date: string, days: number): string | null {
  const match = DATE_RE.exec(date);
  if (!match) return null;
  const moved = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

/** «martes, 14 de octubre» en la zona indicada. */
export function formatZonedDay(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("es", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(instant);
}

/** «3:00 p. m.» en la zona indicada. */
export function formatZonedTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("es", { timeZone, hour: "numeric", minute: "2-digit", hour12: true }).format(instant);
}
