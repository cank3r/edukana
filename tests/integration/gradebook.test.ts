import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import {
  createManualItem,
  deleteManualItem,
  gradebookCsv,
  loadGradeCell,
  loadGradebook,
  loadMyGrades,
  saveCategories,
  saveGrade,
  setItemPublished,
  setupSimpleGrading,
  updateManualItem,
} from "@/server/assessment/gradebook";
import { A, B, ensureSeed } from "./setup";

const ENROLLMENT_1 = "a_enrollment"; // a_student, de la semilla
const ENROLLMENT_2 = "it_gb_enrollment2"; // a_student2, creada aquí
const TRICKY_TITLE = '=Suma, "final"';
const scope = { institutionId: A.institutionId, courseId: A.courseId };

let categoryId = "";
let periodId = "";
let itemId = "";

async function cleanup() {
  await db.gradingPeriod.deleteMany({ where: { courseId: { in: [A.courseId, B.courseId] } } });
  await db.assignment.deleteMany({ where: { id: "it_gb_assignment" } });
  await db.enrollment.deleteMany({ where: { id: ENROLLMENT_2 } });
  await db.user.update({ where: { id: A.student2.id }, data: { name: "student2 A" } });
}

before(async () => {
  await ensureSeed();
  await cleanup();
  await db.enrollment.create({ data: { id: ENROLLMENT_2, institutionId: A.institutionId, studentId: A.student2.id, courseId: A.courseId, status: "ACTIVE" } });
});

after(async () => {
  await cleanup();
  await db.$disconnect();
});

test("libro: solo quien gestiona el curso puede prepararlo; la configuración sencilla crea «General» al 100 %", async () => {
  for (const outsider of [A.teacher2, A.student, A.parent, B.teacher, B.admin]) {
    assert.equal((await setupSimpleGrading(outsider, A.courseId)).ok, false);
    assert.equal(await loadGradebook(outsider, A.courseId), null);
  }
  assert.equal(await db.gradingPeriod.count({ where: scope }), 0);

  assert.equal((await setupSimpleGrading(A.teacher, A.courseId)).ok, true);
  const periods = await db.gradingPeriod.findMany({ where: scope, include: { categories: true } });
  assert.equal(periods.length, 1);
  assert.deepEqual(periods[0].categories.map((category) => [category.name, category.weight]), [["General", 100]]);
  assert.equal(periods[0].academicPeriodId, "a_period");
  periodId = periods[0].id;
  categoryId = periods[0].categories[0].id;

  assert.equal((await setupSimpleGrading(A.teacher, A.courseId)).ok, false, "no se duplica");
  assert.equal(await db.gradingPeriod.count({ where: scope }), 1);
});

test("actividad manual: nace visible salvo que se pida oculta, y ni un docente ajeno ni otra institución pueden crearla", async () => {
  const input = { courseId: A.courseId, title: TRICKY_TITLE, maxScore: 10, categoryId };
  for (const outsider of [A.teacher2, A.student, B.teacher, B.coordinator]) {
    assert.equal((await createManualItem(outsider, input)).ok, false);
  }
  assert.equal((await createManualItem(A.teacher, { ...input, maxScore: 0 })).ok, false);
  assert.equal((await createManualItem(A.teacher, { ...input, categoryId: "no_existe" })).ok, false);
  assert.equal(await db.gradeItem.count({ where: scope }), 0);

  assert.equal((await createManualItem(A.teacher, input)).ok, true);
  const item = await db.gradeItem.findFirstOrThrow({ where: scope });
  assert.equal(item.isPublished, true, "por omisión el estudiante ve la nota");
  // El resto de las pruebas parte de la actividad oculta.
  assert.equal((await setItemPublished(A.teacher, item.id, false)).ok, true);
  assert.equal(item.gradingPeriodId, periodId);
  assert.equal(item.institutionId, A.institutionId);
  itemId = item.id;
});

