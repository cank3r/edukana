import assert from "node:assert/strict";
import test from "node:test";
import { calendarDaysBetween, CLOSE_VERBS, deadlineLabel, OPEN_VERBS } from "../src/lib/deadline";
import { addDaysToDateKey, timeZoneDisplayName, zonedDateKey, zonedTimeToUtc, zonedTimeValue } from "../src/lib/timezone";

const iso = (date: string, time: string, zone: string) => zonedTimeToUtc(date, time, zone)?.toISOString() ?? null;

test("Santo Domingo no cambia de horario: siempre UTC-4", () => {
  assert.equal(iso("2026-01-15", "18:30", "America/Santo_Domingo"), "2026-01-15T22:30:00.000Z");
  assert.equal(iso("2026-07-15", "18:30", "America/Santo_Domingo"), "2026-07-15T22:30:00.000Z");
  assert.equal(iso("2026-12-31", "22:00", "America/Santo_Domingo"), "2027-01-01T02:00:00.000Z");
});

test("Nueva York: la misma hora local cae en UTC distinto antes y después del cambio de horario", () => {
  assert.equal(iso("2026-03-07", "09:00", "America/New_York"), "2026-03-07T14:00:00.000Z");
  assert.equal(iso("2026-03-09", "09:00", "America/New_York"), "2026-03-09T13:00:00.000Z");
  assert.equal(iso("2026-10-31", "09:00", "America/New_York"), "2026-10-31T13:00:00.000Z");
  assert.equal(iso("2026-11-02", "09:00", "America/New_York"), "2026-11-02T14:00:00.000Z");
});

test("Nueva York: la hora que no existe se corre adelante y la que se repite toma la primera", () => {
  assert.equal(iso("2026-03-08", "02:30", "America/New_York"), "2026-03-08T07:30:00.000Z");
  assert.equal(iso("2026-11-01", "01:30", "America/New_York"), "2026-11-01T05:30:00.000Z");
  assert.equal(iso("2026-03-08", "01:59", "America/New_York"), "2026-03-08T06:59:00.000Z");
  assert.equal(iso("2026-03-08", "03:00", "America/New_York"), "2026-03-08T07:00:00.000Z");
});

test("zonas al este de UTC y con desfase de media hora", () => {
  assert.equal(iso("2026-06-01", "08:00", "Europe/Madrid"), "2026-06-01T06:00:00.000Z");
  assert.equal(iso("2026-06-01", "00:15", "Asia/Kolkata"), "2026-05-31T18:45:00.000Z");
});

test("entradas no válidas devuelven null", () => {
  assert.equal(zonedTimeToUtc("2026-02-31", "10:00", "America/Santo_Domingo"), null);
  assert.equal(zonedTimeToUtc("15/01/2026", "10:00", "America/Santo_Domingo"), null);
  assert.equal(zonedTimeToUtc("2026-01-15", "25:00", "America/Santo_Domingo"), null);
  assert.equal(zonedTimeToUtc("2026-01-15", "10:00", "Zona/Inventada"), null);
});

test("ida y vuelta: el instante vuelve a mostrar la fecha y la hora escritas", () => {
  for (const zone of ["America/Santo_Domingo", "America/New_York", "Europe/Madrid"]) {
    const instant = zonedTimeToUtc("2026-11-20", "23:45", zone)!;
    assert.equal(zonedDateKey(instant, zone), "2026-11-20");
    assert.equal(zonedTimeValue(instant, zone), "23:45");
  }
  const midnight = zonedTimeToUtc("2026-05-05", "00:00", "America/Santo_Domingo")!;
  assert.equal(zonedTimeValue(midnight, "America/Santo_Domingo"), "00:00");
});

test("sumar semanas conserva la hora local aunque cambie el horario", () => {
  assert.equal(addDaysToDateKey("2026-02-25", 7), "2026-03-04");
  assert.equal(addDaysToDateKey("2026-12-28", 7), "2027-01-04");
  assert.equal(addDaysToDateKey("mal", 7), null);
  assert.equal(addDaysToDateKey("2027-02-31", 0), null);
  const next = addDaysToDateKey("2026-03-05", 7)!;
  assert.equal(iso("2026-03-05", "18:00", "America/New_York"), "2026-03-05T23:00:00.000Z");
  assert.equal(iso(next, "18:00", "America/New_York"), "2026-03-12T22:00:00.000Z");
});

test("la zona se muestra con un nombre legible, sin barras ni guiones bajos", () => {
  assert.equal(timeZoneDisplayName("America/Santo_Domingo"), "hora de Santo Domingo");
  assert.equal(timeZoneDisplayName("America/Argentina/Buenos_Aires"), "hora de Buenos Aires");
  assert.equal(timeZoneDisplayName("UTC"), "hora universal");
  assert.equal(timeZoneDisplayName(""), "hora universal");
});

