import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { CHARGE_PAGE_SIZE, chargeBalances, FINANCE_AUDIT, listCharges } from "@/server/finance/charges";
import { A, B, ensureSeed } from "./setup";

/**
 * Lista de Cobros: primero lo que se debe (vencido y luego por vencer), después lo pagado; vistas
 * «Vencidos / Por cobrar / Pagados / Todos»; búsqueda por estudiante; 50 por página en la base; y
 * nada de otra institución.
 */
const INSTITUTIONS = [A.institutionId, B.institutionId];
const STUDENTS = { jose: "finl_jose", ana: "finl_ana", other: "finl_b" };
const NOW = new Date("2026-10-09T15:00:00Z"); // 11:00 en Santo Domingo: hoy es 2026-10-09.
const day = (key: string) => new Date(`${key}T12:00:00Z`);
const UPCOMING = 55;

type Seeded = { overdue: string[]; upcoming: string[]; paid: string[]; cancelled: string[]; other: string[] };
let ids: Seeded;

async function charge(data: { institutionId?: string; studentId: string; concept: string; cents: number; due: string | null; status?: "PENDING" | "PARTIAL" | "OVERDUE" | "PAID" | "CANCELLED"; paidAt?: string; createdAt?: Date }) {
  const row = await db.paymentConcept.create({
    data: {
      institutionId: data.institutionId ?? A.institutionId,
      studentId: data.studentId,
      concept: data.concept,
      amount: data.cents / 100,
      amountCents: data.cents,
      currency: "DOP",
      dueDate: data.due ? day(data.due) : null,
      status: data.status ?? "PENDING",
      paidAt: data.paidAt ? day(data.paidAt) : null,
      ...(data.createdAt ? { createdAt: data.createdAt } : {}),
    },
    select: { id: true },
  });
  return row.id;
}

async function cleanup() {
  await db.paymentConcept.deleteMany({ where: { institutionId: { in: INSTITUTIONS } } });
  await db.auditLog.deleteMany({ where: { action: { in: Object.values(FINANCE_AUDIT) } } });
  await db.user.deleteMany({ where: { id: { in: Object.values(STUDENTS) } } });
}

before(async () => {
  await ensureSeed();
  await cleanup();
  await db.user.createMany({
    data: [
      { id: STUDENTS.jose, institutionId: A.institutionId, name: "José Peña Lista", email: "finl_jose@a.test", role: "STUDENT", status: "ACTIVE" },
      { id: STUDENTS.ana, institutionId: A.institutionId, name: "Ana Lista", email: "finl_ana@a.test", role: "STUDENT", status: "ACTIVE" },
      { id: STUDENTS.other, institutionId: B.institutionId, name: "José Peña Ajeno", email: "finl_b@b.test", role: "STUDENT", status: "ACTIVE" },
    ],
  });
  // Vencidos, en el orden esperado: el vencimiento más antiguo primero; un OVERDUE guardado con fecha futura va al final.
  const overdue = [
    await charge({ studentId: STUDENTS.ana, concept: "Vencido agosto", cents: 1_000, due: "2026-08-01" }),
    await charge({ studentId: STUDENTS.jose, concept: "Vencido septiembre", cents: 2_000, due: "2026-09-01", status: "PARTIAL" }),
    await charge({ studentId: STUDENTS.ana, concept: "Vencido ayer", cents: 3_000, due: "2026-10-08" }),
    await charge({ studentId: STUDENTS.ana, concept: "Marcado vencido", cents: 4_000, due: "2027-01-01", status: "OVERDUE" }),
  ];
  // Por vencer: hoy todavía no está vencido; el más próximo primero; sin fecha al final.
  const upcoming: string[] = [];
  for (let index = 0; index < UPCOMING - 1; index++) {
    const due = new Date(Date.UTC(2026, 9, 9 + index)).toISOString().slice(0, 10);
    upcoming.push(await charge({ studentId: index % 2 ? STUDENTS.jose : STUDENTS.ana, concept: `Cuota ${index + 1}`, cents: 100, due }));
  }
  upcoming.push(await charge({ studentId: STUDENTS.ana, concept: "Sin fecha", cents: 100, due: null }));
  // Pagados: el pago más reciente primero. Anulado al final de «Todos».
  const paid = [
    await charge({ studentId: STUDENTS.jose, concept: "Pagado octubre", cents: 5_000, due: "2026-10-01", status: "PAID", paidAt: "2026-10-05" }),
    await charge({ studentId: STUDENTS.ana, concept: "Pagado septiembre", cents: 6_000, due: "2026-09-01", status: "PAID", paidAt: "2026-09-20" }),
  ];
  const cancelled = [await charge({ studentId: STUDENTS.ana, concept: "Anulado", cents: 7_000, due: "2026-08-01", status: "CANCELLED" })];
  const other = [
    await charge({ institutionId: B.institutionId, studentId: STUDENTS.other, concept: "Ajeno vencido", cents: 9_000, due: "2026-01-01" }),
    await charge({ institutionId: B.institutionId, studentId: STUDENTS.other, concept: "Ajeno por vencer", cents: 9_000, due: "2026-12-01" }),
  ];
  ids = { overdue, upcoming, paid, cancelled, other };
});
after(async () => {
  await cleanup();
  await db.$disconnect();
});

