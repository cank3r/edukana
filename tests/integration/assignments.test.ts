import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { resolveEffectiveCapabilities } from "@/lib/capabilities";
import { db } from "@/lib/db";
import {
  assignmentForStudent,
  assignmentRoster,
  dateToLocalInput,
  deleteAssignment,
  dueLabel,
  gradeSubmission,
  listAssignmentsForManager,
  listAssignmentsForStudent,
  localInputToDate,
  saveAssignment,
  setAssignmentPublished,
  submitAssignment,
  type AssignmentManager,
} from "@/server/assessment/assignments";
import type { EdukanaRole } from "@/types/next-auth";
import { A, B, ensureSeed } from "./setup";

const manager = (user: { id: string; institutionId: string; role: EdukanaRole }): AssignmentManager => ({ ...user, capabilities: resolveEffectiveCapabilities(user.role) });
const teacher = manager(A.teacher);
const student = { id: A.student.id, institutionId: A.institutionId };
const student2 = { id: A.student2.id, institutionId: A.institutionId };
/** Estudiante de A sin matrícula en el curso. */
const outsider = { id: "a_suspended", institutionId: A.institutionId };
const NOW = new Date("2026-10-09T15:00:00Z");
const base = { institutionId: A.institutionId, courseId: A.courseId };
const draft = { courseId: A.courseId, title: "Ensayo de prueba", instructions: "Escribe un ensayo de una página.", dueLocal: "2026-12-01T17:00", maxScore: "100", allowLate: false };

let assignmentId = "";

function ok<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result as Extract<T, { ok: true }>;
}
function rejected(result: { ok: boolean; message?: string }, pattern?: RegExp) {
  assert.equal(result.ok, false);
  if (pattern) assert.match(result.message ?? "", pattern);
}

before(async () => {
  await ensureSeed();
  await db.enrollment.create({ data: { id: "it_as_enrollment2", institutionId: A.institutionId, studentId: A.student2.id, courseId: A.courseId, status: "ACTIVE" } });
  await db.gradingPeriod.create({
    data: {
      id: "it_as_period",
      ...base,
      academicPeriodId: "a_period",
      name: "Período de prueba de tareas",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-12-31"),
      categories: { create: { id: "it_as_category", ...base, name: "Asignaciones", weight: 100 } },
    },
  });
});

after(async () => {
  await db.gradingPeriod.deleteMany({ where: { id: "it_as_period" } });
  await db.assignment.deleteMany({ where: { courseId: { in: [A.courseId, B.courseId] }, title: { startsWith: "Ensayo" } } });
  await db.enrollment.deleteMany({ where: { id: "it_as_enrollment2" } });
  await db.auditLog.deleteMany({ where: { action: { in: ["ASSIGNMENT_DELETED", "SUBMISSION_GRADE_CORRECTED"] } } });
  await db.$disconnect();
});

test("fechas: la hora local de la institución se guarda como el instante correcto y se lee igual", () => {
  const date = localInputToDate("2026-12-01T17:00", "America/Santo_Domingo");
  assert.equal(date?.toISOString(), "2026-12-01T21:00:00.000Z");
  assert.equal(dateToLocalInput(date, "America/Santo_Domingo"), "2026-12-01T17:00");
  assert.equal(localInputToDate("2026-07-01T09:30", "Europe/Madrid")?.toISOString(), "2026-07-01T07:30:00.000Z");
  assert.equal(localInputToDate("2026-02-31T10:00", "America/Santo_Domingo"), null);
  assert.equal(localInputToDate("mañana", "America/Santo_Domingo"), null);
});