test("nota: se pone dentro del rango y solo por quien gestiona el curso", async () => {
  const grade = { gradeItemId: itemId, enrollmentId: ENROLLMENT_1, score: 7 };
  for (const outsider of [A.teacher2, A.student, B.teacher, B.admin]) {
    assert.equal((await saveGrade(outsider, grade)).ok, false);
    assert.equal(await loadGradeCell(outsider, itemId, ENROLLMENT_1), null);
  }
  assert.equal((await saveGrade(A.teacher, { ...grade, score: 11 })).ok, false, "mayor que el máximo");
  assert.equal((await saveGrade(A.teacher, { ...grade, score: -1 })).ok, false);
  assert.equal((await saveGrade(A.teacher, { ...grade, score: null })).ok, false, "ni nota ni exonerado");
  assert.equal((await saveGrade(A.teacher, { ...grade, enrollmentId: "b_enrollment" })).ok, false, "matrícula de otra institución");
  assert.equal(await db.gradeEntry.count({ where: { gradeItemId: itemId } }), 0);

  assert.equal((await saveGrade(A.teacher, { ...grade, feedback: "Buen trabajo" })).ok, true);
  const entry = await db.gradeEntry.findFirstOrThrow({ where: { gradeItemId: itemId, enrollmentId: ENROLLMENT_1 } });
  assert.equal(entry.score, 7);
  assert.equal(entry.gradedById, A.teacher.id);
  assert.equal(entry.institutionId, A.institutionId);
  assert.equal(await db.gradeEntryRevision.count({ where: { gradeEntryId: entry.id } }), 0);
});

test("nota: corregirla exige el motivo y deja la revisión con quién, cuándo, de cuánto a cuánto y por qué", async () => {
  const grade = { gradeItemId: itemId, enrollmentId: ENROLLMENT_1, score: 9, feedback: "Buen trabajo" };
  const withoutReason = await saveGrade(A.teacher, grade);
  assert.equal(withoutReason.ok, false);
  assert.match(withoutReason.message, /motivo/);
  assert.equal((await saveGrade(A.teacher, { ...grade, reason: "   " })).ok, false);
  assert.equal((await db.gradeEntry.findFirstOrThrow({ where: { gradeItemId: itemId, enrollmentId: ENROLLMENT_1 } })).score, 7);

  const when = new Date("2026-10-09T15:00:00Z");
  assert.equal((await saveGrade(A.coordinator, { ...grade, reason: "Error al sumar" }, when)).ok, true, "la coordinación también gestiona el curso");
  const cell = await loadGradeCell(A.teacher, itemId, ENROLLMENT_1);
  assert.equal(cell?.entry?.score, 9);
  assert.equal(cell?.history.length, 1);
  assert.deepEqual(
    { from: cell?.history[0].from, to: cell?.history[0].to, reason: cell?.history[0].reason, who: cell?.history[0].who, when: cell?.history[0].when.toISOString() },
    { from: 7, to: 9, reason: "Error al sumar", who: "coord A", when: when.toISOString() },
  );
  const revision = await db.gradeEntryRevision.findFirstOrThrow({ where: { gradeEntry: { gradeItemId: itemId } } });
  assert.equal(revision.actorId, A.coordinator.id);
  assert.equal(revision.institutionId, A.institutionId);

  // Repetir la misma nota no genera otra revisión ni pide motivo.
  assert.equal((await saveGrade(A.teacher, grade)).ok, true);
  assert.equal(await db.gradeEntryRevision.count({ where: { gradeEntry: { gradeItemId: itemId } } }), 1);
});

test("exonerado: no cuenta en el promedio y se puede quitar", async () => {
  const cellKey = { gradeItemId: itemId, enrollmentId: ENROLLMENT_2 };
  assert.equal((await saveGrade(A.teacher, { ...cellKey, score: null, isExcused: true })).ok, true);
  let book = await loadGradebook(A.teacher, A.courseId);
  const row = (enrollmentId: string) => book?.students.find((student) => student.enrollmentId === enrollmentId);
  assert.equal(row(ENROLLMENT_2)?.cells[itemId].isExcused, true);
  assert.equal(row(ENROLLMENT_2)?.average, null);
  assert.equal(row(ENROLLMENT_1)?.average, 90);
  assert.equal(book?.students.length, 2);
  assert.equal(book?.items[0].gradedCount, 2);

  assert.equal((await saveGrade(A.teacher, { ...cellKey, score: null, isExcused: false })).ok, true);
  assert.equal(await db.gradeEntry.count({ where: cellKey }), 0);
  assert.equal((await saveGrade(A.teacher, { ...cellKey, score: 5, isExcused: true, feedback: "Solo de ella" })).ok, true);
  book = await loadGradebook(A.teacher, A.courseId);
  assert.equal(row(ENROLLMENT_2)?.average, null, "con nota pero exonerada tampoco cuenta");
  assert.equal((await saveGrade(A.teacher, { ...cellKey, score: 5, feedback: "Solo de ella" })).ok, true);
  book = await loadGradebook(A.teacher, A.courseId);
  assert.equal(row(ENROLLMENT_2)?.average, 50);
});

