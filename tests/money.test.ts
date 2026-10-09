import assert from "node:assert/strict";
import test from "node:test";
import {
  amountInWords,
  centsToDecimal,
  chargeBalanceOf,
  centsToInput,
  chargeCents,
  dateKeyToStored,
  dueDateKey,
  formatMoney,
  institutionCurrency,
  integerToWords,
  paidCentsOf,
  parseMoneyToCents,
  receiptNumber,
  shownStatus,
  statusForPaid,
} from "../src/server/finance/money";

test("lo que escribe una persona se convierte a centavos enteros sin pasar por decimales", () => {
  assert.equal(parseMoneyToCents("3500"), 350_000);
  assert.equal(parseMoneyToCents("3,500.00"), 350_000);
  assert.equal(parseMoneyToCents(" RD$ 3,500.5 "), 350_050);
  assert.equal(parseMoneyToCents("3500,5"), 350_050);
  assert.equal(parseMoneyToCents("0.07"), 7);
  assert.equal(parseMoneyToCents("1,234,567.89"), 123_456_789);
  // 0.1 + 0.2 y 19.99 fallan con decimales binarios; aquí no.
  assert.equal(parseMoneyToCents("19.99"), 1999);
  assert.equal(parseMoneyToCents("0.10")! + parseMoneyToCents("0.20")!, 30);
  assert.equal(parseMoneyToCents("1,500"), 150_000, "coma de miles");
  assert.equal(parseMoneyToCents("20000000"), 2_000_000_000);
});

test("montos dudosos se rechazan en vez de adivinar", () => {
  for (const bad of ["", "abc", "-5", "1.234", "1,23,4", "1.2.3", "12e3", "3 500 pesos", "20000000.01", "9999999999"]) {
    assert.equal(parseMoneyToCents(bad), null, bad);
  }
});

test("centavos de un cargo: manda el campo nuevo; el decimal antiguo se redondea", () => {
  assert.equal(chargeCents({ amount: 1, amountCents: 350_000 }), 350_000);
  assert.equal(chargeCents({ amount: 19.99, amountCents: null }), 1999);
  assert.equal(chargeCents({ amount: 0.07, amountCents: null }), 7);
  assert.equal(centsToDecimal(350_050), 3500.5);
  assert.equal(centsToInput(350_050), "3500.50");
  assert.equal(centsToInput(7), "0.07");
});

test("formato y moneda de la institución", () => {
  assert.match(formatMoney(350_000, "DOP"), /^RD\$\s?3,500\.00$/);
  assert.match(formatMoney(5, "DOP"), /0\.05$/);
  assert.match(formatMoney(100, "moneda rara"), /^RD\$/);
  assert.equal(institutionCurrency({ currency: "USD" }), "USD");
  assert.equal(institutionCurrency({ currency: "pesos" }), "DOP");
  assert.equal(institutionCurrency({}), "DOP");
  assert.equal(institutionCurrency(null), "DOP");
  assert.equal(institutionCurrency(["USD"]), "DOP");
});

test("estado según lo pagado", () => {
  assert.equal(statusForPaid(1000, 0), "PENDING");
  assert.equal(statusForPaid(1000, 1), "PARTIAL");
  assert.equal(statusForPaid(1000, 999), "PARTIAL");
  assert.equal(statusForPaid(1000, 1000), "PAID");
  assert.equal(paidCentsOf("PARTIAL", 1000, 400), 400);
  assert.equal(paidCentsOf("PAID", 1000, 0), 1000, "cargo antiguo pagado sin pagos registrados");
  assert.equal(paidCentsOf("PENDING", 1000, 5000), 1000, "nunca más que el monto");
});

test("vencido se calcula al leer: el día del vencimiento aún no lo está", () => {
  assert.equal(shownStatus("PENDING", "2026-10-09", "2026-10-09"), "PENDING");
  assert.equal(shownStatus("PENDING", "2026-10-09", "2026-10-10"), "OVERDUE");
  assert.equal(shownStatus("PARTIAL", "2026-10-09", "2026-10-10"), "OVERDUE");
  assert.equal(shownStatus("PARTIAL", "2026-10-11", "2026-10-10"), "PARTIAL");
  assert.equal(shownStatus("PENDING", null, "2026-10-10"), "PENDING");
  assert.equal(shownStatus("PAID", "2020-01-01", "2026-10-10"), "PAID");
  assert.equal(shownStatus("CANCELLED", "2020-01-01", "2026-10-10"), "CANCELLED");
  assert.equal(shownStatus("OVERDUE", null, "2026-10-10"), "OVERDUE", "estado antiguo guardado");
});

