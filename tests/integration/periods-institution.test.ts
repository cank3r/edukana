import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { InstitutionType } from "@prisma/client";
import { db } from "@/lib/db";
import { createPeriod, deletePeriod, listPeriods, periodStatus, setCurrentPeriod, updatePeriod } from "@/server/academic/periods";
import { getInstitutionSettings, timeZoneOptions, updateInstitutionSettings } from "@/server/platform/institution-settings";
import { A, B, ensureSeed } from "./setup";

const AUDITED = ["ACADEMIC_PERIOD_CREATED", "ACADEMIC_PERIOD_UPDATED", "ACADEMIC_PERIOD_ACTIVATED", "ACADEMIC_PERIOD_DELETED", "INSTITUTION_SETTINGS_UPDATED"];
const SEED_PERIODS = ["a_period", "b_period"];
const institutionFields = { name: true, type: true, timezone: true, language: true, slug: true, domain: true } as const;

type Result = { ok: boolean; message?: string };
function ok<T extends Result>(result: T): Extract<T, { ok: true }> {
  assert.equal(result.ok, true, result.message);
  return result as Extract<T, { ok: true }>;
}
const message = (result: Result) => {
  assert.equal(result.ok, false, "se esperaba un rechazo");
  return result.message ?? "";
};
const activeIds = async (institutionId: string) =>
  (await db.academicPeriod.findMany({ where: { institutionId, isActive: true }, orderBy: { id: "asc" }, select: { id: true } })).map((row) => row.id);
const snapshotB = () =>
  Promise.all([
    db.academicPeriod.findMany({ where: { institutionId: B.institutionId }, orderBy: { id: "asc" } }),
    db.institution.findUniqueOrThrow({ where: { id: B.institutionId }, select: institutionFields }),
  ]);

let seedA: { name: string; type: InstitutionType; timezone: string; language: string; slug: string; domain: string | null };
let seedB: Awaited<ReturnType<typeof snapshotB>>;

async function cleanup() {
  await db.paymentConcept.deleteMany({ where: { concept: { startsWith: "PI " } } });
  await db.academicPeriod.deleteMany({ where: { name: { startsWith: "PI " } } });
  await db.academicPeriod.updateMany({ where: { id: { in: SEED_PERIODS } }, data: { isActive: true } });
  await db.auditLog.deleteMany({ where: { action: { in: AUDITED } } });
}

before(async () => {
  await ensureSeed();
  await cleanup();
  seedA = await db.institution.findUniqueOrThrow({ where: { id: A.institutionId }, select: institutionFields });
  seedB = await snapshotB();
});

after(async () => {
  await db.academicPeriod.update({ where: { id: "a_period" }, data: { name: "Período A", startDate: new Date("2026-09-01T00:00:00.000Z"), endDate: new Date("2027-06-30T00:00:00.000Z") } });
  await db.institution.update({ where: { id: A.institutionId }, data: { name: seedA.name, type: seedA.type, timezone: seedA.timezone, language: seedA.language } });
  await cleanup();
  await db.$disconnect();
});

test("períodos: crear, listar con estado, editar y borrar", async () => {
  const created = ok(await createPeriod(A.admin, { name: "  PI Enero–Abril 2030 ", startDate: "2030-01-10", endDate: "2030-04-30" }));
  assert.equal(created.isCurrent, false, "ya había un período actual: el nuevo no lo reemplaza");
  assert.deepEqual(created.overlapsWith, []);
  assert.deepEqual(await activeIds(A.institutionId), ["a_period"]);

  const now = new Date("2026-10-09T15:00:00.000Z");
  const list = await listPeriods(A.institutionId, now);
  const row = list.find((period) => period.id === created.periodId);
  assert.deepEqual(
    { name: row?.name, startDate: row?.startDate, endDate: row?.endDate, status: row?.status, courseCount: row?.courseCount },
    { name: "PI Enero–Abril 2030", startDate: "2030-01-10", endDate: "2030-04-30", status: "UPCOMING", courseCount: 0 },
  );
  const seeded = list.find((period) => period.id === "a_period");
  assert.equal(seeded?.status, "CURRENT");
  assert.ok((seeded?.courseCount ?? 0) >= 2, "cuenta los cursos del período");
  assert.ok(list.every((period) => period.id !== "b_period"), "no lista períodos de otra institución");
  assert.equal(list.find((period) => period.id === created.periodId)?.status, "UPCOMING");
  assert.equal((await listPeriods(A.institutionId, new Date("2031-01-01T12:00:00.000Z"))).find((period) => period.id === created.periodId)?.status, "ENDED");

  ok(await updatePeriod(A.admin, created.periodId, { name: "PI Enero–Mayo 2030", startDate: "2030-01-15", endDate: "2030-05-31" }));
  const saved = await db.academicPeriod.findUniqueOrThrow({ where: { id: created.periodId } });
  assert.equal(saved.name, "PI Enero–Mayo 2030");
  assert.equal(saved.startDate.toISOString(), "2030-01-15T00:00:00.000Z");
  assert.equal(saved.endDate.toISOString(), "2030-05-31T23:59:59.999Z");
  assert.equal(saved.isActive, false, "editar no cambia cuál es el actual");

  const deleted = ok(await deletePeriod(A.admin, created.periodId));
  assert.equal(deleted.wasCurrent, false);
  assert.equal(await db.academicPeriod.count({ where: { id: created.periodId } }), 0);
  for (const action of ["ACADEMIC_PERIOD_CREATED", "ACADEMIC_PERIOD_UPDATED", "ACADEMIC_PERIOD_DELETED"]) {
    assert.equal(await db.auditLog.count({ where: { action, entityId: created.periodId, institutionId: A.institutionId, userId: A.admin.id } }), 1, action);
  }
});

