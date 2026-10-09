import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { admissionSummary, convertLead, createLead, deleteLead, getLead, listLeads, moveLeadStage, updateLead } from "@/server/admissions/leads";
import { A, B, ensureSeed } from "./setup";

const NEW_EMAILS = ["aspirante@admisiones.test", "con.grupo@admisiones.test", "sin.cupo@admisiones.test", "grupo.ajeno@admisiones.test"];
const GROUP_A = "adm_group_a";
const GROUP_B = "adm_group_b";
let startedAt = new Date();

before(async () => {
  await ensureSeed();
  startedAt = new Date(Date.now() - 1000);
  await db.studentGroup.createMany({
    data: [
      { id: GROUP_A, institutionId: A.institutionId, name: "Admisiones grupo A", startsOn: new Date("2027-01-15"), capacity: 1 },
      { id: GROUP_B, institutionId: B.institutionId, name: "Admisiones grupo B", startsOn: new Date("2027-01-15") },
    ],
  });
});
after(async () => {
  await db.admissionLead.deleteMany({ where: { institutionId: { in: [A.institutionId, B.institutionId] } } });
  await db.studentGroup.deleteMany({ where: { id: { in: [GROUP_A, GROUP_B] } } });
  await db.user.deleteMany({ where: { email: { in: NEW_EMAILS } } });
  await db.identity.deleteMany({ where: { email: { in: NEW_EMAILS } } });
  await db.auditLog.deleteMany({
    where: { createdAt: { gte: startedAt }, OR: [{ entity: "AdmissionLead" }, { action: { in: ["PERSON_CREATED", "GROUP_MEMBERS_ADDED"] } }] },
  });
  await db.$disconnect();
});

async function newLead(email: string, name = "Ana Aspirante") {
  const result = await createLead(A.admin, { name, email, phone: "8095550101", programInterest: "Enfermería", source: "Recomendación", notes: "Llamó por teléfono." });
  assert.ok(result.ok);
  return result.leadId;
}
const audits = (leadId: string, action: string) => db.auditLog.findMany({ where: { entity: "AdmissionLead", entityId: leadId, action }, orderBy: { createdAt: "asc" } });

test("crear, avanzar y retroceder de etapa deja cada cambio en el historial", async () => {
  assert.equal((await createLead(A.admin, { name: "An", email: "ana@admisiones.test" })).ok, false);
  assert.equal((await createLead(A.admin, { name: "Ana Aspirante", email: "no-es-correo" })).ok, false);
  const leadId = await newLead("  Historial@Admisiones.test ");
  const saved = await db.admissionLead.findUniqueOrThrow({ where: { id: leadId } });
  assert.equal(saved.institutionId, A.institutionId);
  assert.equal(saved.email, "historial@admisiones.test");
  assert.equal(saved.stage, "INTERESTED");
  assert.equal((await audits(leadId, "ADMISSION_CREATED")).length, 1);

  assert.ok((await moveLeadStage(A.admin, leadId, "DOCUMENTS")).ok);
  assert.ok((await moveLeadStage(A.coordinator, leadId, "REVIEW")).ok);
  assert.ok((await moveLeadStage(A.admin, leadId, "DOCUMENTS", "Falta el acta")).ok);
  // Repetir la misma etapa no cambia nada ni ensucia el historial.
  assert.ok((await moveLeadStage(A.admin, leadId, "DOCUMENTS")).ok);
  assert.equal((await moveLeadStage(A.admin, leadId, "REJECTED")).ok, false, "«No continúa» exige motivo");
  assert.equal((await moveLeadStage(A.admin, leadId, "ENROLLED")).ok, false, "«Inscrito» solo se alcanza al convertir");
  assert.equal((await moveLeadStage(A.admin, leadId, "OTRA")).ok, false);

  const changes = (await audits(leadId, "ADMISSION_STAGE_CHANGED")).map((row) => row.changes);
  assert.deepEqual(changes, [
    { from: "INTERESTED", to: "DOCUMENTS" },
    { from: "DOCUMENTS", to: "REVIEW" },
    { from: "REVIEW", to: "DOCUMENTS", reason: "Falta el acta" },
  ]);
  assert.ok((await moveLeadStage(A.admin, leadId, "REJECTED", "Eligió otra institución")).ok);
  assert.equal((await db.admissionLead.findUniqueOrThrow({ where: { id: leadId } })).stage, "REJECTED");

  assert.ok((await updateLead(A.admin, leadId, { name: "Ana Corregida", email: "historial@admisiones.test", notes: "Nota nueva" })).ok);
  const detail = await getLead(A.institutionId, leadId);
  assert.equal(detail?.lead.name, "Ana Corregida");
  assert.equal(detail?.history.length, 6);
  assert.equal(detail?.history[0].action, "ADMISSION_UPDATED");
  assert.equal(detail?.history[0].author, "admin A");

  const found = await listLeads(A.institutionId, { search: "corregida" });
  assert.deepEqual(found.map((lead) => lead.id), [leadId]);
  assert.equal((await listLeads(A.institutionId, { program: "otro programa" })).length, 0);
});