test("mis notas: el estudiante solo ve lo publicado y solo lo suyo", async () => {
  // Nada publicado todavía.
  const hidden = await loadMyGrades(A.student, A.courseId);
  assert.deepEqual({ groups: hidden?.groups, average: hidden?.average, pending: hidden?.pending }, { groups: [], average: null, pending: [] });

  // Una segunda actividad se queda oculta.
  await createManualItem(A.teacher, { courseId: A.courseId, title: "Zeta oculta", maxScore: 100, categoryId, isPublished: false });
  const hiddenItem = await db.gradeItem.findFirstOrThrow({ where: { ...scope, title: "Zeta oculta" } });
  await saveGrade(A.teacher, { gradeItemId: hiddenItem.id, enrollmentId: ENROLLMENT_1, score: 0 });

  for (const outsider of [A.teacher2, A.student, B.teacher]) assert.equal((await setItemPublished(outsider, itemId, true)).ok, false);
  assert.equal((await setItemPublished(A.teacher, itemId, true)).ok, true);

  const mine = await loadMyGrades(A.student, A.courseId);
  assert.equal(mine?.groups.length, 1);
  assert.deepEqual(mine?.groups[0].items, [{ id: itemId, title: TRICKY_TITLE, maxScore: 10, score: 9, isExcused: false, feedback: "Buen trabajo" }]);
  assert.equal(mine?.average, 90, "la actividad oculta (0 de 100) no entra en lo que ve el estudiante");
  assert.equal(JSON.stringify(mine).includes("Solo de ella"), false);
  assert.equal(JSON.stringify(mine).includes("Zeta oculta"), false);

  const other = await loadMyGrades(A.student2, A.courseId);
  assert.equal(other?.groups[0].items[0].score, 5);
  assert.equal(other?.groups[0].items[0].feedback, "Solo de ella");
  assert.equal(other?.average, 50);

  // Publicada pero sin nota: aparece como pendiente.
  await saveGrade(A.teacher, { gradeItemId: hiddenItem.id, enrollmentId: ENROLLMENT_1, score: 0, isExcused: true });
  await setItemPublished(A.teacher, hiddenItem.id, true);
  assert.deepEqual((await loadMyGrades(A.student2, A.courseId))?.pending.map((item) => item.title), ["Zeta oculta"]);
  assert.deepEqual((await loadMyGrades(A.student, A.courseId))?.pending, [], "exonerado no es pendiente");
  await setItemPublished(A.teacher, hiddenItem.id, false);

  // Sin matrícula en el curso, con otro rol o desde otra institución: nada.
  assert.equal(await loadMyGrades(A.student, A.course2Id), null);
  assert.equal(await loadMyGrades(B.student, A.courseId), null);
  assert.equal(await loadMyGrades(A.teacher, A.courseId), null);
  assert.equal(await loadMyGrades(A.parent, A.courseId), null);
  assert.equal(await loadMyGrades({ ...A.student, institutionId: B.institutionId }, A.courseId), null);

  // Quien se retiró deja de ver sus notas.
  await db.enrollment.update({ where: { id: ENROLLMENT_2 }, data: { status: "DROPPED" } });
  assert.equal(await loadMyGrades(A.student2, A.courseId), null);
  await db.enrollment.update({ where: { id: ENROLLMENT_2 }, data: { status: "COMPLETED" } });
  assert.equal((await loadMyGrades(A.student2, A.courseId))?.average, 50);
  await db.enrollment.update({ where: { id: ENROLLMENT_2 }, data: { status: "ACTIVE" } });
});

