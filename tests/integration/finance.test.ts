import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import {
  accountStudentsFor,
  cancelCharge,
  chargeBalances,
  createCharge,
  createGroupCharges,
  deleteCharge,
  FINANCE_AUDIT,
  getPaymentReceipt,
  getStudentAccount,
  listCharges,
  recordPayment,
  updateCharge,
  voidPayment,
} from "@/server/finance/charges";
import { A, B, ensureSeed } from "./setup";

const S = ["fin_s1", "fin_s2"];
const GROUP = "fin_group";
const INSTITUTIONS = [A.institutionId, B.institutionId];
const FUTURE = "2035-01-15";
const PAID_ON = "2026-01-10";
const fields = { concept: "Mensualidad de prueba", amountCents: 350_000, dueDate: FUTURE };
const stored = (id: string) => db.paymentConcept.findUniqueOrThrow({ where: { id } });
/** Los pagos viven en su propia tabla: nunca se borran, solo se anulan. */
const paymentRows = (chargeId: string) => db.payment.count({ where: { conceptId: chargeId } });
const message = (result: { ok: boolean; message?: string }) => (result.ok ? "" : result.message ?? "");

async function pay(chargeId: string, amountCents: number, extra: { paidOn?: string; method?: string; note?: string } = {}) {
  const result = await recordPayment(A.admin, { chargeId, amountCents, paidOn: extra.paidOn ?? PAID_ON, method: extra.method ?? "CASH", note: extra.note });
  assert.equal(result.ok, true, message(result));
  assert.ok(result.ok && result.paymentId);
  return result.paymentId;
}

async function newCharge(studentId = A.student.id, extra: Partial<typeof fields> = {}) {
  const result = await createCharge(A.admin, { ...fields, ...extra, studentId });
  assert.equal(result.ok, true, message(result));
  assert.ok(result.chargeId);
  return result.chargeId;
}

async function cleanup() {
  await db.paymentConcept.deleteMany({ where: { institutionId: { in: INSTITUTIONS } } });
  await db.auditLog.deleteMany({ where: { action: { in: Object.values(FINANCE_AUDIT) } } });
  await db.roleCapabilityOverride.deleteMany({ where: { institutionId: A.institutionId, role: "PARENT", capability: "child.finance.view" } });
  await db.guardianship.update({ where: { id: A.guardianshipId }, data: { canViewFinance: false } });
  await db.studentGroup.deleteMany({ where: { id: GROUP } });
  await db.user.deleteMany({ where: { id: { in: S } } });
}

before(async () => {
  await ensureSeed();
  await cleanup();
  await db.user.createMany({
    data: S.map((id, index) => ({ id, institutionId: A.institutionId, name: `Prueba Cobro ${index + 1}`, email: `${id}@a.test`, role: "STUDENT" as const, status: "ACTIVE" as const })),
  });
  await db.studentGroup.create({
    data: {
      id: GROUP,
      institutionId: A.institutionId,
      name: "Grupo de prueba de cobros",
      startsOn: new Date("2026-01-01"),
      members: { create: [...S, "a_suspended"].map((userId) => ({ institutionId: A.institutionId, userId })) },
    },
  });
});
after(async () => {
  await cleanup();
  await db.$disconnect();
});

