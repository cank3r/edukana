import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import {
  accountStudentsFor,
  cancelCharge,
  createCharge,
  createGroupCharges,
  deleteCharge,
  FINANCE_AUDIT,
  getStudentAccount,
  listCharges,
  recordPayment,
  updateCharge,
} from "@/server/finance/charges";
import { A, B, ensureSeed } from "./setup";

const S = ["fin_s1", "fin_s2"];
const GROUP = "fin_group";
const INSTITUTIONS = [A.institutionId, B.institutionId];
const FUTURE = "2035-01-15";
const PAID_ON = "2026-01-10";
const fields = { concept: "Mensualidad de prueba", amountCents: 350_000, dueDate: FUTURE };
const stored = (id: string) => db.paymentConcept.findUniqueOrThrow({ where: { id } });
const paymentLogs = (chargeId: string) => db.auditLog.count({ where: { action: FINANCE_AUDIT.payment, entityId: chargeId } });
const message = (result: { ok: boolean; message?: string }) => (result.ok ? "" : result.message ?? "");

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

  assert.deepEqual(await recordPayment(A.admin, { chargeId: id, amountCents: 100_000, paidOn: PAID_ON, method: "CASH", note: " Recibo 12 " }), { ok: true });
  charge = await stored(id);
  assert.deepEqual([charge.status, charge.paidAt, charge.amountCents], ["PARTIAL", null, 350_000]);

  const tooMuch = await recordPayment(A.admin, { chargeId: id, amountCents: 250_001, paidOn: PAID_ON, method: "CASH" });
  assert.equal(tooMuch.ok, false);
  assert.match(message(tooMuch), /no puede ser mayor que lo que se debe/);
  assert.equal((await recordPayment(A.admin, { chargeId: id, amountCents: 0, paidOn: PAID_ON, method: "CASH" })).ok, false);
  assert.equal((await recordPayment(A.admin, { chargeId: id, amountCents: 100, paidOn: "2999-01-01", method: "CASH" })).ok, false, "fecha futura");
  assert.equal((await recordPayment(A.admin, { chargeId: id, amountCents: 100, paidOn: PAID_ON, method: "BITCOIN" })).ok, false);
  assert.equal(await paymentLogs(id), 1, "los rechazos no dejan pagos");

  let row = (await listCharges(A.admin))?.charges.find((item) => item.id === id);
  assert.deepEqual([row?.status, row?.paidCents, row?.balanceCents], ["PARTIAL", 100_000, 250_000]);
  assert.deepEqual(row?.payments.map((payment) => [payment.amountCents, payment.paidOn, payment.method, payment.note]), [[100_000, PAID_ON, "CASH", "Recibo 12"]]);

  // Dos pagos simultáneos por el saldo completo: solo uno entra.
  const both = await Promise.all([
    recordPayment(A.admin, { chargeId: id, amountCents: 250_000, paidOn: PAID_ON, method: "TRANSFER" }),
    recordPayment(A.admin, { chargeId: id, amountCents: 250_000, paidOn: PAID_ON, method: "CARD" }),
  ]);
  assert.equal(both.filter((result) => result.ok).length, 1);
  charge = await stored(id);
  assert.equal(charge.status, "PAID");
  assert.equal(charge.paidAt?.toISOString(), `${PAID_ON}T12:00:00.000Z`);
  row = (await listCharges(A.admin))?.charges.find((item) => item.id === id);
  assert.deepEqual([row?.status, row?.paidCents, row?.balanceCents, row?.payments.length], ["PAID", 350_000, 0, 2]);
  assert.equal((await recordPayment(A.admin, { chargeId: id, amountCents: 1, paidOn: PAID_ON, method: "CASH" })).ok, false, "ya está pagado");
});

test("un cargo con vencimiento pasado se muestra vencido sin cambiar lo guardado; el resumen suma en centavos", async () => {
  await db.paymentConcept.deleteMany({ where: { institutionId: A.institutionId } });
  const late = await newCharge(A.student.id, { dueDate: "2020-03-01", amountCents: 100_010 });
  const onTime = await newCharge(A.student2.id, { amountCents: 20_020 });
  await recordPayment(A.admin, { chargeId: late, amountCents: 10, paidOn: PAID_ON, method: "OTHER" });

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
  await recordPayment(A.admin, { chargeId: id, amountCents: 150_000, paidOn: PAID_ON, method: "CASH" });

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
  assert.equal(await paymentLogs(id), 1, "el pago sigue registrado");
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
  await recordPayment(A.admin, { chargeId: mine, amountCents: 50_000, paidOn: PAID_ON, method: "TRANSFER" });
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
  const countBefore = await db.paymentConcept.count();
  for (const actor of [A.teacher, A.coordinator, A.student, A.parent]) {
    assert.equal(await listCharges(actor), null);
    assert.equal((await createCharge(actor, { ...fields, studentId: A.student.id })).ok, false);
    assert.equal((await createGroupCharges(actor, { ...fields, target: { kind: "group", id: GROUP }, operationKey: `sin-permiso-${actor.id}-0001` })).ok, false);
    assert.equal((await recordPayment(actor, { chargeId: id, amountCents: 100, paidOn: PAID_ON, method: "CASH" })).ok, false);
    assert.equal((await updateCharge(actor, { chargeId: id, concept: "Cambiado", amountCents: 100, dueDate: FUTURE })).ok, false);
    assert.equal((await cancelCharge(actor, id, "Sin permiso")).ok, false);
    assert.equal((await deleteCharge(actor, id)).ok, false);
  }
  assert.equal(await db.paymentConcept.count(), countBefore);
  const charge = await stored(id);
  assert.deepEqual([charge.status, charge.concept, charge.amountCents], ["PENDING", fields.concept, 350_000]);
  assert.equal(await paymentLogs(id), 0);
});
