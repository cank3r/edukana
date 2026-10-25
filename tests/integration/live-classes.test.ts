import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { createLiveClasses, deleteLiveClass, getAgenda, listLiveClasses, updateLiveClass } from "@/server/courses/live-classes";
import { A, B, ensureSeed } from "./setup";

// Reloj fijo: 1 de marzo de 2027, 8:00 a. m. en Santo Domingo (UTC-4, sin cambio de horario).
const NOW = new Date("2027-03-01T12:00:00.000Z");
const AUDITED = ["LIVE_CLASS_CREATED", "LIVE_CLASS_UPDATED", "LIVE_CLASS_DELETED"];
const base = { title: "Repaso en vivo", date: "2027-03-03", time: "18:30", durationMinutes: 60, joinUrl: "https://meet.example.com/abc-defg" };
const classesOf = (courseId: string) => db.liveClass.findMany({ where: { courseId }, orderBy: { startsAt: "asc" } });

before(async () => {
  await ensureSeed();
  await db.liveClass.deleteMany();
});
after(async () => {
  await db.liveClass.deleteMany();
  await db.assignment.deleteMany({ where: { id: { in: ["a_lc_task", "a_lc_draft"] } } });
  await db.auditLog.deleteMany({ where: { action: { in: AUDITED } } });
  await db.institution.update({ where: { id: A.institutionId }, data: { timezone: "America/Santo_Domingo" } });
  await db.course.update({ where: { id: A.courseId }, data: { isPublished: true } });
  await db.$disconnect();
});

test("crear: el docente programa una clase; la hora se interpreta en la zona de la institución y se guarda en UTC", async () => {
  const result = await createLiveClasses(A.teacher, { ...base, courseId: A.courseId, description: "  Traigan dudas  " }, NOW);
  assert.deepEqual(result, { ok: true, courseId: A.courseId, created: 1, warning: null });
  const [saved] = await classesOf(A.courseId);
  assert.equal(saved.startsAt.toISOString(), "2027-03-03T22:30:00.000Z");
  assert.equal(saved.institutionId, A.institutionId);
  assert.equal(saved.createdById, A.teacher.id);
  assert.equal(saved.description, "Traigan dudas");
  assert.equal(saved.durationMinutes, 60);
  assert.equal(await db.auditLog.count({ where: { action: "LIVE_CLASS_CREATED", institutionId: A.institutionId, entityId: saved.id } }), 1);
});

test("crear: enlace que no es https, fecha pasada, duración no positiva y datos incompletos se rechazan sin guardar nada", async () => {
  const before = await db.liveClass.count();
  const attempt = (changes: Partial<Parameters<typeof createLiveClasses>[1]>) => createLiveClasses(A.teacher, { ...base, courseId: A.courseId, ...changes }, NOW);
  for (const joinUrl of ["http://meet.example.com/abc", "meet.example.com/abc", "javascript:alert(1)", "https://", ""]) {
    const result = await attempt({ joinUrl });
    assert.equal(result.ok, false, `enlace rechazado: ${joinUrl}`);
    assert.match(result.ok ? "" : result.message, /https/);
  }
  const past = await attempt({ date: "2027-02-28" });
  assert.deepEqual(past, { ok: false, message: "Esa fecha y hora ya pasaron. Elige una fecha futura." });
  assert.equal((await attempt({ date: "2027-03-01", time: "07:59" })).ok, false, "hoy, pero una hora que ya pasó");
  assert.equal((await attempt({ durationMinutes: 0 })).ok, false);
  assert.equal((await attempt({ durationMinutes: -30 })).ok, false);
  assert.equal((await attempt({ title: " " })).ok, false);
  assert.equal((await attempt({ date: "2027-02-31" })).ok, false);
  assert.equal((await attempt({ weeks: 0 })).ok, false);
  assert.equal((await attempt({ weeks: 99 })).ok, false);
  assert.equal(await db.liveClass.count(), before);
});

test("repetir: N semanas crea N clases independientes a la misma hora local, también al cruzar un cambio de horario", async () => {
  await db.institution.update({ where: { id: A.institutionId }, data: { timezone: "America/New_York" } });
  try {
    const result = await createLiveClasses(A.teacher2, { ...base, title: "Semanal", date: "2027-03-08", time: "18:00", courseId: A.course2Id, weeks: 3 }, NOW);
    assert.deepEqual(result, { ok: true, courseId: A.course2Id, created: 3, warning: null });
    const saved = await classesOf(A.course2Id);
    // En Nueva York el horario de verano de 2027 empieza el 14 de marzo: 18:00 pasa de 23:00 UTC a 22:00 UTC.
    assert.deepEqual(saved.map((item) => item.startsAt.toISOString()), ["2027-03-08T23:00:00.000Z", "2027-03-15T22:00:00.000Z", "2027-03-22T22:00:00.000Z"]);
    assert.equal(new Set(saved.map((item) => item.id)).size, 3);

    assert.deepEqual(await deleteLiveClass(A.teacher2, saved[1].id), { ok: true, courseId: A.course2Id });
    assert.equal((await classesOf(A.course2Id)).length, 2, "borrar una no toca las demás");
  } finally {
    await db.institution.update({ where: { id: A.institutionId }, data: { timezone: "America/Santo_Domingo" } });
    await db.liveClass.deleteMany({ where: { courseId: A.course2Id } });
  }
});

