import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { deleteAnnouncement, updateAnnouncement } from "@/server/announcements";
import { A, B, ensureSeed } from "./setup";

const OWN = "a_aviso_docente";
const edit = { title: "Título corregido", content: "Mensaje corregido para la clase.", isPinned: true };

before(async () => {
  await ensureSeed();
  await db.announcement.create({
    data: { id: OWN, institutionId: A.institutionId, authorId: A.teacher.id, title: "Aviso del docente", content: "Mensaje original.", audience: "ROLE" },
  });
});
after(async () => {
  await db.announcement.deleteMany({ where: { id: OWN } });
  await db.auditLog.deleteMany({ where: { action: { in: ["announcement.update", "announcement.delete"] } } });
  await db.$disconnect();
});

test("avisos: el autor corrige título, mensaje y fijado; queda en auditoría", async () => {
  assert.deepEqual(await updateAnnouncement(A.teacher, { id: OWN, ...edit }, false), { ok: true });
  const saved = await db.announcement.findUniqueOrThrow({ where: { id: OWN } });
  assert.equal(saved.title, edit.title);
  assert.equal(saved.content, edit.content);
  assert.equal(saved.isPinned, true);
  assert.equal(saved.authorId, A.teacher.id, "el autor no cambia");
  assert.equal(await db.auditLog.count({ where: { action: "announcement.update", entityId: OWN } }), 1);
});

test("avisos: datos no válidos se rechazan sin cambiar nada", async () => {
  const result = await updateAnnouncement(A.teacher, { id: OWN, title: "ab", content: edit.content, isPinned: false }, false);
  assert.equal(result.ok, false);
  assert.equal((await db.announcement.findUniqueOrThrow({ where: { id: OWN } })).title, edit.title);
});

test("avisos: otro docente no puede corregir ni borrar un aviso ajeno", async () => {
  assert.equal((await updateAnnouncement(A.teacher2, { id: OWN, ...edit, title: "Cambio ajeno" }, false)).ok, false);
  assert.equal((await deleteAnnouncement(A.teacher2, OWN, false)).ok, false);
  assert.equal((await db.announcement.findUniqueOrThrow({ where: { id: OWN } })).title, edit.title);
});

test("avisos: quien gestiona todos los avisos puede corregir el de otra persona, pero no el de otra institución", async () => {
  assert.deepEqual(await updateAnnouncement(A.admin, { id: OWN, ...edit, title: "Corregido por administración" }, true), { ok: true });
  assert.equal((await updateAnnouncement(B.admin, { id: OWN, ...edit, title: "Desde otra institución" }, true)).ok, false);
  assert.equal((await deleteAnnouncement(B.admin, OWN, true)).ok, false);
  assert.equal((await db.announcement.findUniqueOrThrow({ where: { id: OWN } })).title, "Corregido por administración");
});

test("avisos: borrar lo quita con sus destinatarios y no toca otros avisos", async () => {
  await db.announcementRoleTarget.create({ data: { institutionId: A.institutionId, announcementId: OWN, role: "STUDENT" } });
  const others = await db.announcement.count({ where: { id: { not: OWN } } });
  assert.deepEqual(await deleteAnnouncement(A.teacher, OWN, false), { ok: true });
  assert.equal(await db.announcement.count({ where: { id: OWN } }), 0);
  assert.equal(await db.announcementRoleTarget.count({ where: { announcementId: OWN } }), 0);
  assert.equal(await db.announcement.count({ where: { id: { not: OWN } } }), others);
  assert.equal((await deleteAnnouncement(A.teacher, OWN, false)).ok, false, "borrar dos veces no falla, avisa");
});

test("primeros pasos: se marcan solos según los datos y son por institución", async () => {
  const { getFirstSteps } = await import("@/server/first-steps");
  const steps = await getFirstSteps(A.institutionId);
  assert.deepEqual(steps.map((step) => step.id), ["period", "people", "course", "enrollment", "invitations"]);
  const state = Object.fromEntries(steps.map((step) => [step.id, step.done]));
  assert.equal(state.period, true);
  assert.equal(state.course, true);
  assert.equal(state.enrollment, true);
  assert.equal(state.invitations, false, "en la semilla nadie tiene contraseña ni invitación");

  const empty = await db.institution.create({ data: { id: "vacia_inst", name: "Vacía", slug: "vacia-pasos" } });
  try {
    assert.ok((await getFirstSteps(empty.id)).every((step) => !step.done));
  } finally {
    await db.institution.delete({ where: { id: empty.id } });
  }
});