test("fechas: la fecha límite se dice en palabras", () => {
  const zone = "America/Santo_Domingo";
  assert.equal(dueLabel(null, NOW, zone), "Sin fecha límite");
  assert.match(dueLabel(new Date("2026-10-10T21:00:00Z"), NOW, zone), /^Vence mañana a las 5:00\sp\.\sm\.$/);
  assert.match(dueLabel(new Date("2026-10-09T21:00:00Z"), NOW, zone), /^Vence hoy a las 5:00/);
  assert.equal(dueLabel(new Date("2026-10-07T15:00:00Z"), NOW, zone), "Venció hace 2 días");
  assert.equal(dueLabel(new Date("2026-10-09T12:00:00Z"), NOW, zone), "Venció hace 3 horas");
});

test("docente: crea una tarea en borrador con su columna de notas, la corrige y la publica", async () => {
  rejected(await saveAssignment(teacher, { ...draft, title: "E" }), /título/);
  rejected(await saveAssignment(teacher, { ...draft, maxScore: "0" }), /mayor que cero/);
  rejected(await saveAssignment(teacher, { ...draft, dueLocal: "no-es-fecha" }), /fecha límite/);
  rejected(await saveAssignment(teacher, { ...draft, categoryId: "no_existe" }));

  assignmentId = ok(await saveAssignment(teacher, { ...draft, categoryId: "it_as_category" }, NOW)).assignmentId;
  const created = await db.assignment.findUniqueOrThrow({ where: { id: assignmentId }, include: { gradeItem: true } });
  assert.equal(created.institutionId, A.institutionId);
  assert.equal(created.isPublished, false);
  assert.equal(created.allowLate, false);
  assert.equal(created.dueDate?.toISOString(), "2026-12-01T21:00:00.000Z");
  assert.equal(created.gradeItem?.categoryId, "it_as_category");
  assert.equal(created.gradeItem?.isPublished, false);

  ok(await saveAssignment(teacher, { ...draft, assignmentId, title: "Ensayo corregido", maxScore: "50" }));
  const edited = await db.assignment.findUniqueOrThrow({ where: { id: assignmentId }, include: { gradeItem: true } });
  assert.equal(edited.title, "Ensayo corregido");
  assert.equal(edited.maxScore, 50);
  assert.equal(edited.gradeItem?.title, "Ensayo corregido");
  assert.equal(edited.gradeItem?.maxScore, 50);

  // En borrador el estudiante no la ve ni puede entregar.
  assert.equal(await assignmentForStudent(student, assignmentId, NOW), null);
  assert.equal((await listAssignmentsForStudent(student, A.courseId, NOW))?.assignments.some((item) => item.id === assignmentId), false);
  rejected(await submitAssignment(student, { assignmentId, content: "Antes de tiempo" }, NOW));

  ok(await setAssignmentPublished(teacher, assignmentId, true, NOW));
  const published = await db.assignment.findUniqueOrThrow({ where: { id: assignmentId }, include: { gradeItem: true } });
  assert.equal(published.isPublished, true);
  assert.equal(published.publishedAt?.toISOString(), NOW.toISOString());
  assert.equal(published.gradeItem?.isPublished, true);

  const list = await listAssignmentsForManager(teacher, A.courseId);
  const row = list?.assignments.find((item) => item.id === assignmentId);
  assert.equal(row?.submissionCount, 0);
  assert.equal(row?.toGradeCount, 0);
  assert.equal(row?.countsForGrade, true);
});

test("docente: una tarea sin entregas se borra sin motivo, junto con su columna de notas", async () => {
  const id = ok(await saveAssignment(teacher, { ...draft, title: "Ensayo para borrar", categoryId: "it_as_category" })).assignmentId;
  assert.equal(ok(await deleteAssignment(teacher, { assignmentId: id })).deletedSubmissions, 0);
  assert.equal(await db.assignment.count({ where: { id } }), 0);
  assert.equal(await db.gradeItem.count({ where: { title: "Ensayo para borrar" } }), 0);
});

