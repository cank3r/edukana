import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { db } from "@/lib/db";
import {
  createChapter,
  createLesson,
  deleteChapter,
  deleteLesson,
  getCourseContent,
  moveChapter,
  moveLesson,
  setChapterPublished,
  setLessonPublished,
  updateChapter,
  updateLesson,
  videoLinkFromContent,
} from "@/server/courses/content";
import { A, B, ensureSeed } from "./setup";

type Actor = Parameters<typeof createChapter>[0];
const COURSES = [A.courseId, A.course2Id, B.courseId, B.course2Id];
const textLesson = (title: string) => ({ title, type: "TEXT", content: "Texto de la lección.", estimatedMinutes: 10 });

async function cleanUp() {
  await db.courseSection.deleteMany({ where: { courseId: { in: COURSES } } });
  await db.auditLog.deleteMany({ where: { OR: [{ action: { startsWith: "COURSE_CHAPTER_" } }, { action: { startsWith: "COURSE_LESSON_" } }] } });
}

async function chapterTitles(courseId: string) {
  const rows = await db.courseSection.findMany({ where: { courseId }, orderBy: { order: "asc" }, select: { title: true, order: true } });
  assert.deepEqual(rows.map((row) => row.order), rows.map((_, index) => index), "orden de capítulos consecutivo y sin duplicados");
  return rows.map((row) => row.title);
}

async function lessonTitles(sectionId: string) {
  const rows = await db.lesson.findMany({ where: { sectionId }, orderBy: { order: "asc" }, select: { title: true, order: true } });
  assert.deepEqual(rows.map((row) => row.order), rows.map((_, index) => index), "orden de lecciones consecutivo y sin duplicados");
  return rows.map((row) => row.title);
}

async function newChapter(title: string, actor: Actor = A.teacher, courseId = A.courseId) {
  const result = await createChapter(actor, courseId, { title });
  assert.ok(result.ok && result.id, `se crea el capítulo ${title}`);
  return result.id;
}

async function newLesson(chapterId: string, title: string, actor: Actor = A.teacher) {
  const result = await createLesson(actor, chapterId, textLesson(title));
  assert.ok(result.ok && result.id, `se crea la lección ${title}`);
  return result.id;
}

before(async () => {
  await ensureSeed();
  await cleanUp();
});
beforeEach(cleanUp);
after(async () => {
  await cleanUp();
  await db.$disconnect();
});

test("capítulo: el docente del curso lo crea como borrador, lo corrige, lo publica y lo oculta", async () => {
  const id = await newChapter("Unidad 1");
  let chapter = await db.courseSection.findUniqueOrThrow({ where: { id } });
  assert.equal(chapter.institutionId, A.institutionId);
  assert.equal(chapter.courseId, A.courseId);
  assert.equal(chapter.isPublished, false);
  assert.equal(chapter.order, 0);

  assert.equal((await updateChapter(A.teacher, id, { title: "Unidad 1. Inicio", description: "Primeros pasos" })).ok, true);
  assert.equal((await setChapterPublished(A.teacher, id, true)).ok, true);
  chapter = await db.courseSection.findUniqueOrThrow({ where: { id } });
  assert.equal(chapter.title, "Unidad 1. Inicio");
  assert.equal(chapter.description, "Primeros pasos");
  assert.equal(chapter.isPublished, true);
  assert.equal((await setChapterPublished(A.teacher, id, false)).ok, true);
  assert.equal((await db.courseSection.findUniqueOrThrow({ where: { id } })).isPublished, false);

  assert.equal((await createChapter(A.teacher, A.courseId, { title: "x" })).ok, false, "título demasiado corto");
  const actions = (await db.auditLog.findMany({ where: { entityId: id, institutionId: A.institutionId, userId: A.teacher.id } })).map((log) => log.action);
  assert.deepEqual(actions.sort(), ["COURSE_CHAPTER_CREATED", "COURSE_CHAPTER_HIDDEN", "COURSE_CHAPTER_PUBLISHED", "COURSE_CHAPTER_UPDATED"]);
});

