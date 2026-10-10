/**
 * Fechas límite en palabras («Vence mañana a las 11:59 p. m.», «Venció ayer»), contando días de
 * calendario en la zona horaria de la institución: una tarea que venció el jueves a las 11:59 p. m.
 * dice «Venció ayer» el viernes y «Venció hace 2 días» el sábado, sin importar la hora.
 * Código puro (sirve en servidor y navegador). Lo usan tareas y exámenes en todas las pantallas.
 */
import { isValidTimeZone, zonedParts } from "./timezone";

export const DEFAULT_TIME_ZONE = "America/Santo_Domingo";
const LOCALE = "es-DO";

/** Verbos de la frase: «Vence/Venció» para tareas, «Cierra/Cerró» y «Abre/Abrió» para exámenes. */
export type DeadlineVerbs = { future: string; past: string };
export const DUE_VERBS: DeadlineVerbs = { future: "Vence", past: "Venció" };
export const CLOSE_VERBS: DeadlineVerbs = { future: "Cierra", past: "Cerró" };
export const OPEN_VERBS: DeadlineVerbs = { future: "Abre", past: "Abrió" };

const safeZone = (timeZone: string | null | undefined) => (timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE);
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Días de calendario entre `now` y `instant` en la zona: 0 hoy, 1 mañana, -1 ayer. */
export function calendarDaysBetween(now: Date, instant: Date, timeZone: string): number {
  const zone = safeZone(timeZone);
  const a = zonedParts(now, zone);
  const b = zonedParts(instant, zone);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);
}

/** «11:59 p. m.» en la zona indicada. */
export function formatClock(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: safeZone(timeZone), hour: "numeric", minute: "2-digit", hour12: true }).format(instant);
}

/** «jueves 16 de octubre» (con «de 2027» si no es el año en curso) en la zona indicada. */
export function formatLongDay(instant: Date, timeZone: string, now: Date = instant): string {
  const zone = safeZone(timeZone);
  const parts = new Intl.DateTimeFormat(LOCALE, { timeZone: zone, weekday: "long", day: "numeric", month: "long" }).formatToParts(instant);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const year = zonedParts(instant, zone).year;
  const sameYear = year === zonedParts(now, zone).year;
  return `${value("weekday")} ${value("day")} de ${value("month")}${sameYear ? "" : ` de ${year}`}`;
}

/**
 * La fecha límite en palabras, según días de calendario en la zona de la institución:
 * - Hoy: «Vence hoy a las 11:59 p. m.» · «Venció hace 3 horas».
 * - Mañana / ayer: «Vence mañana a las 11:59 p. m.» · «Venció ayer».
 * - Más adelante: «Vence el jueves 16 de octubre».
 * - Antes: «Venció hace 2 días» hasta una semana; después «Venció el jueves 2 de octubre».
 * Con `withTime` también dice la hora en los casos que no la llevan («… a las 11:59 p. m.»).
 */
export function deadlineLabel(
  deadline: Date,
  now: Date,
  timeZone: string,
  options: { verbs?: DeadlineVerbs; withTime?: boolean } = {},
): string {
  const { verbs = DUE_VERBS, withTime = false } = options;
  const zone = safeZone(timeZone);
  const at = ` a las ${formatClock(deadline, zone)}`;
  const days = calendarDaysBetween(now, deadline, zone);

  if (deadline.getTime() <= now.getTime()) {
    if (days === 0) {
      const minutes = Math.floor((now.getTime() - deadline.getTime()) / 60_000);
      if (minutes < 1) return `${verbs.past} hace un momento`;
      if (minutes < 60) return `${verbs.past} hace ${plural(minutes, "minuto", "minutos")}`;
      return `${verbs.past} hace ${plural(Math.floor(minutes / 60), "hora", "horas")}`;
    }
    if (days === -1) return `${verbs.past} ayer${withTime ? at : ""}`;
    if (days > -7) return `${verbs.past} hace ${-days} días`;
    return `${verbs.past} el ${formatLongDay(deadline, zone, now)}${withTime ? at : ""}`;
  }

  if (days === 0) return `${verbs.future} hoy${at}`;
  if (days === 1) return `${verbs.future} mañana${at}`;
  return `${verbs.future} el ${formatLongDay(deadline, zone, now)}${withTime ? at : ""}`;
}
