import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatCount,
  formatMoney,
  formatOperatorDate,
  formatOperatorDateTime,
  formatOperatorDay,
  formatStorageMb,
  formatStorageUsage,
  formatUsage,
} from "../src/app/operador/format";

test("fechas del panel en español y hora de Santo Domingo", () => {
  assert.equal(formatOperatorDate(new Date("2026-10-10T15:00:00Z")), "10 de octubre de 2026");
  // 02:00 UTC del 11 todavía es el 10 en Santo Domingo (UTC−4).
  assert.equal(formatOperatorDate(new Date("2026-10-11T02:00:00Z")), "10 de octubre de 2026");
  assert.equal(formatOperatorDateTime(new Date("2026-10-10T18:30:00Z")), "10 de octubre de 2026, 2:30 p. m.");
});

test("un día elegido con un campo de fecha (medianoche UTC) no se corre al día anterior", () => {
  assert.equal(formatOperatorDay(new Date("2026-11-10")), "10 de noviembre de 2026");
  assert.equal(formatOperatorDay(new Date("2026-01-01T00:00:00.000Z")), "1 de enero de 2026");
});

test("montos con símbolo de moneda y separadores de es-DO", () => {
  assert.equal(formatMoney(450_000, "DOP"), "RD$4,500.00");
  assert.equal(formatMoney(5_000, "DOP"), "RD$50.00");
  assert.equal(formatMoney(123_456_789, "USD"), "US$1,234,567.89");
});

test("conteos y usos de límites", () => {
  assert.equal(formatCount(12345), "12,345");
  assert.equal(formatUsage(120, 1600), "120 de 1,600");
  assert.equal(formatUsage(3, null), "3 (sin límite)");
});

test("almacenamiento legible: MB pequeños con un decimal y GB desde 1000 MB", () => {
  assert.equal(formatStorageMb(0), "0 MB");
  assert.equal(formatStorageMb(2.43), "2.4 MB");
  assert.equal(formatStorageMb(512.6), "513 MB");
  assert.equal(formatStorageMb(1500), "1.5 GB");
  assert.equal(formatStorageUsage(0, 25_000), "0 MB de 25 GB");
  assert.equal(formatStorageUsage(12, null), "12 MB (sin límite)");
});