test("crear, pago parcial y pago total dejan los estados correctos; el sobrepago se rechaza", async () => {
  const id = await newCharge();
  let charge = await stored(id);
  assert.deepEqual(
    [charge.institutionId, charge.studentId, charge.amountCents, charge.amount, charge.currency, charge.status, charge.dueDate?.toISOString()],
    [A.institutionId, A.student.id, 350_000, 3500, "DOP", "PENDING", `${FUTURE}T12:00:00.000Z`],
  );
  assert.equal(await db.auditLog.count({ where: { action: FINANCE_AUDIT.created, entityId: id, userId: A.admin.id } }), 1);

  const firstId = await pay(id, 100_000, { note: " Recibo 12 " });
  charge = await stored(id);
  assert.deepEqual([charge.status, charge.paidAt, charge.amountCents], ["PARTIAL", null, 350_000]);
  // El pago es una fila de la tabla de pagos, con quién lo registró y el día del pago.
  const row0 = await db.payment.findUniqueOrThrow({ where: { id: firstId } });
  assert.deepEqual(
    [row0.institutionId, row0.conceptId, row0.amountCents, row0.method, row0.paidOn.toISOString().slice(0, 10), row0.note, row0.recordedById, row0.voidedAt],
    [A.institutionId, id, 100_000, "CASH", PAID_ON, "Recibo 12", A.admin.id, null],
  );
  assert.equal(await db.auditLog.count({ where: { action: FINANCE_AUDIT.payment, entity: "Payment", entityId: firstId, userId: A.admin.id } }), 1);

  const tooMuch = await recordPayment(A.admin, { chargeId: id, amountCents: 250_001, paidOn: PAID_ON, method: "CASH" });
  assert.equal(tooMuch.ok, false);
  assert.match(message(tooMuch), /no puede ser mayor que lo que se debe/);
  assert.equal((await recordPayment(A.admin, { chargeId: id, amountCents: 0, paidOn: PAID_ON, method: "CASH" })).ok, false);
  assert.equal((await recordPayment(A.admin, { chargeId: id, amountCents: 100, paidOn: "2999-01-01", method: "CASH" })).ok, false, "fecha futura");
  assert.equal((await recordPayment(A.admin, { chargeId: id, amountCents: 100, paidOn: PAID_ON, method: "BITCOIN" })).ok, false);
  assert.equal(await paymentRows(id), 1, "los rechazos no dejan pagos");

  let row = (await listCharges(A.admin))?.charges.find((item) => item.id === id);
  assert.deepEqual([row?.status, row?.paidCents, row?.balanceCents], ["PARTIAL", 100_000, 250_000]);
  assert.deepEqual(
    row?.payments.map((payment) => [payment.id, payment.amountCents, payment.paidOn, payment.method, payment.note, payment.recordedByName, payment.voided, payment.legacy]),
    [[firstId, 100_000, PAID_ON, "CASH", "Recibo 12", "admin A", null, false]],
  );

  // Dos pagos simultáneos por el saldo completo: solo uno entra.
  const both = await Promise.all([
    recordPayment(A.admin, { chargeId: id, amountCents: 250_000, paidOn: PAID_ON, method: "TRANSFER" }),
    recordPayment(A.admin, { chargeId: id, amountCents: 250_000, paidOn: PAID_ON, method: "CARD" }),
  ]);
  assert.equal(both.filter((result) => result.ok).length, 1);
  charge = await stored(id);
  assert.equal(charge.status, "PAID");
  assert.equal(charge.paidAt?.toISOString(), `${PAID_ON}T12:00:00.000Z`);
  assert.equal(await paymentRows(id), 2);
  row = (await listCharges(A.admin))?.charges.find((item) => item.id === id);
  assert.deepEqual([row?.status, row?.paidCents, row?.balanceCents, row?.payments.length], ["PAID", 350_000, 0, 2]);
  assert.equal((await recordPayment(A.admin, { chargeId: id, amountCents: 1, paidOn: PAID_ON, method: "CASH" })).ok, false, "ya está pagado");
});

test("un cargo con vencimiento pasado se muestra vencido sin cambiar lo guardado; el resumen suma en centavos", async () => {
  await db.paymentConcept.deleteMany({ where: { institutionId: A.institutionId } });
  const late = await newCharge(A.student.id, { dueDate: "2020-03-01", amountCents: 100_010 });
  const onTime = await newCharge(A.student2.id, { amountCents: 20_020 });
  await pay(late, 10, { method: "OTHER" });

  const now = new Date("2026-10-09T15:00:00Z");
  const list = await listCharges(A.admin, {}, now);
  assert.ok(list);
  assert.equal((await stored(late)).status, "PARTIAL");
  assert.equal(list.charges.find((item) => item.id === late)?.status, "OVERDUE");
  assert.equal(list.charges.find((item) => item.id === onTime)?.status, "PENDING");
  assert.deepEqual(list.summary, { receivableCents: 120_020, overdueCents: 100_000, collectedThisMonthCents: 0 });
  assert.equal((await listCharges(A.admin, {}, new Date("2026-01-20T15:00:00Z")))?.summary.collectedThisMonthCents, 10);

  assert.deepEqual((await listCharges(A.admin, { status: "OVERDUE" }, now))?.charges.map((item) => item.id), [late]);
  assert.deepEqual((await listCharges(A.admin, { query: "STUDENT2" }, now))?.charges.map((item) => item.id), [onTime]);
  assert.equal((await listCharges(A.admin, { periodId: "a_period" }, now))?.matching, 0);

  // El día del vencimiento todavía no está vencido; al día siguiente sí.
  const dueToday = await newCharge(A.student2.id, { dueDate: "2026-10-09" });
  const statusAt = async (instant: string) => (await listCharges(A.admin, {}, new Date(instant)))?.charges.find((item) => item.id === dueToday)?.status;
  assert.equal(await statusAt("2026-10-09T23:00:00Z"), "PENDING");
  assert.equal(await statusAt("2026-10-10T15:00:00Z"), "OVERDUE");
});

