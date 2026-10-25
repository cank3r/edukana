import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import {
  attendanceCsv,
  attendancePercent,
  csvCell,
  deleteAttendanceSession,
  getAttendanceOverview,
  getAttendanceSheet,
  getMyAttendance,
  saveAttendance,
} from "@/server/courses/attendance";
import { A, B, ensureSeed } from "./setup";

// Mediodía en UTC: en la zona de la institución (América) sigue siendo el mismo día.
const NOW = new Date("2026-10-07T16:00:00.000Z");
const TODAY = "2026-10-07";
const EXTRA = "at_student"; // estudiante de A inscrito en el curso solo durante esta prueba
const AUDITED = ["ATTENDANCE_TAKEN", "ATTENDANCE_CORRECTED", "ATTENDANCE_DELETED"];
const s1 = A.student.id;
const sessionsIn = (courseId: string) => db.attendanceSession.count({ where: { courseId } });

async function cleanup() {
  await db.auditLog.deleteMany({ where: { action: { in: AUDITED } } });
  await db.attendanceSession.deleteMany({ where: { courseId: { in: [A.courseId, A.course2Id, B.courseId] } } });
  await db.liveClass.deleteMany({ where: { id: "at_class" } });
  await db.enrollment.deleteMany({ where: { studentId: EXTRA } });
  await db.user.deleteMany({ where: { id: EXTRA } });
  await db.course.updateMany({ where: { id: A.courseId }, data: { isPublished: true, archivedAt: null } });
  await db.enrollment.update({ where: { id: "a_enrollment" }, data: { status: "ACTIVE", withdrawnAt: null, withdrawReason: null } });
}

before(async () => {
  await ensureSeed();
  await cleanup();
  await db.user.create({ data: { id: EXTRA, institutionId: A.institutionId, name: "=Prueba, \"Asistencia\"", email: "at_student@a.test", role: "STUDENT", status: "ACTIVE" } });
  await db.enrollment.create({ data: { id: "at_enrollment", institutionId: A.institutionId, studentId: EXTRA, courseId: A.courseId, status: "ACTIVE" } });
});
after(async () => {
  await cleanup();
  await db.$disconnect();
});

const everyone = (status: string, extraStatus = status) => [
  { studentId: s1, status },
  { studentId: EXTRA, status: extraStatus, note: "  avisó  " },
];

test("la hoja del día trae a los inscritos en Presente y ofrece la clase en vivo como título", async () => {
  await db.liveClass.create({
    data: { id: "at_class", institutionId: A.institutionId, courseId: A.courseId, title: "Clase de repaso", startsAt: NOW, joinUrl: "https://example.test/clase", createdById: A.teacher.id },
  });
  const sheet = await getAttendanceSheet(A.teacher, A.courseId, undefined, NOW);
  assert.ok(sheet);
  assert.equal(sheet.date, TODAY);
  assert.equal(sheet.session, null);
  assert.deepEqual(sheet.classTitles, ["Clase de repaso"]);
  assert.deepEqual(sheet.rows.map((row) => row.status), ["PRESENT", "PRESENT"]);
  assert.deepEqual(sheet.rows.map((row) => row.studentId).sort(), [EXTRA, s1].sort());

  assert.equal((await getAttendanceSheet(A.teacher, A.courseId, "2026-10-06", NOW))?.classTitles.length, 0, "otro día no ofrece esa clase");
  assert.equal((await getAttendanceSheet(A.teacher, A.courseId, "2030-01-01", NOW))?.date, TODAY, "una fecha futura se cambia por hoy");
});

test("guardar y corregir la misma fecha no duplica", async () => {
  const first = await saveAttendance(A.teacher, A.courseId, { date: TODAY, title: "Clase de repaso", entries: everyone("PRESENT", "ABSENT") }, NOW);
  assert.deepEqual(first.ok && first.counts, { present: 1, absent: 1, late: 0, excused: 0 });
  assert.equal(first.ok && first.created, true);

  const second = await saveAttendance(A.admin, A.courseId, { date: TODAY, title: "", entries: everyone("PRESENT", "LATE") }, NOW);
  assert.equal(second.ok && second.created, false);
  assert.equal(second.ok && first.ok && second.sessionId === first.sessionId, true);

  assert.equal(await sessionsIn(A.courseId), 1);
  const records = await db.attendance.findMany({ where: { courseId: A.courseId }, include: { enrollment: true } });
  assert.equal(records.length, 2);
  assert.ok(records.every((record) => record.institutionId === A.institutionId));
  const extra = records.find((record) => record.enrollment.studentId === EXTRA);
  assert.equal(extra?.status, "LATE");
  assert.equal(extra?.notes, "avisó");
  assert.equal(records.find((record) => record.enrollment.studentId === s1)?.notes, null, "un presente no guarda nota");

  assert.equal(await db.auditLog.count({ where: { action: "ATTENDANCE_TAKEN", entityId: first.ok ? first.sessionId : "" } }), 1, "una fila por sesión guardada");
  assert.equal(await db.auditLog.count({ where: { action: "ATTENDANCE_CORRECTED", entityId: first.ok ? first.sessionId : "" } }), 1);

  const sheet = await getAttendanceSheet(A.teacher, A.courseId, TODAY, NOW);
  assert.ok(sheet?.session, "la fecha ya guardada se abre para corregirla");
  assert.equal(sheet.rows.find((row) => row.studentId === EXTRA)?.status, "LATE");
});