test("«Por cobrar» (por omisión de la pantalla) empieza por lo vencido, sigue con lo por vencer y pagina de 50 en 50", async () => {
  const first = await listCharges(A.admin, { view: "por-cobrar" }, NOW);
  assert.ok(first);
  const owed = [...ids.overdue, ...ids.upcoming];
  assert.equal(CHARGE_PAGE_SIZE, 50);
  assert.deepEqual([first.view, first.matching, first.page, first.pages, first.charges.length], ["por-cobrar", owed.length, 1, 2, 50]);
  assert.deepEqual(first.charges.map((row) => row.id), owed.slice(0, 50));
  assert.deepEqual(first.charges.slice(0, 4).map((row) => row.status), ["OVERDUE", "OVERDUE", "OVERDUE", "OVERDUE"]);
  assert.equal(first.charges[4].status, "PENDING", "el que vence hoy todavía no está vencido");

  const second = await listCharges(A.admin, { view: "por-cobrar", page: 2 }, NOW);
  assert.deepEqual(second?.charges.map((row) => row.id), owed.slice(50));
  assert.equal(second?.charges.at(-1)?.concept, "Sin fecha");
  assert.ok(second?.charges.every((row) => row.status !== "PAID" && row.status !== "CANCELLED"));

  // Una página que no existe muestra la última; una página inválida, la primera.
  assert.equal((await listCharges(A.admin, { view: "por-cobrar", page: 9 }, NOW))?.page, 2);
  assert.equal((await listCharges(A.admin, { view: "por-cobrar", page: -3 }, NOW))?.page, 1);
});

test("vistas Vencidos, Pagados y Todos con sus conteos; el estado antiguo del enlace sigue funcionando", async () => {
  const overdue = await listCharges(A.admin, { view: "vencidos" }, NOW);
  assert.deepEqual(overdue?.charges.map((row) => row.id), ids.overdue);
  assert.deepEqual(overdue?.counts, {
    vencidos: 4,
    "por-cobrar": 4 + UPCOMING,
    pagados: 2,
    todos: 4 + UPCOMING + 2 + 1,
  });
  assert.deepEqual((await listCharges(A.admin, { status: "OVERDUE" }, NOW))?.charges.map((row) => row.id), ids.overdue);

  const paid = await listCharges(A.admin, { view: "pagados" }, NOW);
  assert.deepEqual(paid?.charges.map((row) => row.id), ids.paid);
  assert.ok(paid?.charges.every((row) => row.status === "PAID"));

  const all = await listCharges(A.admin, { view: "todos", page: 2 }, NOW);
  assert.equal(all?.total, 4 + UPCOMING + 2 + 1);
  assert.deepEqual(all?.charges.map((row) => row.id), [...ids.overdue, ...ids.upcoming, ...ids.paid, ...ids.cancelled].slice(50));
  assert.equal(all?.charges.at(-1)?.status, "CANCELLED");
});

test("la búsqueda por estudiante no distingue tildes ni mayúsculas y se combina con la vista y la página", async () => {
  const jose = await listCharges(A.admin, { view: "por-cobrar", query: "jose pena" }, NOW);
  assert.ok(jose);
  const joseIds = new Set((await db.paymentConcept.findMany({ where: { studentId: STUDENTS.jose }, select: { id: true } })).map((row) => row.id));
  const owedJose = [...ids.overdue, ...ids.upcoming].filter((id) => joseIds.has(id));
  assert.deepEqual(jose.charges.map((row) => row.id), owedJose);
  assert.ok(jose.charges.every((row) => row.studentName === "José Peña Lista"));
  assert.equal(jose.counts.pagados, 1);
  assert.equal((await listCharges(A.admin, { view: "todos", query: "nadie se llama así" }, NOW))?.matching, 0);
});

test("ninguna vista muestra ni cuenta cargos de otra institución, aunque el estudiante se llame igual", async () => {
  for (const view of ["vencidos", "por-cobrar", "pagados", "todos"] as const) {
    for (let page = 1; page <= 2; page++) {
      const list = await listCharges(A.admin, { view, page }, NOW);
      assert.ok(list?.charges.every((row) => !ids.other.includes(row.id)), `${view} página ${page}`);
    }
  }
  const searched = await listCharges(A.admin, { view: "todos", query: "Ajeno" }, NOW);
  assert.equal(searched?.matching, 0);
  const b = await listCharges(B.admin, { view: "todos" }, NOW);
  assert.deepEqual(b?.charges.map((row) => row.id), ids.other);
  assert.deepEqual([b?.counts.vencidos, b?.counts["por-cobrar"], b?.total], [1, 2, 2]);
});

test("el resumen cubre toda la institución, no solo la página, y coincide con chargeBalances", async () => {
  const list = await listCharges(A.admin, { view: "pagados" }, NOW);
  assert.ok(list);
  const all = await db.paymentConcept.findMany({ where: { institutionId: A.institutionId }, select: { id: true } });
  const balances = [...(await chargeBalances(A.institutionId, all.map((row) => row.id), NOW)).values()];
  const open = balances.filter((balance) => balance.status !== "CANCELLED");
  assert.equal(list.summary.receivableCents, open.reduce((total, balance) => total + balance.balanceCents, 0));
  assert.equal(list.summary.overdueCents, open.filter((balance) => balance.shownStatus === "OVERDUE").reduce((total, balance) => total + balance.balanceCents, 0));
  assert.deepEqual(list.summary, {
    receivableCents: 1_000 + 2_000 + 3_000 + 4_000 + UPCOMING * 100,
    overdueCents: 1_000 + 2_000 + 3_000 + 4_000,
    collectedThisMonthCents: 5_000,
  });
});