test("editar no baja de lo pagado; anular exige motivo y conserva el historial; borrar solo sin pagos", async () => {
  const id = await newCharge();
  await pay(id, 150_000);

  const below = await updateCharge(A.admin, { chargeId: id, concept: "Mensualidad", amountCents: 149_999, dueDate: FUTURE });
  assert.equal(below.ok, false);
  assert.match(message(below), /menor que lo ya pagado/);
  assert.deepEqual(await updateCharge(A.admin, { chargeId: id, concept: " Mensualidad corregida ", amountCents: 150_000, dueDate: "2035-02-01" }), { ok: true });
  let charge = await stored(id);
  assert.deepEqual([charge.concept, charge.amountCents, charge.amount, charge.status, charge.dueDate?.toISOString().slice(0, 10)], ["Mensualidad corregida", 150_000, 1500, "PAID", "2035-02-01"]);
  assert.deepEqual(await updateCharge(A.admin, { chargeId: id, concept: "Mensualidad corregida", amountCents: 200_000, dueDate: "2035-02-01" }), { ok: true });
  charge = await stored(id);
  assert.deepEqual([charge.status, charge.paidAt], ["PARTIAL", null]);

  const blocked = await deleteCharge(A.admin, id);
  assert.equal(blocked.ok, false);
  assert.match(message(blocked), /tiene pagos/);
  assert.equal((await cancelCharge(A.admin, id, "   ")).ok, false, "el motivo es obligatorio");
  assert.deepEqual(await cancelCharge(A.admin, id, " Se cobró dos veces "), { ok: true });
  assert.equal((await stored(id)).status, "CANCELLED");
  assert.equal(await paymentRows(id), 1, "el pago sigue registrado");
  const row = (await listCharges(A.admin))?.charges.find((item) => item.id === id);
  assert.deepEqual([row?.status, row?.balanceCents, row?.cancelReason, row?.payments.length], ["CANCELLED", 0, "Se cobró dos veces", 1]);
  assert.equal((await recordPayment(A.admin, { chargeId: id, amountCents: 100, paidOn: PAID_ON, method: "CASH" })).ok, false, "anulado no recibe pagos");
  assert.equal((await updateCharge(A.admin, { chargeId: id, concept: "Otro", amountCents: 300_000, dueDate: FUTURE })).ok, false);
  assert.equal((await cancelCharge(A.admin, id, "Otra vez")).ok, false);
  assert.equal((await deleteCharge(A.admin, id)).ok, false, "nunca se borra un cargo con pagos");
  assert.equal(await db.paymentConcept.count({ where: { id } }), 1);

  const unpaid = await newCharge(A.student2.id);
  assert.deepEqual(await deleteCharge(A.admin, unpaid), { ok: true });
  assert.equal(await db.paymentConcept.count({ where: { id: unpaid } }), 0);
  assert.equal(await db.auditLog.count({ where: { action: FINANCE_AUDIT.deleted, entityId: unpaid } }), 1);
});