test("convertir crea a la persona en A como estudiante y repetirlo no duplica", async () => {
  const leadId = await newLead("Aspirante@Admisiones.test");
  assert.equal((await convertLead(A.admin, { leadId })).ok, false, "solo se convierte una solicitud admitida");
  assert.equal(await db.user.count({ where: { email: "aspirante@admisiones.test" } }), 0);
  assert.ok((await moveLeadStage(A.admin, leadId, "ACCEPTED")).ok);

  const first = await convertLead(A.admin, { leadId });
  assert.ok(first.ok);
  assert.equal(first.created, true);
  assert.equal(first.alreadyConverted, false);
  const person = await db.user.findUniqueOrThrow({ where: { id: first.userId } });
  assert.equal(person.institutionId, A.institutionId);
  assert.equal(person.role, "STUDENT");
  assert.equal(person.email, "aspirante@admisiones.test");
  assert.equal(person.name, "Ana Aspirante");
  const lead = await db.admissionLead.findUniqueOrThrow({ where: { id: leadId } });
  assert.equal(lead.stage, "ENROLLED");
  assert.equal(lead.convertedUserId, first.userId);
  assert.ok(lead.convertedAt, "guarda cuándo se convirtió");
  assert.doesNotMatch(lead.notes ?? "", /Convertida en estudiante/, "las notas son de quien gestiona: el hecho queda en el historial");
  assert.equal((lead.documents as Record<string, unknown> | null)?.convertedUserId, undefined, "el vínculo ya no va en documents");
  const detail = await getLead(A.institutionId, leadId);
  assert.equal(detail?.person?.id, first.userId);
  assert.equal(detail?.person?.access, "pending", "aún no se le envió invitación");

  const [again, twice] = await Promise.all([convertLead(A.admin, { leadId }), convertLead(A.admin, { leadId })]);
  for (const repeat of [again, twice]) {
    assert.ok(repeat.ok);
    assert.equal(repeat.alreadyConverted, true);
    assert.equal(repeat.userId, first.userId);
  }
  assert.equal(await db.user.count({ where: { email: "aspirante@admisiones.test" } }), 1);
  assert.equal((await audits(leadId, "ADMISSION_CONVERTED")).length, 1);
  assert.equal((await moveLeadStage(A.admin, leadId, "REVIEW")).ok, false, "una convertida ya no cambia de etapa");

  const summary = await admissionSummary(A.institutionId, "America/Santo_Domingo");
  assert.equal(summary.enrolled, 1);
  assert.ok(summary.admittedThisMonth >= 1);
  assert.ok(summary.conversionRate !== null && summary.conversionRate > 0);
});

test("dos conversiones simultáneas de la misma solicitud crean una sola persona", async () => {
  const leadId = await newLead("sin.cupo@admisiones.test", "Doble Clic");
  assert.ok((await moveLeadStage(A.admin, leadId, "ACCEPTED")).ok);
  const [one, two] = await Promise.all([convertLead(A.admin, { leadId }), convertLead(A.admin, { leadId })]);
  assert.ok(one.ok);
  assert.ok(two.ok);
  assert.equal(one.userId, two.userId);
  assert.equal(await db.user.count({ where: { email: "sin.cupo@admisiones.test" } }), 1);
  assert.equal((await audits(leadId, "ADMISSION_CONVERTED")).length, 1);
});

test("un correo que ya es de alguien en A no falla: ofrece vincular y no crea otra persona", async () => {
  const leadId = await newLead("estudiante2@a.test", "Student Dos");
  assert.ok((await moveLeadStage(A.admin, leadId, "ACCEPTED")).ok);
  const before = await db.user.count({ where: { institutionId: A.institutionId } });

  const offered = await convertLead(A.admin, { leadId });
  assert.equal(offered.ok, false);
  assert.equal(!offered.ok && offered.code, "PERSON_EXISTS");
  assert.equal((await db.admissionLead.findUniqueOrThrow({ where: { id: leadId } })).stage, "ACCEPTED");

  const linked = await convertLead(A.admin, { leadId, linkExisting: true });
  assert.ok(linked.ok);
  assert.equal(linked.created, false);
  assert.equal(linked.userId, A.student2.id);
  assert.equal(await db.user.count({ where: { institutionId: A.institutionId } }), before);

  // Quien ya está como docente o está suspendida no se vincula como estudiante.
  for (const email of ["docente@a.test", "suspendido@a.test"]) {
    const other = await newLead(email, "Otra Persona");
    assert.ok((await moveLeadStage(A.admin, other, "ACCEPTED")).ok);
    const refused = await convertLead(A.admin, { leadId: other, linkExisting: true });
    assert.equal(refused.ok, false);
    assert.equal(!refused.ok && refused.code, undefined);
    assert.equal((await db.admissionLead.findUniqueOrThrow({ where: { id: other } })).stage, "ACCEPTED");
  }
  assert.equal(await db.user.count({ where: { institutionId: A.institutionId } }), before);
});