test("solape: programar encima de otra clase del mismo curso avisa pero guarda", async () => {
  const result = await createLiveClasses(A.admin, { ...base, title: "Encima", time: "19:00", courseId: A.courseId }, NOW);
  assert.ok(result.ok);
  assert.match(result.warning ?? "", /se cruza con «Repaso en vivo»/);
  const other = await createLiveClasses(A.teacher2, { ...base, courseId: A.course2Id }, NOW);
  assert.ok(other.ok);
  assert.equal(other.warning, null, "otro curso a la misma hora no avisa");
  await db.liveClass.deleteMany({ where: { OR: [{ title: "Encima" }, { courseId: A.course2Id }] } });
});

test("editar y borrar: quien gestiona el curso cambia la clase y luego la borra, con auditoría", async () => {
  const [saved] = await classesOf(A.courseId);
  const edited = await updateLiveClass(A.coordinator, { id: saved.id, title: "Repaso final", date: "2027-03-04", time: "09:15", durationMinutes: 90, joinUrl: "https://zoom.example.com/j/123", description: "" }, NOW);
  assert.deepEqual(edited, { ok: true, courseId: A.courseId, created: 0, warning: null });
  const after = await db.liveClass.findUniqueOrThrow({ where: { id: saved.id } });
  assert.equal(after.title, "Repaso final");
  assert.equal(after.startsAt.toISOString(), "2027-03-04T13:15:00.000Z");
  assert.equal(after.durationMinutes, 90);
  assert.equal(after.joinUrl, "https://zoom.example.com/j/123");
  assert.equal(after.description, null);

  const same = { id: saved.id, title: "Repaso final", date: "2027-03-04", time: "09:15", durationMinutes: 90, joinUrl: "https://zoom.example.com/j/123" };
  assert.equal((await updateLiveClass(A.teacher, { ...same, joinUrl: "http://zoom.example.com/j/123" }, NOW)).ok, false);
  assert.equal((await updateLiveClass(A.teacher, { ...same, date: "2027-02-20" }, NOW)).ok, false, "no se mueve al pasado");
  assert.equal((await updateLiveClass(A.teacher, { ...same, durationMinutes: 0 }, NOW)).ok, false);
  // Una clase que ya pasó se puede corregir (título o enlace) mientras no se mueva de hora.
  const later = new Date("2027-04-01T12:00:00.000Z");
  assert.equal((await updateLiveClass(A.teacher, { ...same, title: "Repaso final (grabado)" }, later)).ok, true);
  assert.equal((await db.liveClass.findUniqueOrThrow({ where: { id: saved.id } })).startsAt.toISOString(), "2027-03-04T13:15:00.000Z");
  assert.equal(await db.auditLog.count({ where: { action: "LIVE_CLASS_UPDATED", entityId: saved.id } }), 2);

  assert.deepEqual(await deleteLiveClass(A.teacher, saved.id), { ok: true, courseId: A.courseId });
  assert.equal(await db.liveClass.count({ where: { id: saved.id } }), 0);
  assert.equal(await db.auditLog.count({ where: { action: "LIVE_CLASS_DELETED", entityId: saved.id, institutionId: A.institutionId } }), 1);
  assert.equal((await deleteLiveClass(A.teacher, saved.id)).ok, false, "borrar dos veces no falla feo");
});

test("permisos: docente ajeno, estudiante, tutor y cualquier persona de B no pueden crear, editar ni borrar en A", async () => {
  assert.ok((await createLiveClasses(A.teacher, { ...base, courseId: A.courseId }, NOW)).ok);
  const [target] = await classesOf(A.courseId);
  const intruders = [A.teacher2, A.student, A.student2, A.parent, B.admin, B.coordinator, B.teacher, B.student];
  for (const intruder of intruders) {
    const who = `${intruder.id}`;
    assert.equal((await createLiveClasses(intruder, { ...base, courseId: A.courseId }, NOW)).ok, false, `crear: ${who}`);
    assert.equal((await updateLiveClass(intruder, { ...base, id: target.id, title: "Cambiada por otro" }, NOW)).ok, false, `editar: ${who}`);
    assert.equal((await deleteLiveClass(intruder, target.id)).ok, false, `borrar: ${who}`);
  }
  const unchanged = await classesOf(A.courseId);
  assert.equal(unchanged.length, 1);
  assert.equal(unchanged[0].title, "Repaso en vivo");
  assert.equal(await db.liveClass.count({ where: { institutionId: B.institutionId } }), 0);
});