test("cargo a un grupo: uno por estudiante activo, y repetir la operación no duplica", async () => {
  const input = { ...fields, target: { kind: "group", id: GROUP }, operationKey: "prueba-grupo-0000-0001" };
  const first = await createGroupCharges(A.admin, input);
  assert.deepEqual(first, { ok: true, created: 2, repeated: false, amountCents: 350_000, currency: "DOP", targetName: "Grupo de prueba de cobros" });
  const created = await db.paymentConcept.findMany({ where: { institutionId: A.institutionId, studentId: { in: [...S, "a_suspended"] } }, orderBy: { studentId: "asc" } });
  assert.deepEqual(created.map((charge) => [charge.studentId, charge.amountCents, charge.amount, charge.status]), S.map((id) => [id, 350_000, 3500, "PENDING"]));

  const again = await createGroupCharges(A.admin, input);
  assert.deepEqual([again.ok, again.ok && again.created, again.ok && again.repeated], [true, 0, true]);
  assert.equal(await db.paymentConcept.count({ where: { studentId: { in: S } } }), 2);

  // Doble clic: dos envíos simultáneos con la misma clave crean los cargos una sola vez.
  const double = { ...input, concept: "Uniforme", operationKey: "prueba-grupo-0000-0002" };
  const results = await Promise.all([createGroupCharges(A.admin, double), createGroupCharges(A.admin, double)]);
  assert.deepEqual(results.map((result) => result.ok && result.created).sort(), [0, 2]);
  assert.equal(await db.paymentConcept.count({ where: { studentId: { in: S }, concept: "Uniforme" } }), 2);
  assert.equal(await db.auditLog.count({ where: { action: FINANCE_AUDIT.batch, institutionId: A.institutionId } }), 2);

  const course = await createGroupCharges(A.admin, { ...fields, concept: "Material del curso", target: { kind: "course", id: A.courseId }, operationKey: "prueba-curso-0000-0001" });
  assert.deepEqual([course.ok, course.ok && course.created], [true, 1]);
  assert.equal(await db.paymentConcept.count({ where: { studentId: A.student.id, concept: "Material del curso" } }), 1);

  assert.equal((await createGroupCharges(A.admin, { ...input, operationKey: "corta" })).ok, false);
});

test("otra institución: estudiante, grupo, curso y cargo de B se rechazan", async () => {
  const foreign = await createCharge(A.admin, { ...fields, studentId: B.student.id });
  assert.equal(foreign.ok, false);
  assert.equal(await db.paymentConcept.count({ where: { studentId: B.student.id } }), 0);
  assert.equal((await createGroupCharges(B.admin, { ...fields, target: { kind: "group", id: GROUP }, operationKey: "prueba-ajena-0000-0001" })).ok, false);
  assert.equal((await createGroupCharges(B.admin, { ...fields, target: { kind: "course", id: A.courseId }, operationKey: "prueba-ajena-0000-0002" })).ok, false);
  assert.equal((await createCharge(A.admin, { ...fields, studentId: A.student.id, periodId: "b_period" })).ok, false);

  const own = await createCharge(B.admin, { ...fields, studentId: B.student.id });
  assert.ok(own.ok && own.chargeId);
  const bId = own.chargeId ?? "";
  assert.equal((await recordPayment(A.admin, { chargeId: bId, amountCents: 100, paidOn: PAID_ON, method: "CASH" })).ok, false);
  assert.equal((await updateCharge(A.admin, { chargeId: bId, concept: "Ajeno", amountCents: 100, dueDate: FUTURE })).ok, false);
  assert.equal((await cancelCharge(A.admin, bId, "Ajeno")).ok, false);
  assert.equal((await deleteCharge(A.admin, bId)).ok, false);
  const untouched = await stored(bId);
  assert.deepEqual([untouched.status, untouched.amountCents, untouched.concept], ["PENDING", 350_000, fields.concept]);
  assert.equal((await listCharges(A.admin))?.charges.some((item) => item.id === bId), false);
  assert.equal((await listCharges(B.admin))?.total, 1);
  assert.equal(await getStudentAccount(A.admin, B.student.id), null);
});