test("lección: crear, corregir, publicar y borrar; el video exige un enlace", async () => {
  const chapterId = await newChapter("Unidad 1");
  const id = await newLesson(chapterId, "Lección de texto");
  let lesson = await db.lesson.findUniqueOrThrow({ where: { id } });
  assert.equal(lesson.institutionId, A.institutionId);
  assert.equal(lesson.courseId, A.courseId);
  assert.equal(lesson.sectionId, chapterId);
  assert.equal(lesson.isPublished, false);

  const video = { title: "Lección en video", summary: "Mira el video", type: "VIDEO", content: " https://www.youtube.com/watch?v=abc123 ", estimatedMinutes: "25" };
  assert.equal((await updateLesson(A.teacher, id, { ...video, content: "mira esto" })).ok, false, "un video sin enlace se rechaza");
  assert.equal((await updateLesson(A.teacher, id, { ...video, content: "javascript:alert(1)" })).ok, false, "solo enlaces http o https");
  assert.equal((await updateLesson(A.teacher, id, video)).ok, true);
  lesson = await db.lesson.findUniqueOrThrow({ where: { id } });
  assert.equal(lesson.type, "VIDEO");
  assert.equal(lesson.content, "https://www.youtube.com/watch?v=abc123");
  assert.equal(videoLinkFromContent(lesson.content), "https://www.youtube.com/watch?v=abc123");
  assert.equal(lesson.estimatedMinutes, 25);
  assert.equal(lesson.summary, "Mira el video");

  assert.equal((await createLesson(A.teacher, chapterId, { ...textLesson("Otra"), estimatedMinutes: 0 })).ok, false, "minutos fuera de rango");
  assert.equal((await setLessonPublished(A.teacher, id, true)).ok, true);
  assert.equal((await db.lesson.findUniqueOrThrow({ where: { id } })).isPublished, true);

  const content = await getCourseContent(A.teacher, A.courseId);
  assert.equal(content?.sections[0].lessons[0].id, id);

  assert.equal((await deleteLesson(A.teacher, id)).ok, true);
  assert.equal(await db.lesson.count({ where: { id } }), 0);
  assert.equal(await db.auditLog.count({ where: { entityId: id, action: "COURSE_LESSON_DELETED" } }), 1);
});

test("reordenar capítulos: subir y bajar intercambia vecinos y el orden queda consecutivo", async () => {
  const one = await newChapter("Uno");
  const two = await newChapter("Dos");
  const three = await newChapter("Tres");
  assert.deepEqual(await chapterTitles(A.courseId), ["Uno", "Dos", "Tres"]);

  assert.equal((await moveChapter(A.teacher, three, "up")).ok, true);
  assert.deepEqual(await chapterTitles(A.courseId), ["Uno", "Tres", "Dos"]);
  assert.equal((await moveChapter(A.teacher, one, "down")).ok, true);
  assert.deepEqual(await chapterTitles(A.courseId), ["Tres", "Uno", "Dos"]);
  // En los bordes no cambia nada.
  assert.equal((await moveChapter(A.teacher, three, "up")).ok, true);
  assert.equal((await moveChapter(A.teacher, two, "down")).ok, true);
  assert.deepEqual(await chapterTitles(A.courseId), ["Tres", "Uno", "Dos"]);

  // Al borrar el del medio no quedan huecos y el siguiente capítulo nuevo va al final.
  assert.equal((await deleteChapter(A.teacher, one)).ok, true);
  assert.deepEqual(await chapterTitles(A.courseId), ["Tres", "Dos"]);
  await newChapter("Cuatro");
  assert.deepEqual(await chapterTitles(A.courseId), ["Tres", "Dos", "Cuatro"]);
});

test("reordenar lecciones: solo dentro de su capítulo, consecutivo y sin duplicados", async () => {
  const chapterId = await newChapter("Unidad 1");
  const otherChapterId = await newChapter("Unidad 2");
  const a = await newLesson(chapterId, "Lección A");
  const b = await newLesson(chapterId, "Lección B");
  const c = await newLesson(chapterId, "Lección C");
  const other = await newLesson(otherChapterId, "Lección de otra unidad");

  assert.equal((await moveLesson(A.teacher, a, "down")).ok, true);
  assert.deepEqual(await lessonTitles(chapterId), ["Lección B", "Lección A", "Lección C"]);
  assert.equal((await moveLesson(A.teacher, c, "up")).ok, true);
  assert.equal((await moveLesson(A.teacher, c, "up")).ok, true);
  assert.equal((await moveLesson(A.teacher, c, "up")).ok, true);
  assert.deepEqual(await lessonTitles(chapterId), ["Lección C", "Lección B", "Lección A"]);

  assert.equal((await moveLesson(A.teacher, other, "up")).ok, true);
  assert.deepEqual(await lessonTitles(otherChapterId), ["Lección de otra unidad"]);

  assert.equal((await deleteLesson(A.teacher, b)).ok, true);
  assert.deepEqual(await lessonTitles(chapterId), ["Lección C", "Lección A"]);
  await newLesson(chapterId, "Lección D");
  assert.deepEqual(await lessonTitles(chapterId), ["Lección C", "Lección A", "Lección D"]);
});

