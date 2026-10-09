import assert from "node:assert/strict";
import test from "node:test";
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