test("el estudiante solo ve su cuenta; el tutor, solo con permiso del rol y del vínculo", async () => {
  await db.paymentConcept.deleteMany({ where: { institutionId: A.institutionId } });
  const mine = await newCharge(A.student.id, { dueDate: "2020-03-01" });
  await newCharge(A.student2.id);
  await pay(mine, 50_000, { method: "TRANSFER" });
  const cancelledUnpaid = await newCharge(A.student.id, { concept: "Cargo por error" });
  await cancelCharge(A.admin, cancelledUnpaid, "Error");

  const account = await getStudentAccount(A.student, A.student.id);
  assert.ok(account);
  assert.deepEqual([account.owedCents, account.overdueCents, account.paidCents], [300_000, 300_000, 50_000]);
  assert.deepEqual(account.charges.map((charge) => charge.id), [mine], "no ve cargos de otros ni anulados sin pagos");
  assert.equal(account.charges[0].payments.length, 1);
  assert.deepEqual((await accountStudentsFor(A.student)).map((student) => student.id), [A.student.id]);

  assert.equal(await getStudentAccount(A.student, A.student2.id), null);
  assert.equal(await getStudentAccount(B.student, A.student.id), null);
  assert.equal(await getStudentAccount(A.teacher, A.student.id), null);
  assert.equal((await getStudentAccount(A.admin, A.student.id))?.owedCents, 300_000, "quien gestiona cobros puede consultarla");

  // Tutor: hace falta el permiso del rol en la institución Y la marca de finanzas en el vínculo.
  assert.equal(await getStudentAccount(A.parent, A.student.id), null);
  await db.guardianship.update({ where: { id: A.guardianshipId }, data: { canViewFinance: true } });
  assert.equal(await getStudentAccount(A.parent, A.student.id), null, "sin permiso del rol");
  await db.roleCapabilityOverride.create({ data: { institutionId: A.institutionId, role: "PARENT", capability: "child.finance.view", enabled: true, updatedById: A.admin.id } });
  assert.equal((await getStudentAccount(A.parent, A.student.id))?.owedCents, 300_000);
  assert.deepEqual((await accountStudentsFor(A.parent)).map((student) => student.id), [A.student.id]);
  assert.equal(await getStudentAccount(A.parent, A.student2.id), null, "no es su hijo");
  assert.equal(await getStudentAccount(B.parent, A.student.id), null);
  await db.guardianship.update({ where: { id: A.guardianshipId }, data: { canViewFinance: false } });
  assert.equal(await getStudentAccount(A.parent, A.student.id), null, "sin la marca del vínculo");
  assert.deepEqual(await accountStudentsFor(A.parent), []);
});

test("sin permiso para gestionar cobros todo se rechaza", async () => {
  const id = await newCharge();
  const paidCharge = await newCharge(A.student2.id, { concept: "Cargo de otro estudiante" });
  const paidId = await pay(paidCharge, 1_000);
  const countBefore = await db.paymentConcept.count();
  for (const actor of [A.teacher, A.coordinator, A.student, A.parent]) {
    assert.equal(await listCharges(actor), null);
    assert.equal((await createCharge(actor, { ...fields, studentId: A.student.id })).ok, false);
    assert.equal((await createGroupCharges(actor, { ...fields, target: { kind: "group", id: GROUP }, operationKey: `sin-permiso-${actor.id}-0001` })).ok, false);
    assert.equal((await recordPayment(actor, { chargeId: id, amountCents: 100, paidOn: PAID_ON, method: "CASH" })).ok, false);
    assert.equal((await updateCharge(actor, { chargeId: id, concept: "Cambiado", amountCents: 100, dueDate: FUTURE })).ok, false);
    assert.equal((await cancelCharge(actor, id, "Sin permiso")).ok, false);
    assert.equal((await deleteCharge(actor, id)).ok, false);
    assert.equal((await voidPayment(actor, { paymentId: paidId, reason: "Sin permiso" })).ok, false);
  }
  assert.equal(await db.paymentConcept.count(), countBefore);
  const charge = await stored(id);
  assert.deepEqual([charge.status, charge.concept, charge.amountCents], ["PENDING", fields.concept, 350_000]);
  assert.equal(await paymentRows(id), 0);
  assert.equal((await db.payment.findUniqueOrThrow({ where: { id: paidId } })).voidedAt, null);
  for (const actor of [A.teacher, A.coordinator, A.student]) assert.equal(await getPaymentReceipt(actor, paidId), null, `${actor.role} no ve un recibo que no es suyo`);
});