test("períodos: el estado sale de las fechas y de la marca de actual", () => {
  const range = { startDate: "2027-01-10", endDate: "2027-04-30" };
  assert.equal(periodStatus({ ...range, isCurrent: true }, "2030-01-01"), "CURRENT");
  assert.equal(periodStatus({ ...range, isCurrent: false }, "2027-01-09"), "UPCOMING");
  assert.equal(periodStatus({ ...range, isCurrent: false }, "2027-01-10"), "UNMARKED");
  assert.equal(periodStatus({ ...range, isCurrent: false }, "2027-04-30"), "UNMARKED");
  assert.equal(periodStatus({ ...range, isCurrent: false }, "2027-05-01"), "ENDED");
});

test("períodos: fechas invertidas, imposibles o nombre vacío se rechazan sin guardar nada", async () => {
  const before = await db.academicPeriod.count({ where: { institutionId: A.institutionId } });
  assert.match(message(await createPeriod(A.admin, { name: "PI Invertido", startDate: "2030-05-01", endDate: "2030-04-30" })), /no puede ser anterior/);
  assert.match(message(await createPeriod(A.admin, { name: "PI Imposible", startDate: "2030-02-31", endDate: "2030-04-30" })), /fecha en que empieza/);
  assert.match(message(await createPeriod(A.admin, { name: "PI Sin fin", startDate: "2030-02-01", endDate: "" })), /fecha en que termina/);
  assert.match(message(await createPeriod(A.admin, { name: " x ", startDate: "2030-02-01", endDate: "2030-03-01" })), /nombre del período/);
  assert.match(message(await updatePeriod(A.admin, "a_period", { name: "PI Robado", startDate: "2030-05-01", endDate: "2030-04-30" })), /no puede ser anterior/);
  assert.equal(await db.academicPeriod.count({ where: { institutionId: A.institutionId } }), before);
  assert.equal((await db.academicPeriod.findUniqueOrThrow({ where: { id: "a_period" } })).name, "Período A");
  ok(await createPeriod(A.admin, { name: "PI Un solo día", startDate: "2030-06-01", endDate: "2030-06-01" }));
});

test("períodos: si las fechas se cruzan con otro avisa pero guarda", async () => {
  const first = ok(await createPeriod(A.admin, { name: "PI Cruce uno", startDate: "2031-01-01", endDate: "2031-06-30" }));
  const second = ok(await createPeriod(A.admin, { name: "PI Cruce dos", startDate: "2031-06-30", endDate: "2031-12-31" }));
  assert.deepEqual(second.overlapsWith, ["PI Cruce uno"]);
  assert.equal(await db.academicPeriod.count({ where: { id: second.periodId } }), 1, "se guardó a pesar del cruce");
  const row = (await listPeriods(A.institutionId)).find((period) => period.id === first.periodId);
  assert.deepEqual(row?.overlapsWith, ["PI Cruce dos"]);
  const moved = ok(await updatePeriod(A.admin, second.periodId, { name: "PI Cruce dos", startDate: "2031-07-01", endDate: "2031-12-31" }));
  assert.deepEqual(moved.overlapsWith, [], "al día siguiente ya no se cruzan, y no se cuenta a sí mismo");
  const sameDatesInB = ok(await createPeriod(B.admin, { name: "PI Cruce en B", startDate: "2031-01-01", endDate: "2031-06-30" }));
  assert.deepEqual(sameDatesInB.overlapsWith, [], "los períodos de otra institución no cuentan como cruce");
  ok(await deletePeriod(B.admin, sameDatesInB.periodId));
});