test("convertir con grupo respeta la institución y el cupo", async () => {
  const foreign = await newLead("grupo.ajeno@admisiones.test", "Grupo Ajeno");
  assert.ok((await moveLeadStage(A.admin, foreign, "ACCEPTED")).ok);
  assert.equal((await convertLead(A.admin, { leadId: foreign, groupId: GROUP_B })).ok, false, "un grupo de B no sirve en A");
  assert.equal(await db.user.count({ where: { email: "grupo.ajeno@admisiones.test" } }), 0, "no se crea a nadie si el grupo no vale");
  assert.equal(await db.studentGroupMember.count({ where: { groupId: GROUP_B } }), 0);

  const leadId = await newLead("con.grupo@admisiones.test", "Con Grupo");
  assert.ok((await moveLeadStage(A.admin, leadId, "ACCEPTED")).ok);
  const result = await convertLead(A.admin, { leadId, groupId: GROUP_A });
  assert.ok(result.ok);
  assert.equal(result.addedToGroup, true);
  const member = await db.studentGroupMember.findUniqueOrThrow({ where: { groupId_userId: { groupId: GROUP_A, userId: result.userId } } });
  assert.equal(member.institutionId, A.institutionId);

  // El grupo tenía un solo cupo: la siguiente conversión con ese grupo se rechaza antes de crear a nadie.
  const full = await convertLead(A.admin, { leadId: foreign, groupId: GROUP_A });
  assert.equal(full.ok, false);
  assert.match(!full.ok ? full.message : "", /lleno/);
  assert.equal(await db.user.count({ where: { email: "grupo.ajeno@admisiones.test" } }), 0);
  assert.equal(await db.studentGroupMember.count({ where: { groupId: GROUP_A } }), 1);
});

test("otra institución y quien no tiene el permiso quedan fuera", async () => {
  const leadId = await newLead("ajena@admisiones.test", "Solo De A");
  assert.ok((await moveLeadStage(A.admin, leadId, "ACCEPTED")).ok);

  assert.equal(await getLead(B.institutionId, leadId), null);
  assert.equal((await listLeads(B.institutionId)).length, 0);
  assert.equal((await moveLeadStage(B.admin, leadId, "REVIEW")).ok, false);
  assert.equal((await updateLead(B.admin, leadId, { name: "Cambiada Por B", email: "b@admisiones.test" })).ok, false);
  assert.equal((await convertLead(B.admin, { leadId })).ok, false);
  assert.equal((await deleteLead(B.admin, leadId)).ok, false);

  // Docente y estudiante de A no gestionan admisiones.
  for (const actor of [A.teacher, A.student]) {
    assert.equal((await createLead(actor, { name: "No Debe Entrar", email: "nadie@admisiones.test" })).ok, false);
    assert.equal((await moveLeadStage(actor, leadId, "REVIEW")).ok, false);
    assert.equal((await updateLead(actor, leadId, { name: "Cambiada Sin Permiso", email: "ajena@admisiones.test" })).ok, false);
    assert.equal((await convertLead(actor, { leadId })).ok, false);
    assert.equal((await deleteLead(actor, leadId)).ok, false);
  }
  // La coordinación gestiona admisiones pero no crea personas: no puede convertir.
  assert.equal((await convertLead(A.coordinator, { leadId })).ok, false);

  const untouched = await db.admissionLead.findUniqueOrThrow({ where: { id: leadId } });
  assert.equal(untouched.name, "Solo De A");
  assert.equal(untouched.stage, "ACCEPTED");
  assert.equal(await db.user.count({ where: { email: "ajena@admisiones.test" } }), 0);
  assert.equal(await db.admissionLead.count({ where: { email: "nadie@admisiones.test" } }), 0);
});

test("borrar: una solicitud convertida se rechaza; una abierta se borra y queda registrado", async () => {
  const converted = await db.admissionLead.findFirstOrThrow({ where: { institutionId: A.institutionId, email: "aspirante@admisiones.test" } });
  assert.equal((await deleteLead(A.admin, converted.id)).ok, false);
  assert.equal(await db.admissionLead.count({ where: { id: converted.id } }), 1);

  const leadId = await newLead("borrar@admisiones.test", "Para Borrar");
  assert.ok((await deleteLead(A.coordinator, leadId)).ok);
  assert.equal(await db.admissionLead.count({ where: { id: leadId } }), 0);
  assert.equal((await audits(leadId, "ADMISSION_DELETED")).length, 1);
  assert.equal((await deleteLead(A.admin, leadId)).ok, false);
});

test("una solicitud convertida antes del campo propio se sigue reconociendo por documents", async () => {
  const legacy = await db.admissionLead.create({
    data: { institutionId: A.institutionId, name: "Solicitud Antigua", email: "antigua@admisiones.test", stage: "ENROLLED", documents: { convertedUserId: A.student.id } },
  });
  const detail = await getLead(A.institutionId, legacy.id);
  assert.equal(detail?.convertedUserId, A.student.id);
  assert.equal(detail?.person?.id, A.student.id);
  const again = await convertLead(A.admin, { leadId: legacy.id });
  assert.ok(again.ok && again.alreadyConverted && again.userId === A.student.id, "no la convierte dos veces");
  assert.equal((await deleteLead(A.admin, legacy.id)).ok, false, "tampoco se borra");
});