test("anular un pago: exige motivo, no borra nada y recalcula el cargo en la misma operación", async () => {
  await db.paymentConcept.deleteMany({ where: { institutionId: A.institutionId } });
  const id = await newCharge();
  const first = await pay(id, 200_000, { method: "TRANSFER" });
  const second = await pay(id, 150_000, { method: "CARD" });
  let charge = await stored(id);
  assert.deepEqual([charge.status, charge.paidAt?.toISOString()], ["PAID", `${PAID_ON}T12:00:00.000Z`]);

  assert.equal((await voidPayment(A.admin, { paymentId: second, reason: "   " })).ok, false, "el motivo es obligatorio");
  assert.equal((await voidPayment(A.admin, { paymentId: "no-existe", reason: "Error" })).ok, false);
  assert.equal((await voidPayment(B.admin, { paymentId: second, reason: "Ajeno" })).ok, false, "otra institución");
  assert.equal((await db.payment.findUniqueOrThrow({ where: { id: second } })).voidedAt, null, "los rechazos no anulan");
  assert.deepEqual(await voidPayment(A.admin, { paymentId: second, reason: " La tarjeta fue rechazada " }), { ok: true });

  const voided = await db.payment.findUniqueOrThrow({ where: { id: second } });
  assert.ok(voided.voidedAt);
  assert.equal(voided.voidReason, "La tarjeta fue rechazada");
  assert.equal(await paymentRows(id), 2, "el pago anulado no se borra");
  charge = await stored(id);
  assert.deepEqual([charge.status, charge.paidAt], ["PARTIAL", null]);
  assert.equal(await db.auditLog.count({ where: { action: FINANCE_AUDIT.voided, entityId: second, userId: A.admin.id } }), 1);

  const list = await listCharges(A.admin, {}, new Date("2026-01-20T15:00:00Z"));
  const row = list?.charges.find((item) => item.id === id);
  assert.deepEqual([row?.status, row?.paidCents, row?.balanceCents, row?.payments.length], ["PARTIAL", 200_000, 150_000, 2]);
  assert.equal(row?.payments.find((payment) => payment.id === second)?.voided?.reason, "La tarjeta fue rechazada");
  assert.equal(list?.summary.collectedThisMonthCents, 200_000, "lo anulado no cuenta como cobrado");
  assert.equal((await chargeBalances(A.institutionId, [id])).get(id)?.paidCents, 200_000);

  assert.equal((await voidPayment(A.admin, { paymentId: second, reason: "Otra vez" })).ok, false, "ya estaba anulado");
  // El saldo vuelve a poder pagarse, y el tope sigue siendo lo que se debe.
  assert.equal((await recordPayment(A.admin, { chargeId: id, amountCents: 150_001, paidOn: PAID_ON, method: "CASH" })).ok, false);
  const third = await pay(id, 150_000);
  assert.equal((await stored(id)).status, "PAID");

  // Anular todo deja el cargo pendiente; un cargo con pagos (aunque anulados) no se borra.
  assert.deepEqual(await voidPayment(A.admin, { paymentId: first, reason: "Error de registro" }), { ok: true });
  assert.deepEqual(await voidPayment(A.admin, { paymentId: third, reason: "Error de registro" }), { ok: true });
  charge = await stored(id);
  assert.deepEqual([charge.status, charge.paidAt], ["PENDING", null]);
  assert.equal((await deleteCharge(A.admin, id)).ok, false);
  assert.equal(await paymentRows(id), 3);

  // En un cargo anulado, anular un pago no cambia el estado del cargo.
  const other = await newCharge(A.student2.id, { concept: "Cargo que se anula" });
  const kept = await pay(other, 1_000);
  assert.deepEqual(await cancelCharge(A.admin, other, "Ya no corresponde"), { ok: true });
  assert.deepEqual(await voidPayment(A.admin, { paymentId: kept, reason: "Se devolvió el dinero" }), { ok: true });
  assert.equal((await stored(other)).status, "CANCELLED");
});