test("períodos: marcar como actual deja uno solo en la institución y no toca la otra", async () => {
  const next = ok(await createPeriod(A.admin, { name: "PI Siguiente", startDate: "2032-01-01", endDate: "2032-06-30" }));
  const marked = ok(await setCurrentPeriod(A.admin, next.periodId));
  assert.deepEqual(marked.replaced, ["Período A"]);
  assert.deepEqual(await activeIds(A.institutionId), [next.periodId]);
  assert.deepEqual(await activeIds(B.institutionId), ["b_period"]);

  // Dos personas marcan períodos distintos a la vez: sigue quedando uno solo.
  const results = await Promise.all([setCurrentPeriod(A.admin, "a_period"), setCurrentPeriod(A.admin, next.periodId)]);
  assert.ok(results.every((result) => result.ok));
  assert.equal((await activeIds(A.institutionId)).length, 1);

  ok(await setCurrentPeriod(A.admin, "a_period"));
  assert.deepEqual(await activeIds(A.institutionId), ["a_period"]);
  assert.ok((await db.auditLog.count({ where: { action: "ACADEMIC_PERIOD_ACTIVATED", institutionId: A.institutionId } })) >= 2);

  const current = ok(await deletePeriod(A.admin, next.periodId));
  assert.equal(current.wasCurrent, false);
});

test("períodos: el primero de una institución queda como actual", async () => {
  const institution = await db.institution.create({ data: { name: "PI Nueva", slug: "pi-nueva-institucion" }, select: { id: true } });
  try {
    const admin = await db.user.create({ data: { institutionId: institution.id, name: "PI admin", email: "pi-admin@nueva.test", role: "ADMIN", status: "ACTIVE" }, select: { id: true } });
    const actor = { id: admin.id, institutionId: institution.id, role: "ADMIN" as const };
    const first = ok(await createPeriod(actor, { name: "PI Primero", startDate: "2030-01-01", endDate: "2030-06-30" }));
    const second = ok(await createPeriod(actor, { name: "PI Segundo", startDate: "2030-07-01", endDate: "2030-12-31" }));
    assert.equal(first.isCurrent, true);
    assert.equal(second.isCurrent, false);
    assert.deepEqual(await activeIds(institution.id), [first.periodId]);
    const removed = ok(await deletePeriod(actor, first.periodId));
    assert.equal(removed.wasCurrent, true);
  } finally {
    await db.institution.delete({ where: { id: institution.id } });
  }
});

test("períodos: no se borra uno con cursos ni con cobros, y se explica por qué", async () => {
  const withCourses = message(await deletePeriod(A.admin, "a_period"));
  assert.match(withCourses, /No se puede borrar/);
  assert.match(withCourses, /curso/);
  assert.match(withCourses, /cambia primero sus cursos a otro período/);
  assert.equal(await db.academicPeriod.count({ where: { id: "a_period" } }), 1);

  const period = ok(await createPeriod(A.admin, { name: "PI Con cobro", startDate: "2033-01-01", endDate: "2033-06-30" }));
  const charge = await db.paymentConcept.create({ data: { institutionId: A.institutionId, periodId: period.periodId, concept: "PI Matrícula", amount: 100 }, select: { id: true } });
  assert.match(message(await deletePeriod(A.admin, period.periodId)), /1 cobro/);
  assert.equal(await db.academicPeriod.count({ where: { id: period.periodId } }), 1);
  await db.paymentConcept.delete({ where: { id: charge.id } });
  ok(await deletePeriod(A.admin, period.periodId));
});

test("períodos: sin permiso o desde otra institución no se puede crear, editar, marcar ni borrar", async () => {
  const period = ok(await createPeriod(A.admin, { name: "PI Protegido", startDate: "2034-01-01", endDate: "2034-06-30" }));
  const input = { name: "PI Robado", startDate: "2034-02-01", endDate: "2034-03-01" };
  for (const actor of [A.coordinator, A.teacher, A.student, A.parent]) {
    assert.match(message(await createPeriod(actor, input)), /No tienes permiso/, actor.role);
    assert.match(message(await updatePeriod(actor, period.periodId, input)), /No tienes permiso/, actor.role);
    assert.match(message(await setCurrentPeriod(actor, period.periodId)), /No tienes permiso/, actor.role);
    assert.match(message(await deletePeriod(actor, period.periodId)), /No tienes permiso/, actor.role);
  }
  assert.match(message(await updatePeriod(B.admin, period.periodId, input)), /No encontramos/);
  assert.match(message(await setCurrentPeriod(B.admin, period.periodId)), /No encontramos/);
  assert.match(message(await deletePeriod(B.admin, period.periodId)), /No encontramos/);
  assert.match(message(await setCurrentPeriod(A.admin, "b_period")), /No encontramos/);
  assert.match(message(await deletePeriod(A.admin, "b_period")), /No encontramos/);

  const saved = await db.academicPeriod.findUniqueOrThrow({ where: { id: period.periodId } });
  assert.deepEqual({ name: saved.name, isActive: saved.isActive }, { name: "PI Protegido", isActive: false });
  assert.equal(await db.academicPeriod.count({ where: { name: "PI Robado" } }), 0);
  assert.deepEqual(await activeIds(A.institutionId), ["a_period"]);
  assert.deepEqual(await snapshotB(), seedB, "la institución B queda intacta");
  ok(await deletePeriod(A.admin, period.periodId));
});