test("borrar capítulo: se borran sus lecciones y el avance registrado, y nada más", async () => {
  const keep = await newChapter("Se queda");
  const keptLesson = await newLesson(keep, "Lección que se queda");
  const gone = await newChapter("Se borra");
  const lessonOne = await newLesson(gone, "Lección 1");
  await newLesson(gone, "Lección 2");
  const enrollment = await db.enrollment.findFirstOrThrow({ where: { studentId: A.student.id, courseId: A.courseId } });
  await db.lessonProgress.createMany({
    data: [
      { institutionId: A.institutionId, enrollmentId: enrollment.id, lessonId: lessonOne, completed: true },
      { institutionId: A.institutionId, enrollmentId: enrollment.id, lessonId: keptLesson, completed: true },
    ],
  });

  assert.equal((await deleteChapter(A.teacher, gone)).ok, true);
  assert.equal(await db.courseSection.count({ where: { id: gone } }), 0);
  assert.equal(await db.lesson.count({ where: { sectionId: gone } }), 0);
  assert.equal(await db.lessonProgress.count({ where: { lessonId: lessonOne } }), 0);
  assert.equal(await db.lesson.count({ where: { sectionId: keep } }), 1);
  assert.equal(await db.lessonProgress.count({ where: { lessonId: keptLesson } }), 1);
  assert.deepEqual(await chapterTitles(A.courseId), ["Se queda"]);
  const log = await db.auditLog.findFirstOrThrow({ where: { entityId: gone, action: "COURSE_CHAPTER_DELETED" } });
  assert.equal((log.changes as { lessonsDeleted: number }).lessonsDeleted, 2);
  assert.equal(await db.enrollment.count({ where: { id: enrollment.id } }), 1, "la inscripción no se toca");
});

test("permisos: otro docente de A, un estudiante y cualquier usuario de B son rechazados sin cambiar nada", async () => {
  const chapterId = await newChapter("Unidad 1");
  const lessonId = await newLesson(chapterId, "Lección 1");
  await newChapter("Unidad 2");
  await newLesson(chapterId, "Lección 2");
  const before = JSON.stringify(await getCourseContent(A.teacher, A.courseId));

  for (const intruder of [A.teacher2, A.student, A.parent, B.teacher, B.admin, B.coordinator, B.student]) {
    const label = `${intruder.id} es rechazado`;
    assert.equal(await getCourseContent(intruder, A.courseId), null, label);
    assert.equal((await createChapter(intruder, A.courseId, { title: "Intruso" })).ok, false, label);
    assert.equal((await updateChapter(intruder, chapterId, { title: "Cambiado" })).ok, false, label);
    assert.equal((await setChapterPublished(intruder, chapterId, true)).ok, false, label);
    assert.equal((await moveChapter(intruder, chapterId, "down")).ok, false, label);
    assert.equal((await deleteChapter(intruder, chapterId)).ok, false, label);
    assert.equal((await createLesson(intruder, chapterId, textLesson("Intrusa"))).ok, false, label);
    assert.equal((await updateLesson(intruder, lessonId, textLesson("Cambiada"))).ok, false, label);
    assert.equal((await setLessonPublished(intruder, lessonId, true)).ok, false, label);
    assert.equal((await moveLesson(intruder, lessonId, "down")).ok, false, label);
    assert.equal((await deleteLesson(intruder, lessonId)).ok, false, label);
  }
  assert.equal(JSON.stringify(await getCourseContent(A.teacher, A.courseId)), before, "el contenido quedó igual");
  assert.equal(await db.courseSection.count({ where: { institutionId: B.institutionId } }), 0);
});

test("permisos: administración y coordinación de A gestionan cualquier curso de A; cada docente, solo el suyo", async () => {
  const byAdmin = await newChapter("Creado por administración", A.admin);
  assert.equal((await updateChapter(A.coordinator, byAdmin, { title: "Corregido por coordinación" })).ok, true);
  assert.equal((await createLesson(A.teacher, byAdmin, textLesson("Del docente del curso"))).ok, true);

  const own = await newChapter("Del segundo docente", A.teacher2, A.course2Id);
  assert.equal((await updateChapter(A.teacher, own, { title: "Ajeno" })).ok, false);
  assert.equal((await createChapter(A.teacher2, B.course2Id, { title: "En otra institución" })).ok, false);
  assert.deepEqual(await chapterTitles(A.course2Id), ["Del segundo docente"]);
});