test("dos pagos parciales simultáneos nunca suman más que el saldo", async () => {
  const id = await newCharge();
  await pay(id, 100_000);
  const both = await Promise.all([
    recordPayment(A.admin, { chargeId: id, amountCents: 150_000, paidOn: PAID_ON, method: "CASH" }),
    recordPayment(A.admin, { chargeId: id, amountCents: 150_000, paidOn: PAID_ON, method: "TRANSFER" }),
  ]);
  assert.equal(both.filter((result) => result.ok).length, 1, "el segundo encuentra el saldo ya reducido");
  assert.match(message(both.find((result) => !result.ok) ?? { ok: true }), /no puede ser mayor que lo que se debe/);
  assert.equal(await paymentRows(id), 2);
  const balance = (await chargeBalances(A.institutionId, [id])).get(id);
  assert.deepEqual([balance?.paidCents, balance?.balanceCents, balance?.status], [250_000, 100_000, "PARTIAL"]);
  assert.equal((await stored(id)).status, "PARTIAL");
});

test("recibo: lo ven quien cobra, el estudiante dueño y su tutor autorizado; nadie más", async () => {
  const mine = await newCharge(A.student.id, { concept: "Inscripción", amountCents: 350_050 });
  const paymentId = await pay(mine, 350_050, { method: "TRANSFER", note: "Transferencia 778" });
  const theirs = await newCharge(A.student2.id, { concept: "Inscripción de otro" });
  const theirPayment = await pay(theirs, 1_000);
  const institution = await db.institution.findUniqueOrThrow({ where: { id: A.institutionId } });

  const receipt = await getPaymentReceipt(A.admin, paymentId);
  assert.ok(receipt);
  assert.equal(receipt.number.length, 8);
  assert.equal(receipt.number, paymentId.replace(/[^A-Za-z0-9]/g, "").slice(-8).toUpperCase());
  assert.deepEqual(
    [receipt.institution.name, receipt.student.id, receipt.concept, receipt.amountCents, receipt.method, receipt.paidOn, receipt.note, receipt.recordedByName, receipt.voided],
    [institution.name, A.student.id, "Inscripción", 350_050, "TRANSFER", PAID_ON, "Transferencia 778", "admin A", null],
  );
  assert.equal(receipt.amountWords, "Tres mil quinientos pesos dominicanos con 50/100");

  assert.equal((await getPaymentReceipt(A.student, paymentId))?.id, paymentId, "el estudiante ve su recibo");
  assert.equal(await getPaymentReceipt(A.student, theirPayment), null, "recibo de otro estudiante rechazado");
  assert.equal(await getPaymentReceipt(A.student2, paymentId), null);
  assert.equal(await getPaymentReceipt(A.teacher, paymentId), null);
  assert.equal(await getPaymentReceipt(B.admin, paymentId), null, "otra institución");
  assert.equal(await getPaymentReceipt(B.student, paymentId), null);
  assert.equal(await getPaymentReceipt(A.student, ""), null);

  // Tutor: permiso del rol Y marca de finanzas en el vínculo, y solo los recibos de su hijo.
  // (Una prueba anterior deja el permiso del rol concedido: se parte de cero.)
  await db.roleCapabilityOverride.deleteMany({ where: { institutionId: A.institutionId, role: "PARENT", capability: "child.finance.view" } });
  assert.equal(await getPaymentReceipt(A.parent, paymentId), null);
  await db.guardianship.update({ where: { id: A.guardianshipId }, data: { canViewFinance: true } });
  assert.equal(await getPaymentReceipt(A.parent, paymentId), null, "sin permiso del rol");
  await db.roleCapabilityOverride.create({ data: { institutionId: A.institutionId, role: "PARENT", capability: "child.finance.view", enabled: true, updatedById: A.admin.id } });
  assert.equal((await getPaymentReceipt(A.parent, paymentId))?.id, paymentId);
  assert.equal(await getPaymentReceipt(A.parent, theirPayment), null, "no es su hijo");
  assert.equal(await getPaymentReceipt(B.parent, paymentId), null);
  await db.roleCapabilityOverride.deleteMany({ where: { institutionId: A.institutionId, role: "PARENT", capability: "child.finance.view" } });
  await db.guardianship.update({ where: { id: A.guardianshipId }, data: { canViewFinance: false } });

  assert.deepEqual(await voidPayment(A.admin, { paymentId, reason: "Se registró en el cargo equivocado" }), { ok: true });
  const voided = await getPaymentReceipt(A.student, paymentId);
  assert.equal(voided?.voided?.reason, "Se registró en el cargo equivocado", "el recibo anulado lo dice");
  const account = await getStudentAccount(A.student, A.student.id);
  assert.equal(account?.charges.find((charge) => charge.id === mine)?.paidCents, 0);
});