// --- Fechas límite en palabras (src/lib/deadline.ts): días de calendario en la zona de la institución ---
const DR = "America/Santo_Domingo"; // UTC-4 todo el año
const plain = (text: string) => text.replace(/\s/g, " ");
const label = (deadline: string, now: string, zone = DR, options?: Parameters<typeof deadlineLabel>[3]) =>
  plain(deadlineLabel(new Date(deadline), new Date(now), zone, options));
// Jueves 15 de octubre de 2026 a las 11:59 p. m. en Santo Domingo.
const THURSDAY_2359 = "2026-10-16T03:59:00Z";

test("fecha límite: una tarea del jueves 11:59 p. m. dice «ayer» el viernes y «hace 2 días» el sábado", () => {
  assert.equal(label(THURSDAY_2359, "2026-10-16T04:01:00Z"), "Venció ayer", "viernes 12:01 a. m.: ya es otro día");
  assert.equal(label(THURSDAY_2359, "2026-10-16T14:00:00Z"), "Venció ayer", "viernes 10:00 a. m.");
  assert.equal(label(THURSDAY_2359, "2026-10-17T14:00:00Z"), "Venció hace 2 días", "sábado 10:00 a. m. (antes decía «hace 1 día»)");
  assert.equal(label(THURSDAY_2359, "2026-10-18T03:58:00Z"), "Venció hace 2 días", "sábado 11:58 p. m.");
  assert.equal(label(THURSDAY_2359, "2026-10-18T04:00:00Z"), "Venció hace 3 días", "domingo 12:00 a. m.");
  assert.equal(label(THURSDAY_2359, "2026-10-21T14:00:00Z"), "Venció hace 6 días");
  assert.equal(label(THURSDAY_2359, "2026-10-23T14:00:00Z"), "Venció el jueves 15 de octubre", "pasada una semana se dice el día");
  assert.equal(label(THURSDAY_2359, "2026-10-16T14:00:00Z", DR, { withTime: true }), "Venció ayer a las 11:59 p. m.");
});

test("fecha límite: el mismo día se cuenta en minutos u horas", () => {
  assert.equal(label(THURSDAY_2359, "2026-10-16T03:59:30Z"), "Venció hace un momento");
  assert.equal(label("2026-10-15T20:00:00Z", "2026-10-15T20:01:00Z"), "Venció hace 1 minuto");
  assert.equal(label("2026-10-15T12:00:00Z", "2026-10-15T15:30:00Z"), "Venció hace 3 horas");
});

test("fecha límite: hoy y mañana llevan la hora; más adelante se dice el día", () => {
  assert.equal(label(THURSDAY_2359, "2026-10-15T12:00:00Z"), "Vence hoy a las 11:59 p. m.");
  // Miércoles 11:00 p. m. en Santo Domingo, pero ya jueves en UTC: sigue siendo «mañana».
  assert.equal(label(THURSDAY_2359, "2026-10-15T03:00:00Z"), "Vence mañana a las 11:59 p. m.");
  assert.equal(label(THURSDAY_2359, "2026-10-10T14:00:00Z"), "Vence el jueves 15 de octubre");
  assert.equal(label(THURSDAY_2359, "2026-10-10T14:00:00Z", DR, { withTime: true }), "Vence el jueves 15 de octubre a las 11:59 p. m.");
  assert.equal(label("2027-01-09T03:59:00Z", "2026-12-20T14:00:00Z"), "Vence el viernes 8 de enero de 2027", "otro año: lo dice");
});

test("fecha límite: la cuenta depende de la zona de la institución", () => {
  // El mismo instante es viernes 5:59 a. m. en Madrid: allí venció «hoy», no «ayer».
  assert.equal(label(THURSDAY_2359, "2026-10-16T14:00:00Z", "Europe/Madrid"), "Venció hace 10 horas");
  assert.equal(label(THURSDAY_2359, "2026-10-15T12:00:00Z", "Europe/Madrid"), "Vence mañana a las 5:59 a. m.");
  // Una zona inválida usa la de Santo Domingo.
  assert.equal(label(THURSDAY_2359, "2026-10-16T14:00:00Z", "Marte/Olympus"), "Venció ayer");
  // Jueves 7:00 p. m. en Santo Domingo: mismo día; en UTC ya serían días distintos.
  assert.equal(calendarDaysBetween(new Date("2026-10-15T23:00:00Z"), new Date(THURSDAY_2359), DR), 0);
  assert.equal(calendarDaysBetween(new Date("2026-10-15T23:00:00Z"), new Date(THURSDAY_2359), "UTC"), 1);
});

test("fecha límite: los exámenes «abren» y «cierran»", () => {
  assert.equal(label(THURSDAY_2359, "2026-10-16T14:00:00Z", DR, { verbs: CLOSE_VERBS }), "Cerró ayer");
  assert.equal(label(THURSDAY_2359, "2026-10-15T12:00:00Z", DR, { verbs: CLOSE_VERBS }), "Cierra hoy a las 11:59 p. m.");
  assert.equal(label(THURSDAY_2359, "2026-10-10T14:00:00Z", DR, { verbs: OPEN_VERBS, withTime: true }), "Abre el jueves 15 de octubre a las 11:59 p. m.");
});