test("acceso: docente de otro curso, estudiantes y personas de otra institución no gestionan la tarea", async () => {
  const intruders = [manager(A.teacher2), manager(A.student), manager(A.parent), manager(B.teacher), manager(B.admin), manager(B.coordinator)];
  for (const intruder of intruders) {
    rejected(await saveAssignment(intruder, draft));
    rejected(await saveAssignment(intruder, { ...draft, assignmentId, title: "Ensayo ajeno" }));
    rejected(await setAssignmentPublished(intruder, assignmentId, false));
    rejected(await deleteAssignment(intruder, { assignmentId, reason: "No debería poder" }));
    assert.equal(await assignmentRoster(intruder, assignmentId), null);
    assert.equal(await listAssignmentsForManager(intruder, A.courseId), null);
  }
  // Un docente de B tampoco puede crear en su curso apuntando a una categoría de A.
  rejected(await saveAssignment(manager(B.teacher), { ...draft, courseId: B.courseId, categoryId: "it_as_category" }));
  const untouched = await db.assignment.findUniqueOrThrow({ where: { id: assignmentId } });
  assert.equal(untouched.title, "Ensayo corregido");
  assert.equal(untouched.isPublished, true);
  // La coordinación de A sí ve todos los cursos de su institución.
  assert.ok(await listAssignmentsForManager(manager(A.coordinator), A.courseId));
});

test("estudiante: entrega con texto y enlace https, y al reenviar queda guardada la versión anterior", async () => {
  rejected(await submitAssignment(student, { assignmentId, content: "  ", link: "" }, NOW), /respuesta o pega un enlace/);
  rejected(await submitAssignment(student, { assignmentId, content: "Texto", link: "http://sin-candado.test/doc" }, NOW), /https/);
  rejected(await submitAssignment(student, { assignmentId, content: "Texto", link: "javascript:alert(1)" }, NOW), /https/);

  const first = ok(await submitAssignment(student, { assignmentId, content: "Primera versión", link: "https://docs.ejemplo.test/ensayo" }, NOW));
  assert.equal(first.resubmitted, false);
  assert.equal(first.late, false);
  const saved = await db.submission.findUniqueOrThrow({ where: { assignmentId_studentId: { assignmentId, studentId: student.id } } });
  assert.equal(saved.institutionId, A.institutionId);
  assert.equal(saved.enrollmentId, "a_enrollment");
  assert.equal(saved.status, "SUBMITTED");
  assert.deepEqual(saved.fileUrls, ["https://docs.ejemplo.test/ensayo"]);
  assert.equal(await db.submissionRevision.count({ where: { submissionId: saved.id } }), 0);

  const later = new Date(NOW.getTime() + 60_000);
  assert.equal(ok(await submitAssignment(student, { assignmentId, content: "Segunda versión" }, later)).resubmitted, true);
  const revisions = await db.submissionRevision.findMany({ where: { submissionId: saved.id } });
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].content, "Primera versión");
  assert.equal(revisions[0].submittedAt.toISOString(), NOW.toISOString());
  const view = await assignmentForStudent(student, assignmentId, later);
  assert.equal(view?.submission?.content, "Segunda versión");
  assert.equal(view?.submission?.link, "");
  assert.equal(view?.submission?.previousVersions, 1);
  assert.equal(view?.canSubmit, true);
  assert.equal((await listAssignmentsForStudent(student, A.courseId, later))?.assignments.find((item) => item.id === assignmentId)?.group, "Entregadas");
});

test("estudiante: no ve la entrega de otro, y quien no está inscrito o es de otra institución no entra", async () => {
  const other = await assignmentForStudent(student2, assignmentId, NOW);
  assert.ok(other);
  assert.equal(other.submission, null);
  assert.equal((await listAssignmentsForStudent(student2, A.courseId, NOW))?.assignments.find((item) => item.id === assignmentId)?.group, "Pendientes");
  // Un estudiante tampoco llega a las entregas por la vista del docente.
  assert.equal(await assignmentRoster(manager(A.student2), assignmentId), null);
  const submission = await db.submission.findFirstOrThrow({ where: { assignmentId, studentId: student.id } });
  rejected(await gradeSubmission(manager(A.student2), { submissionId: submission.id, score: 50 }));

  for (const stranger of [outsider, { id: B.student.id, institutionId: B.institutionId }, { id: A.student.id, institutionId: B.institutionId }]) {
    assert.equal(await assignmentForStudent(stranger, assignmentId, NOW), null);
    assert.equal(await listAssignmentsForStudent(stranger, A.courseId, NOW), null);
    rejected(await submitAssignment(stranger, { assignmentId, content: "No debería entrar" }, NOW));
  }
  assert.equal(await db.submission.count({ where: { assignmentId } }), 1);
});