test("pagos antiguos del registro de auditoría: cuentan solo si el cargo no tiene filas de pago, y se copian al primer pago nuevo", async () => {
  await db.paymentConcept.deleteMany({ where: { institutionId: A.institutionId } });
  const id = await newCharge(A.student.id, { concept: "Cargo antiguo" });
  await db.paymentConcept.update({ where: { id }, data: { status: "PARTIAL" } });
  await db.auditLog.create({
    data: {
      institutionId: A.institutionId,
      userId: A.admin.id,
      action: FINANCE_AUDIT.payment,
      entity: "PaymentConcept",
      entityId: id,
      changes: { amountCents: 50_000, paidOn: "2025-12-01", method: "CASH", note: "Pago viejo" },
    },
  });
  let row = (await listCharges(A.admin))?.charges.find((item) => item.id === id);
  assert.deepEqual([row?.status, row?.paidCents, row?.payments.map((payment) => [payment.amountCents, payment.legacy])], ["PARTIAL", 50_000, [[50_000, true]]]);
  assert.equal((await chargeBalances(A.institutionId, [id])).get(id)?.paidCents, 50_000);
  assert.equal((await getStudentAccount(A.student, A.student.id))?.charges.find((charge) => charge.id === id)?.paidCents, 50_000);

  await pay(id, 20_000);
  const rows = await db.payment.findMany({ where: { conceptId: id }, orderBy: { paidOn: "asc" } });
  assert.deepEqual(rows.map((payment) => [payment.amountCents, payment.paidOn.toISOString().slice(0, 10), payment.note, payment.recordedById]), [
    [50_000, "2025-12-01", "Pago viejo", A.admin.id],
    [20_000, PAID_ON, null, A.admin.id],
  ]);
  row = (await listCharges(A.admin))?.charges.find((item) => item.id === id);
  assert.deepEqual([row?.paidCents, row?.payments.length, row?.payments.every((payment) => !payment.legacy)], [70_000, 2, true], "el registro antiguo no se suma dos veces");
  assert.equal((await stored(id)).status, "PARTIAL");

  // Cargo antiguo marcado como pagado sin pagos registrados: cuenta como pagado, recibido el día de `paidAt`.
  const legacyPaid = await newCharge(A.student.id, { concept: "Pagado antes", amountCents: 10_000 });
  await db.paymentConcept.update({ where: { id: legacyPaid }, data: { status: "PAID", paidAt: new Date("2026-01-05T12:00:00Z") } });
  const balance = (await chargeBalances(A.institutionId, [legacyPaid, "no-existe"])).get(legacyPaid);
  assert.deepEqual([balance?.paidCents, balance?.balanceCents, balance?.received], [10_000, 0, [{ paidOn: "2026-01-05", amountCents: 10_000 }]]);
  assert.equal((await listCharges(A.admin, {}, new Date("2026-01-20T15:00:00Z")))?.summary.collectedThisMonthCents, 20_000 + 10_000);
});

test("chargeBalances solo devuelve cargos de la institución pedida", async () => {
  const own = await createCharge(B.admin, { ...fields, studentId: B.student.id });
  assert.ok(own.ok && own.chargeId);
  const bId = own.chargeId ?? "";
  const aId = await newCharge();
  const balances = await chargeBalances(A.institutionId, [aId, bId]);
  assert.deepEqual([...balances.keys()], [aId]);
  assert.equal((await chargeBalances(B.institutionId, [aId])).size, 0);
  assert.equal((await chargeBalances(A.institutionId, [])).size, 0);
});
