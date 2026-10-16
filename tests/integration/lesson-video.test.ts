import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { db } from "@/lib/db";
import { createChapter, createLesson, getCourseContent, setChapterPublished, setLessonPublished, updateLesson } from "@/server/courses/content";
import { getLessonView } from "@/server/courses/lesson-progress";
import { A, B, ensureSeed } from "./setup";

const COURSES = [A.courseId, B.courseId];
const YOUTUBE = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";

async function cleanUp() {
  await db.courseSection.deleteMany({ where: { courseId: { in: COURSES } } });
  await db.auditLog.deleteMany({ where: { OR: [{ action: { startsWith: "COURSE_CHAPTER_" } }, { action: { startsWith: "COURSE_LESSON_" } }] } });
  await db.enrollment.update({ where: { id: "a_enrollment" }, data: { status: "ACTIVE", progressPercent: 0, completedAt: null } });
}

/** Capítulo y lección publicados en el curso de A, con texto y video. */
async function publishedLessonWithVideo(videoUrl: string) {
  const chapter = await createChapter(A.teacher, A.courseId, { title: "Unidad con video" });
  assert.ok(chapter.ok && chapter.id);
  const lesson = await createLesson(A.teacher, chapter.id, { title: "Clase grabada", type: "TEXT", content: "Lee esto después del video.", videoUrl, estimatedMinutes: 15 });
  assert.ok(lesson.ok && lesson.id, "se guarda la lección con video");
  assert.equal((await setChapterPublished(A.teacher, chapter.id, true)).ok, true);
  assert.equal((await setLessonPublished(A.teacher, lesson.id, true)).ok, true);
  return lesson.id;
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

test("el docente guarda un video junto al texto y se guarda la dirección de inserción segura", async () => {
  const id = await publishedLessonWithVideo(" https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5s ");
  const row = await db.lesson.findUniqueOrThrow({ where: { id } });
  assert.equal(row.videoUrl, YOUTUBE);
  assert.equal(row.content, "Lee esto después del video.");
  assert.equal(row.institutionId, A.institutionId);

  const content = await getCourseContent(A.teacher, A.courseId);
  assert.equal(content?.sections[0]?.lessons[0]?.videoUrl, YOUTUBE, "el editor recibe el video guardado");

  // Cambiar a Vimeo y luego quitar el video.
  const base = { title: "Clase grabada", type: "TEXT", content: "Lee esto después del video.", estimatedMinutes: 15 };
  assert.equal((await updateLesson(A.teacher, id, { ...base, videoUrl: "https://vimeo.com/123456789" })).ok, true);
  assert.equal((await db.lesson.findUniqueOrThrow({ where: { id } })).videoUrl, "https://player.vimeo.com/video/123456789");
  assert.equal((await updateLesson(A.teacher, id, { ...base, videoUrl: "" })).ok, true);
  assert.equal((await db.lesson.findUniqueOrThrow({ where: { id } })).videoUrl, null, "dejar el campo vacío quita el video");
});

test("se rechazan enlaces que no son de una fuente permitida y no se cambia nada", async () => {
  const id = await publishedLessonWithVideo("https://youtu.be/dQw4w9WgXcQ");
  const base = { title: "Clase grabada", type: "TEXT", content: "Texto", estimatedMinutes: 15 };
  for (const bad of ["javascript:alert(1)", "https://evil.test/embed/dQw4w9WgXcQ", "http://www.youtube.com/watch?v=dQw4w9WgXcQ"]) {
    const result = await updateLesson(A.teacher, id, { ...base, videoUrl: bad });
    assert.equal(result.ok, false, bad);
    if (!result.ok) assert.match(result.message, /YouTube, Vimeo, Google Drive/);
  }
  assert.equal((await db.lesson.findUniqueOrThrow({ where: { id } })).videoUrl, YOUTUBE);

  // Una lección de tipo video exige el video.
  const chapterId = (await db.lesson.findUniqueOrThrow({ where: { id } })).sectionId;
  assert.equal((await createLesson(A.teacher, chapterId, { title: "Solo video", type: "VIDEO", content: "texto", estimatedMinutes: 5 })).ok, false);
  assert.equal((await createLesson(A.teacher, chapterId, { title: "Solo video", type: "VIDEO", videoUrl: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view", estimatedMinutes: 5 })).ok, true);
});

test("el estudiante inscrito ve el video; uno de otra institución no ve la lección ni puede cambiarla", async () => {
  const id = await publishedLessonWithVideo("https://youtu.be/dQw4w9WgXcQ");

  const view = await getLessonView(A.student, { courseId: A.courseId, lessonId: id });
  assert.equal(view?.lesson.videoUrl, YOUTUBE);
  assert.equal(view?.lesson.content, "Lee esto después del video.");

  assert.equal(await getLessonView(B.student, { courseId: A.courseId, lessonId: id }), null, "estudiante de otra institución");
  assert.equal(await getLessonView(B.teacher, { courseId: A.courseId, lessonId: id }), null, "docente de otra institución");
  assert.equal(await getLessonView(B.student, { courseId: B.courseId, lessonId: id }), null, "ni pasando el curso propio");

  const foreign = await updateLesson(B.teacher, id, { title: "Clase grabada", type: "TEXT", videoUrl: "https://vimeo.com/123456789", estimatedMinutes: 15 });
  assert.equal(foreign.ok, false);
  assert.equal((await db.lesson.findUniqueOrThrow({ where: { id } })).videoUrl, YOUTUBE, "el video no cambió");
});