test("fechas de vencimiento: se guardan al mediodía UTC y se leen sin correrse de día", () => {
  assert.equal(dateKeyToStored("2026-10-09")?.toISOString(), "2026-10-09T12:00:00.000Z");
  assert.equal(dueDateKey(dateKeyToStored("2026-10-09")), "2026-10-09");
  assert.equal(dateKeyToStored("2026-02-31"), null);
  assert.equal(dateKeyToStored("09/10/2026"), null);
  assert.equal(dateKeyToStored(""), null);
  assert.equal(dueDateKey(null), null);
});

test("saldo de un cargo: con filas de pago manda la suma de los pagos vigentes; sin filas, la regla antigua", () => {
  assert.deepEqual(chargeBalanceOf("PENDING", 1000, 400, true), { paidCents: 400, balanceCents: 600, status: "PARTIAL" });
  assert.deepEqual(chargeBalanceOf("PAID", 1000, 400, true), { paidCents: 400, balanceCents: 600, status: "PARTIAL" }, "tras anular un pago, el estado guardado no manda");
  assert.deepEqual(chargeBalanceOf("PARTIAL", 1000, 0, true), { paidCents: 0, balanceCents: 1000, status: "PENDING" });
  assert.deepEqual(chargeBalanceOf("PENDING", 1000, 1000, true), { paidCents: 1000, balanceCents: 0, status: "PAID" });
  assert.deepEqual(chargeBalanceOf("PAID", 1000, 0, false), { paidCents: 1000, balanceCents: 0, status: "PAID" }, "cargo antiguo pagado sin pagos registrados");
  assert.deepEqual(chargeBalanceOf("OVERDUE", 1000, 0, false), { paidCents: 0, balanceCents: 1000, status: "OVERDUE" });
  assert.deepEqual(chargeBalanceOf("CANCELLED", 1000, 300, true), { paidCents: 300, balanceCents: 0, status: "CANCELLED" });
});

test("número de recibo corto y estable", () => {
  assert.equal(receiptNumber("cm1abcdefghijklmnopq7z9x"), "MNOPQ7Z9X".slice(-8));
  assert.equal(receiptNumber("cm1abcdefghijklmnopq7z9x"), receiptNumber("cm1abcdefghijklmnopq7z9x"));
  assert.equal(receiptNumber("ab"), "000000AB");
});

test("montos en letras para el recibo", () => {
  assert.equal(integerToWords(0), "cero");
  assert.equal(integerToWords(15), "quince");
  assert.equal(integerToWords(21), "veintiuno");
  assert.equal(integerToWords(100), "cien");
  assert.equal(integerToWords(101), "ciento uno");
  assert.equal(integerToWords(1000), "mil");
  assert.equal(integerToWords(21_000), "veintiún mil");
  assert.equal(integerToWords(1_500_000), "un millón quinientos mil");
  assert.equal(integerToWords(20_000_000), "veinte millones");
  assert.equal(amountInWords(350_000), "Tres mil quinientos pesos dominicanos con 00/100");
  assert.equal(amountInWords(350_050, "DOP"), "Tres mil quinientos pesos dominicanos con 50/100");
  assert.equal(amountInWords(100, "DOP"), "Un peso dominicano con 00/100");
  assert.equal(amountInWords(2_100, "USD"), "Veintiún dólares estadounidenses con 00/100");
  assert.equal(amountInWords(3_199, "EUR"), "Treinta y un euros con 99/100");
  assert.equal(amountInWords(7, "DOP"), "Cero pesos dominicanos con 07/100");
  assert.equal(amountInWords(100_000_000, "DOP"), "Un millón de pesos dominicanos con 00/100");
  assert.equal(amountInWords(99_999_999, "DOP"), "Novecientos noventa y nueve mil novecientos noventa y nueve pesos dominicanos con 99/100");
});