test("un estudiante no inscrito o de otra institución se rechaza y no se guarda nada", async () => {
  for (const outsider of [A.student2.id, B.student.id, "no-existe"]) {
    const result = await saveAttendance(A.teacher, A.courseId, { date: "2026-10-06", entries: [{ studentId: s1, status: "ABSENT" }, { studentId: outsider, status: "PRESENT" }] }, NOW);
    assert.equal(result.ok, false, outsider);
  }
  assert.equal(await sessionsIn(A.courseId), 1, "ninguna sesión nueva");
  assert.equal(await db.attendance.count({ where: { courseId: A.courseId } }), 2);

  const invalid = await saveAttendance(A.teacher, A.courseId, { date: "2026-10-06", entries: [{ studentId: s1, status: "DORMIDO" }] }, NOW);
  assert.equal(invalid.ok, false);
  const repeated = await saveAttendance(A.teacher, A.courseId, { date: "2026-10-06", entries: [{ studentId: s1, status: "PRESENT" }, { studentId: s1, status: "ABSENT" }] }, NOW);
  assert.equal(repeated.ok, false);
  assert.equal((await saveAttendance(A.teacher, A.courseId, { date: "2026-10-06", entries: [] }, NOW)).ok, false);
});

test("docente ajeno, otra institución y roles sin permiso: rechazados", async () => {
  const entries = [{ studentId: s1, status: "ABSENT" }];
  for (const actor of [A.teacher2, B.teacher, B.admin, A.student, A.parent]) {
    assert.equal((await saveAttendance(actor, A.courseId, { date: "2026-10-05", entries }, NOW)).ok, false, actor.id);
    assert.equal(await getAttendanceSheet(actor, A.courseId, TODAY, NOW), null, actor.id);
    assert.equal(await getAttendanceOverview(actor, A.courseId), null, actor.id);
    assert.equal(await attendanceCsv(actor, A.courseId), null, actor.id);
  }
  const session = await db.attendanceSession.findFirstOrThrow({ where: { courseId: A.courseId } });
  for (const actor of [A.teacher2, B.teacher, B.admin, A.student]) {
    assert.equal((await deleteAttendanceSession(actor, A.courseId, session.id)).ok, false, actor.id);
  }
  assert.equal(await sessionsIn(A.courseId), 1);
  assert.equal((await deleteAttendanceSession(B.teacher, B.courseId, session.id)).ok, false, "no se borra una sesión de otro curso");
  assert.equal(await sessionsIn(A.courseId), 1);
});

test("fecha futura o inválida rechazada", async () => {
  const entries = [{ studentId: s1, status: "PRESENT" }];
  const future = await saveAttendance(A.teacher, A.courseId, { date: "2026-10-08", entries }, NOW);
  assert.equal(future.ok, false);
  assert.match(future.ok ? "" : future.message, /todavía no llega/);
  for (const date of ["", "ayer", "2026-02-31", "2026-13-01"]) {
    assert.equal((await saveAttendance(A.teacher, A.courseId, { date, entries }, NOW)).ok, false, date);
  }
  assert.equal(await sessionsIn(A.courseId), 1);
});

test("porcentajes: la tardanza cuenta como asistencia y la justificada no suma ni resta", async () => {
  assert.equal(attendancePercent({ present: 3, absent: 1, late: 0, excused: 1 }), 75);
  assert.equal(attendancePercent({ present: 0, absent: 0, late: 0, excused: 2 }), null);
  assert.equal(attendancePercent({ present: 0, absent: 0, late: 0, excused: 0 }), null);
  assert.equal(attendancePercent({ present: 1, absent: 1, late: 2, excused: 0 }), 75);

  // Con el 7 (s1 presente, extra tarde): s1 queda P, A, J, J → 1 de 2; extra queda T, P, A, A → 2 de 4.
  const days: Array<[string, string, string]> = [
    ["2026-10-06", "ABSENT", "PRESENT"],
    ["2026-10-05", "EXCUSED", "ABSENT"],
    ["2026-10-02", "EXCUSED", "ABSENT"],
  ];
  for (const [date, mine, extra] of days) {
    assert.equal((await saveAttendance(A.teacher, A.courseId, { date, entries: everyone(mine, extra) }, NOW)).ok, true, date);
  }

  const overview = await getAttendanceOverview(A.teacher, A.courseId);
  assert.ok(overview);
  assert.deepEqual(overview.sessions.map((session) => session.date), ["2026-10-07", "2026-10-06", "2026-10-05", "2026-10-02"]);
  assert.deepEqual(
    overview.sessions.map((session) => [session.present, session.absent, session.late, session.excused, session.total]),
    [[1, 0, 1, 0, 2], [1, 1, 0, 0, 2], [0, 1, 0, 1, 2], [0, 1, 0, 1, 2]],
  );
  const mine = overview.students.find((student) => student.studentId === s1);
  assert.deepEqual([mine?.percent, mine?.absent, mine?.late, mine?.excused, mine?.recorded, mine?.low], [50, 1, 0, 2, 4, true]);
  const extra = overview.students.find((student) => student.studentId === EXTRA);
  assert.deepEqual([extra?.percent, extra?.absent, extra?.late, extra?.low], [50, 2, 1, true]);
});