test("estudiante: después de la fecha límite solo entrega si la tarea acepta entregas tarde", async () => {
  const afterDue = new Date("2026-12-02T00:00:00Z");
  rejected(await submitAssignment(student2, { assignmentId, content: "Llegué tarde" }, afterDue), /fecha límite/);
  assert.equal((await assignmentForStudent(student2, assignmentId, afterDue))?.canSubmit, false);

  ok(await saveAssignment(teacher, { ...draft, assignmentId, title: "Ensayo corregido", maxScore: "50", allowLate: true }));
  assert.equal(ok(await submitAssignment(student2, { assignmentId, link: "https://docs.ejemplo.test/tarde" }, afterDue)).late, true);
  const roster = await assignmentRoster(teacher, assignmentId);
  assert.deepEqual(roster?.students.map((row) => [row.studentId, row.state]).sort(), [[A.student.id, "Entregada"], [A.student2.id, "Tarde"]]);
  assert.equal(roster?.waiting.length, 2);
  assert.deepEqual(roster?.students.find((row) => row.studentId === A.student2.id)?.submission?.links, ["https://docs.ejemplo.test/tarde"]);
});

test("calificar: valida el rango, crea la nota en el libro y el estudiante ve nota y comentario", async () => {
  const submission = await db.submission.findFirstOrThrow({ where: { assignmentId, studentId: student.id } });
  for (const score of ["-1", "50.5", "abc", ""]) rejected(await gradeSubmission(teacher, { submissionId: submission.id, score }), /entre 0 y 50/);
  for (const intruder of [manager(A.teacher2), manager(B.teacher), manager(B.admin)]) rejected(await gradeSubmission(intruder, { submissionId: submission.id, score: 10 }));
  assert.equal((await db.submission.findUniqueOrThrow({ where: { id: submission.id } })).status, "SUBMITTED");

  assert.equal(ok(await gradeSubmission(teacher, { submissionId: submission.id, score: "40", feedback: "Buen trabajo" }, NOW)).corrected, false);
  const graded = await db.submission.findUniqueOrThrow({ where: { id: submission.id } });
  assert.equal(graded.status, "GRADED");
  assert.equal(graded.score, 40);
  const entry = await db.gradeEntry.findFirstOrThrow({ where: { gradeItem: { assignmentId }, enrollmentId: "a_enrollment" } });
  assert.equal(entry.score, 40);
  assert.equal(entry.gradedById, A.teacher.id);
  assert.equal(entry.institutionId, A.institutionId);

  const view = await assignmentForStudent(student, assignmentId, NOW);
  assert.equal(view?.submission?.score, 40);
  assert.equal(view?.submission?.feedback, "Buen trabajo");
  assert.equal(view?.canSubmit, false);
  rejected(await submitAssignment(student, { assignmentId, content: "Otra versión" }, NOW), /ya calificó/);
  assert.equal((await listAssignmentsForStudent(student, A.courseId, NOW))?.assignments.find((item) => item.id === assignmentId)?.group, "Calificadas");
  // El otro estudiante sigue sin ver nada ajeno.
  assert.equal((await assignmentForStudent(student2, assignmentId, NOW))?.submission?.score, null);

  const roster = await assignmentRoster(teacher, assignmentId);
  assert.equal(roster?.students.find((row) => row.studentId === A.student.id)?.state, "Calificada");
  assert.equal(roster?.waiting.length, 1);
  rejected(await saveAssignment(teacher, { ...draft, assignmentId, title: "Ensayo corregido", maxScore: "30", allowLate: true }), /puntaje máximo/);
});