test("período publicado: hasta cambiar solo el comentario exige motivo", async () => {
  await db.gradingPeriod.update({ where: { id: periodId }, data: { isPublished: true, publishedAt: new Date() } });
  const grade = { gradeItemId: itemId, enrollmentId: ENROLLMENT_1, score: 9, feedback: "Comentario nuevo" };
  assert.equal((await saveGrade(A.teacher, grade)).ok, false);
  assert.equal((await saveGrade(A.teacher, { ...grade, reason: "Aclaración" })).ok, true);
  assert.equal(await db.gradeEntryRevision.count({ where: { gradeEntry: { gradeItemId: itemId, enrollmentId: ENROLLMENT_1 } } }), 2);
  await db.gradingPeriod.update({ where: { id: periodId }, data: { isPublished: false, publishedAt: null } });
});

test("categorías: los pesos deben sumar 100 y no se quita una categoría con actividades", async () => {
  const save = (actor: typeof A.teacher, categories: Array<{ id?: string; name: string; weight: number }>) =>
    saveCategories(actor, { courseId: A.courseId, gradingPeriodId: periodId, categories });
  const general = { id: categoryId, name: "General", weight: 60 };

  const short = await save(A.teacher, [general, { name: "Exámenes", weight: 30 }]);
  assert.equal(short.ok, false);
  assert.match(short.message, /suman 90 %/);
  assert.equal((await save(A.teacher, [general, { name: "Exámenes", weight: 50 }])).ok, false);
  assert.equal((await save(A.teacher, [{ ...general, weight: 50 }, { name: "general", weight: 50 }])).ok, false, "nombre repetido");
  assert.equal((await save(A.teacher2, [general, { name: "Exámenes", weight: 40 }])).ok, false);
  assert.equal((await save(B.teacher, [general, { name: "Exámenes", weight: 40 }])).ok, false);
  assert.equal(await db.gradeCategory.count({ where: scope }), 1);

  assert.equal((await save(A.teacher, [general, { name: "Exámenes", weight: 40 }])).ok, true);
  const saved = await db.gradeCategory.findMany({ where: scope, orderBy: { weight: "desc" } });
  assert.deepEqual(saved.map((category) => [category.name, category.weight]), [["General", 60], ["Exámenes", 40]]);

  const blocked = await save(A.teacher, [{ id: saved[1].id, name: "Exámenes", weight: 100 }]);
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /actividades/);
  assert.equal((await save(A.teacher, [{ ...general, weight: 100 }])).ok, true, "la categoría vacía sí se quita");
  assert.equal(await db.gradeCategory.count({ where: scope }), 1);

  // Un período de otra institución no se toca aunque se conozca su identificador.
  await setupSimpleGrading(B.teacher, B.courseId);
  const foreign = await db.gradingPeriod.findFirstOrThrow({ where: { courseId: B.courseId } });
  assert.equal((await saveCategories(A.teacher, { courseId: A.courseId, gradingPeriodId: foreign.id, categories: [{ name: "X1", weight: 100 }] })).ok, false);
  assert.equal(await db.gradeCategory.count({ where: { courseId: B.courseId, name: "General" } }), 1);
});