test("el estudiante solo ve lo suyo", async () => {
  const mine = await getMyAttendance(A.student, A.courseId);
  assert.ok(mine);
  assert.equal(mine.percent, 50);
  assert.deepEqual(mine.counts, { present: 1, absent: 1, late: 0, excused: 2 });
  assert.deepEqual(mine.days.map((day) => [day.date, day.status]), [["2026-10-07", "PRESENT"], ["2026-10-06", "ABSENT"], ["2026-10-05", "EXCUSED"], ["2026-10-02", "EXCUSED"]]);
  assert.equal(JSON.stringify(mine).includes("avisó"), false, "no recibe notas ni datos de otros");

  assert.equal(await getMyAttendance(A.student2, A.courseId), null, "sin inscripción no ve nada");
  assert.equal(await getMyAttendance(B.student, A.courseId), null);
  assert.equal(await getMyAttendance(A.teacher, A.courseId), null);

  await db.course.update({ where: { id: A.courseId }, data: { isPublished: false } });
  assert.equal(await getMyAttendance(A.student, A.courseId), null, "curso sin publicar");
  await db.course.update({ where: { id: A.courseId }, data: { isPublished: true } });
  await db.enrollment.update({ where: { id: "a_enrollment" }, data: { status: "DROPPED" } });
  assert.equal(await getMyAttendance(A.student, A.courseId), null, "retirado ya no ve el curso");
  await db.enrollment.update({ where: { id: "a_enrollment" }, data: { status: "ACTIVE" } });
});

test("CSV: BOM, comas y comillas escapadas, y celdas que parecen fórmula neutralizadas", async () => {
  assert.equal(csvCell("=1+1"), "'=1+1");
  assert.equal(csvCell("+34"), "'+34");
  assert.equal(csvCell("-2"), "'-2");
  assert.equal(csvCell("@algo"), "'@algo");
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell(50), "50");

  const csv = await attendanceCsv(A.teacher, A.courseId);
  assert.ok(csv);
  assert.match(csv.filename, /^asistencia-[a-z0-9-]+\.csv$/);
  assert.equal(csv.content.charCodeAt(0), 0xfeff);
  const lines = csv.content.slice(1).trim().split("\r\n");
  assert.equal(lines[0], "Estudiante,Correo,Días registrados,Presente,Tarde,Ausente,Justificado,% de asistencia");
  assert.equal(lines.length, 3);
  assert.ok(lines.includes(`"'=Prueba, ""Asistencia""",at_student@a.test,4,1,1,2,0,50`));
});

test("quien se retiró conserva su registro; borrar una sesión quita solo ese día", async () => {
  await db.enrollment.update({ where: { id: "at_enrollment" }, data: { status: "DROPPED" } });
  const old = await getAttendanceSheet(A.teacher, A.courseId, "2026-10-06", NOW);
  assert.equal(old?.rows.find((row) => row.studentId === EXTRA)?.withdrawn, true, "sigue en la hoja del día que ya tenía");
  assert.equal((await saveAttendance(A.teacher, A.courseId, { date: "2026-10-06", entries: everyone("ABSENT", "EXCUSED") }, NOW)).ok, true, "se puede corregir su registro");
  assert.equal((await getAttendanceSheet(A.teacher, A.courseId, "2026-10-01", NOW))?.rows.length, 1, "no aparece en un día nuevo");
  assert.equal((await saveAttendance(A.teacher, A.courseId, { date: "2026-10-01", entries: everyone("PRESENT") }, NOW)).ok, false, "ni se le puede registrar un día nuevo");

  const session = await db.attendanceSession.findFirstOrThrow({ where: { courseId: A.courseId, date: new Date("2026-10-06T00:00:00.000Z") } });
  assert.deepEqual(await deleteAttendanceSession(A.teacher, A.courseId, session.id), { ok: true });
  assert.equal(await sessionsIn(A.courseId), 3);
  assert.equal(await db.attendance.count({ where: { sessionId: session.id } }), 0);
  assert.equal(await db.auditLog.count({ where: { action: "ATTENDANCE_DELETED", entityId: session.id } }), 1);
  assert.equal((await deleteAttendanceSession(A.teacher, A.courseId, session.id)).ok, false, "ya no existe");

  await db.course.update({ where: { id: A.courseId }, data: { archivedAt: new Date() } });
  assert.equal((await saveAttendance(A.teacher, A.courseId, { date: TODAY, entries: [{ studentId: s1, status: "ABSENT" }] }, NOW)).ok, false, "curso archivado");
});