test("institución: cambiar los datos de A no toca B ni los datos internos de A", async () => {
  const result = ok(await updateInstitutionSettings(A.admin, { name: "  PI Colegio Renovado ", type: "SCHOOL", timezone: "America/Bogota", language: "en" }));
  assert.equal(result.timezoneChanged, true);
  assert.deepEqual(await getInstitutionSettings(A.institutionId), { name: "PI Colegio Renovado", type: "SCHOOL", timezone: "America/Bogota", language: "en" });
  const internal = await db.institution.findUniqueOrThrow({ where: { id: A.institutionId }, select: { slug: true, domain: true } });
  assert.deepEqual(internal, { slug: seedA.slug, domain: seedA.domain }, "la dirección interna y el dominio no cambian");
  assert.deepEqual(await snapshotB(), seedB, "la institución B queda intacta");

  const same = ok(await updateInstitutionSettings(A.admin, { name: "PI Colegio Renovado", type: "SCHOOL", timezone: "America/Bogota", language: "es" }));
  assert.equal(same.timezoneChanged, false);
  const audit = await db.auditLog.findMany({ where: { action: "INSTITUTION_SETTINGS_UPDATED", institutionId: A.institutionId, userId: A.admin.id } });
  assert.equal(audit.length, 2);
  assert.equal(await db.auditLog.count({ where: { action: "INSTITUTION_SETTINGS_UPDATED", institutionId: B.institutionId } }), 0);
});

test("institución: zona horaria, tipo, idioma o nombre inválidos se rechazan sin guardar", async () => {
  const before = await getInstitutionSettings(A.institutionId);
  const base = { name: "PI Otro nombre", type: "ACADEMY", timezone: "America/Lima", language: "es" };
  assert.match(message(await updateInstitutionSettings(A.admin, { ...base, timezone: "America/Ciudad_Inventada" })), /zona horaria no es válida/);
  assert.match(message(await updateInstitutionSettings(A.admin, { ...base, timezone: "" })), /zona horaria no es válida/);
  assert.match(message(await updateInstitutionSettings(A.admin, { ...base, timezone: "x".repeat(200) })), /zona horaria no es válida/);
  assert.match(message(await updateInstitutionSettings(A.admin, { ...base, type: "HOSPITAL" })), /tipo de institución/);
  assert.match(message(await updateInstitutionSettings(A.admin, { ...base, language: "fr" })), /idioma/);
  assert.match(message(await updateInstitutionSettings(A.admin, { ...base, name: " " })), /nombre de la institución/);
  assert.deepEqual(await getInstitutionSettings(A.institutionId), before);
});

test("institución: quien no tiene el permiso no cambia nada, y el administrador de B solo cambia B", async () => {
  const before = await getInstitutionSettings(A.institutionId);
  const input = { name: "PI Tomada", type: "OTHER", timezone: "UTC", language: "es" };
  for (const actor of [A.coordinator, A.teacher, A.student, A.parent]) {
    assert.match(message(await updateInstitutionSettings(actor, input)), /No tienes permiso/, actor.role);
  }
  assert.deepEqual(await getInstitutionSettings(A.institutionId), before);

  const original = seedB[1];
  ok(await updateInstitutionSettings(B.admin, input));
  assert.deepEqual(await getInstitutionSettings(A.institutionId), before, "el administrador de B no alcanza a A");
  assert.equal((await getInstitutionSettings(B.institutionId))?.name, "PI Tomada");
  await db.institution.update({ where: { id: B.institutionId }, data: { name: original.name, type: original.type, timezone: original.timezone, language: original.language } });
  assert.deepEqual(await snapshotB(), seedB);
});

test("institución: el selector ofrece primero América Latina y siempre incluye la zona actual", () => {
  const options = timeZoneOptions("Antarctica/Troll");
  assert.equal(options.latinAmerica[0].value, "America/Santo_Domingo");
  assert.ok(options.latinAmerica.some((option) => option.value === "America/Bogota"));
  assert.ok(options.rest.some((option) => option.value === "Antarctica/Troll"));
  assert.ok(options.rest.some((option) => option.value === "UTC"));
  const all = [...options.latinAmerica, ...options.rest].map((option) => option.value);
  assert.equal(new Set(all).size, all.length, "ninguna zona se repite");
});