test("corregir una nota: sin motivo se rechaza y con motivo queda en el historial", async () => {
  const submission = await db.submission.findFirstOrThrow({ where: { assignmentId, studentId: student.id } });
  rejected(await gradeSubmission(teacher, { submissionId: submission.id, score: "45", feedback: "Buen trabajo" }), /motivo/);
  assert.equal((await db.submission.findUniqueOrThrow({ where: { id: submission.id } })).score, 40);

  assert.equal(ok(await gradeSubmission(teacher, { submissionId: submission.id, score: "45", feedback: "Buen trabajo", reason: "Error al sumar" })).corrected, true);
  const revisions = await db.gradeEntryRevision.findMany({ where: { gradeEntry: { gradeItem: { assignmentId } } } });
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].previousScore, 40);
  assert.equal(revisions[0].newScore, 45);
  assert.equal(revisions[0].reason, "Error al sumar");
  assert.equal(revisions[0].actorId, A.teacher.id);
  assert.equal(await db.auditLog.count({ where: { action: "SUBMISSION_GRADE_CORRECTED", entityId: submission.id, institutionId: A.institutionId } }), 1);

  // Con el período publicado, hasta cambiar solo el comentario exige motivo, y sin él nada cambia.
  await db.gradingPeriod.update({ where: { id: "it_as_period" }, data: { isPublished: true, publishedAt: new Date() } });
  rejected(await gradeSubmission(teacher, { submissionId: submission.id, score: "45", feedback: "Comentario nuevo" }), /motivo/);
  assert.equal((await db.submission.findUniqueOrThrow({ where: { id: submission.id } })).feedback, "Buen trabajo");
});

test("borrar con entregas: se bloquea con notas publicadas, exige motivo y dice cuántas se pierden", async () => {
  const row = (await listAssignmentsForManager(teacher, A.courseId))?.assignments.find((item) => item.id === assignmentId);
  assert.equal(row?.submissionCount, 2);
  assert.equal(row?.gradedCount, 1);
  assert.equal(row?.deleteBlocked, true);
  rejected(await deleteAssignment(teacher, { assignmentId, reason: "Se creó por error" }), /ocultarla/);

  // Ocultar conserva entregas y notas, y el estudiante deja de verla.
  ok(await setAssignmentPublished(teacher, assignmentId, false));
  assert.equal(await assignmentForStudent(student, assignmentId, NOW), null);
  assert.equal(await db.submission.count({ where: { assignmentId } }), 2);

  await db.gradingPeriod.update({ where: { id: "it_as_period" }, data: { isPublished: false } });
  rejected(await deleteAssignment(teacher, { assignmentId }), /motivo/);
  assert.equal(await db.assignment.count({ where: { id: assignmentId } }), 1);

  assert.equal(ok(await deleteAssignment(teacher, { assignmentId, reason: "Se creó por error" })).deletedSubmissions, 2);
  assert.equal(await db.assignment.count({ where: { id: assignmentId } }), 0);
  assert.equal(await db.submission.count({ where: { assignmentId } }), 0);
  assert.equal(await db.gradeItem.count({ where: { categoryId: "it_as_category" } }), 0);
  assert.equal(await db.gradeEntryRevision.count({ where: { reason: "Error al sumar" } }), 0);
  const log = await db.auditLog.findFirstOrThrow({ where: { action: "ASSIGNMENT_DELETED", entityId: assignmentId } });
  assert.equal(log.userId, A.teacher.id);
  assert.equal((log.changes as unknown as { reason: string; submissions: number }).reason, "Se creó por error");
  assert.equal((log.changes as unknown as { reason: string; submissions: number }).submissions, 2);
});