test("ver: el estudiante inscrito la ve en solo lectura; el no inscrito, el tutor y la gente de B no", async () => {
  const forTeacher = await listLiveClasses(A.teacher, A.courseId, NOW);
  assert.equal(forTeacher?.canManage, true);
  assert.equal(forTeacher?.upcoming.length, 1);
  assert.equal(forTeacher?.timeZone, "America/Santo_Domingo");
  assert.equal((await listLiveClasses(A.admin, A.courseId, NOW))?.canManage, true);

  const forStudent = await listLiveClasses(A.student, A.courseId, NOW);
  assert.equal(forStudent?.canManage, false);
  assert.deepEqual(forStudent?.upcoming.map((item) => item.title), ["Repaso en vivo"]);
  assert.equal(forStudent?.upcoming[0].joinUrl, base.joinUrl);

  assert.equal(await listLiveClasses(A.student2, A.courseId, NOW), null, "no inscrito");
  assert.equal(await listLiveClasses(A.teacher2, A.courseId, NOW), null, "docente de otro curso");
  assert.equal(await listLiveClasses(A.parent, A.courseId, NOW), null);
  for (const outsider of [B.admin, B.teacher, B.student]) assert.equal(await listLiveClasses(outsider, A.courseId, NOW), null, outsider.id);

  // Una inscripción retirada o un curso sin publicar dejan de mostrar las clases al estudiante.
  await db.enrollment.update({ where: { id: "a_enrollment" }, data: { status: "DROPPED" } });
  try {
    assert.equal(await listLiveClasses(A.student, A.courseId, NOW), null);
  } finally {
    await db.enrollment.update({ where: { id: "a_enrollment" }, data: { status: "ACTIVE" } });
  }
  await db.course.update({ where: { id: A.courseId }, data: { isPublished: false } });
  try {
    assert.equal(await listLiveClasses(A.student, A.courseId, NOW), null);
    assert.equal((await getAgenda(A.student, NOW)).days.length, 0);
    assert.equal((await listLiveClasses(A.teacher, A.courseId, NOW))?.upcoming.length, 1, "el docente sí la sigue viendo");
  } finally {
    await db.course.update({ where: { id: A.courseId }, data: { isPublished: true } });
  }

  // Al terminar pasa a «pasadas».
  const afterClass = new Date("2027-03-04T00:00:00.000Z");
  const later = await listLiveClasses(A.student, A.courseId, afterClass);
  assert.equal(later?.upcoming.length, 0);
  assert.equal(later?.past.length, 1);
});

test("agenda: cada quien ve lo suyo en los próximos 14 días y la de B no incluye nada de A", async () => {
  await createLiveClasses(A.teacher2, { ...base, title: "Clase del curso 2", date: "2027-03-05", courseId: A.course2Id }, NOW);
  await createLiveClasses(A.teacher, { ...base, title: "Fuera de rango", date: "2027-03-20", courseId: A.courseId }, NOW);
  await db.assignment.createMany({
    data: [
      { id: "a_lc_task", institutionId: A.institutionId, courseId: A.courseId, title: "Tarea publicada", dueDate: new Date("2027-03-03T15:00:00.000Z"), isPublished: true },
      { id: "a_lc_draft", institutionId: A.institutionId, courseId: A.courseId, title: "Tarea en borrador", dueDate: new Date("2027-03-03T16:00:00.000Z"), isPublished: false },
    ],
  });
  const titles = async (actor: Parameters<typeof getAgenda>[0]) => (await getAgenda(actor, NOW)).days.flatMap((day) => day.items.map((item) => item.title));

  const student = await getAgenda(A.student, NOW);
  assert.deepEqual(student.days.map((day) => day.key), ["2027-03-03"]);
  assert.deepEqual(student.days[0].items.map((item) => `${item.kind}:${item.title}`), ["assignment:Tarea publicada", "class:Repaso en vivo"]);
  assert.ok(student.days[0].items.every((item) => item.courseId === A.courseId));

  assert.deepEqual(await titles(A.teacher), ["Tarea publicada", "Repaso en vivo"]);
  assert.deepEqual(await titles(A.teacher2), ["Clase del curso 2"]);
  assert.deepEqual(await titles(A.admin), ["Tarea publicada", "Repaso en vivo", "Clase del curso 2"]);
  assert.deepEqual(await titles(A.coordinator), ["Tarea publicada", "Repaso en vivo", "Clase del curso 2"]);
  assert.deepEqual(await titles(A.student2), []);
  assert.deepEqual(await titles(A.parent), []);

  for (const outsider of [B.admin, B.coordinator, B.teacher, B.teacher2, B.student]) assert.deepEqual(await titles(outsider), [], `agenda de ${outsider.id}`);
  assert.ok((await createLiveClasses(B.teacher, { ...base, title: "Clase de B", courseId: B.courseId }, NOW)).ok);
  assert.deepEqual(await titles(B.admin), ["Clase de B"]);
  assert.deepEqual(await titles(B.student), ["Clase de B"]);
  assert.ok(!(await titles(A.admin)).includes("Clase de B"));
});