test("CSV: lleva BOM, escapa comas y comillas, y desactiva las fórmulas", async () => {
  await db.user.update({ where: { id: A.student2.id }, data: { name: "@Pérez, Ana" } });
  for (const outsider of [A.teacher2, A.student, B.teacher]) assert.equal(await gradebookCsv(outsider, A.courseId), null);

  const csv = await gradebookCsv(A.teacher, A.courseId);
  assert.ok(csv);
  assert.equal(csv.filename, "notas-COURSE-1.csv");
  assert.equal(csv.content.charCodeAt(0), 0xfeff);
  const lines = csv.content.slice(1).trimEnd().split("\r\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[0], `Estudiante,Correo,"'=Suma, ""final"" (máx. 10)",Zeta oculta (máx. 100),Promedio (0 a 100)`);
  assert.ok(lines.includes(`"'@Pérez, Ana",estudiante2@a.test,5,,50`), csv.content);
  // a_student: 9 de 10 y la otra exonerada → solo cuenta la primera.
  assert.ok(lines.includes("student A,estudiante@a.test,9,Exonerado,90"), csv.content);
});

test("actividad manual: se edita pero no se borra con notas; la que viene de una tarea no se toca aquí", async () => {
  const edit = { gradeItemId: itemId, title: "Exposición", maxScore: 8, categoryId };
  const tooLow = await updateManualItem(A.teacher, edit);
  assert.equal(tooLow.ok, false, "ya hay un 9");
  assert.match(tooLow.message, /9/);
  assert.equal((await updateManualItem(A.teacher2, { ...edit, maxScore: 20 })).ok, false);
  assert.equal((await updateManualItem(B.teacher, { ...edit, maxScore: 20 })).ok, false);
  assert.equal((await updateManualItem(A.teacher, { ...edit, maxScore: 20 })).ok, true);
  const book = await loadGradebook(A.teacher, A.courseId);
  assert.equal(book?.items.find((item) => item.id === itemId)?.title, "Exposición");
  assert.equal(book?.students.find((student) => student.enrollmentId === ENROLLMENT_2)?.average, 25);

  await db.assignment.create({ data: { id: "it_gb_assignment", ...scope, title: "Tarea enlazada", isPublished: true } });
  const linked = await db.gradeItem.create({ data: { ...scope, gradingPeriodId: periodId, categoryId, assignmentId: "it_gb_assignment", title: "Tarea enlazada" } });
  assert.equal((await updateManualItem(A.teacher, { ...edit, gradeItemId: linked.id })).ok, false);
  assert.equal((await deleteManualItem(A.teacher, linked.id)).ok, false);
  assert.equal((await loadGradebook(A.teacher, A.courseId))?.items.find((item) => item.id === linked.id)?.source, "assignment");

  for (const outsider of [A.teacher2, A.student, B.teacher]) assert.equal((await deleteManualItem(outsider, itemId)).ok, false);
  const before = await db.gradeEntry.findMany({
    where: { gradeItemId: itemId }, include: { revisions: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" },
  });
  assert.ok(before.some((entry) => entry.revisions.length > 0), "hay correcciones que conservar");
  const result = await deleteManualItem(A.teacher, itemId);
  assert.equal(result.ok, false);
  assert.match(result.message, /no se puede borrar/);
  assert.equal(await db.gradeItem.count({ where: { id: itemId } }), 1);
  assert.deepEqual(await db.gradeEntry.findMany({
    where: { gradeItemId: itemId }, include: { revisions: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" },
  }), before, "no cambian las notas, sus autores, motivos ni revisiones");
});

test("actividad manual: una exoneración sin nota impide borrarla, aunque la matrícula esté retirada", async () => {
  const excused = await db.gradeItem.create({
    data: { ...scope, gradingPeriodId: periodId, categoryId, title: "Exoneración que se conserva" },
  });
  assert.equal((await saveGrade(A.teacher, {
    gradeItemId: excused.id, enrollmentId: ENROLLMENT_2, score: null, isExcused: true,
  })).ok, true);
  await db.enrollment.update({ where: { id: ENROLLMENT_2 }, data: { status: "DROPPED" } });
  const entry = await db.gradeEntry.findFirstOrThrow({ where: { gradeItemId: excused.id } });
  assert.equal((await deleteManualItem(A.teacher, excused.id)).ok, false);
  assert.equal(await db.gradeItem.count({ where: { id: excused.id } }), 1);
  assert.deepEqual(await db.gradeEntry.findUnique({ where: { id: entry.id } }), entry);
  await db.enrollment.update({ where: { id: ENROLLMENT_2 }, data: { status: "ACTIVE" } });
});

test("actividad manual: una actividad vacía sí se borra", async () => {
  const empty = await db.gradeItem.create({
    data: { ...scope, gradingPeriodId: periodId, categoryId, title: "Actividad vacía" },
  });
  for (const outsider of [A.teacher2, A.student, B.admin]) {
    assert.equal((await deleteManualItem(outsider, empty.id)).ok, false);
  }
  assert.deepEqual(await deleteManualItem(A.teacher, empty.id), { ok: true, message: "Se borró «Actividad vacía»." });
  assert.equal(await db.gradeItem.count({ where: { id: empty.id } }), 0);
  assert.equal((await deleteManualItem(A.teacher, empty.id)).ok, false, "no anuncia un segundo borrado inexistente");
});
