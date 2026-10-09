import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { db } from "@/lib/db";
import { getLessonView, parseVideoLink, setLessonCompleted } from "@/server/courses/lesson-progress";
import { A, B, ensureSeed } from "./setup";

// Capítulo 1 (publicado): L1 publicada, L2 borrador, L3 publicada.
// Capítulo 2 (borrador): L4 publicada (no cuenta: su capítulo no está publicado).
// Capítulo 3 (publicado): L5 publicada.
// Orden de estudio: L1 → L3 → L5.
const SECTIONS = [
  { id: "lp_s1", order: 9101, isPublished: true },
  { id: "lp_s2", order: 9102, isPublished: false },
  { id: "lp_s3", order: 9103, isPublished: true },
];
const LESSONS = [
  { id: "lp_l1", sectionId: "lp_s1", order: 1, isPublished: true },
  { id: "lp_l2", sectionId: "lp_s1", order: 2, isPublished: false },
  { id: "lp_l3", sectionId: "lp_s1", order: 3, isPublished: true },
  { id: "lp_l4", sectionId: "lp_s2", order: 1, isPublished: true },
  { id: "lp_l5", sectionId: "lp_s3", order: 1, isPublished: true },
];
const LESSON_IDS = LESSONS.map((lesson) => lesson.id);
const ENROLLMENT = "a_enrollment";
const ref = (lessonId: string, courseId = A.courseId) => ({ courseId, lessonId });
const enrollment = () => db.enrollment.findUniqueOrThrow({ where: { id: ENROLLMENT } });

before(async () => {
  await ensureSeed();
  for (const section of SECTIONS) {
    await db.courseSection.create({ data: { ...section, institutionId: A.institutionId, courseId: A.courseId, title: `Capítulo ${section.id}` } });
  }
  for (const lesson of LESSONS) {
    await db.lesson.create({ data: { ...lesson, institutionId: A.institutionId, courseId: A.courseId, title: `Lección ${lesson.id}`, content: "Línea 1\nLínea 2" } });
  }
});
beforeEach(async () => {
  await db.lessonProgress.deleteMany({ where: { lessonId: { in: LESSON_IDS } } });
  await db.enrollment.update({ where: { id: ENROLLMENT }, data: { status: "ACTIVE", progressPercent: 0, completedAt: null } });
});
after(async () => {
  await db.lessonProgress.deleteMany({ where: { lessonId: { in: LESSON_IDS } } });
  await db.lesson.deleteMany({ where: { id: { in: LESSON_IDS } } });
  await db.courseSection.deleteMany({ where: { id: { in: SECTIONS.map((section) => section.id) } } });
  await db.enrollment.update({ where: { id: ENROLLMENT }, data: { status: "ACTIVE", progressPercent: 0, completedAt: null } });
  await db.$disconnect();
});

test("lección: el estudiante inscrito la ve con el temario publicado y su avance", async () => {
  const view = await getLessonView(A.student, ref("lp_l1"));
  assert.ok(view);
  assert.equal(view.mode, "student");
  assert.equal(view.canComplete, true);
  assert.equal(view.lesson.sectionTitle, "Capítulo lp_s1");
  assert.equal(view.lesson.content, "Línea 1\nLínea 2");
  assert.deepEqual(view.outline.map((section) => section.id), ["lp_s1", "lp_s3"]);
  assert.deepEqual(view.outline.flatMap((section) => section.lessons.map((lesson) => lesson.id)), ["lp_l1", "lp_l3", "lp_l5"]);
  assert.deepEqual(view.outline[0].lessons.map((lesson) => lesson.current), [true, false]);
  assert.equal(view.totalLessons, 3);
  assert.equal(view.completedLessons, 0);
  assert.equal(view.completedAt, null);
});

test("siguiente y anterior respetan el orden y saltan lo no publicado", async () => {
  const first = await getLessonView(A.student, ref("lp_l1"));
  const middle = await getLessonView(A.student, ref("lp_l3"));
  const last = await getLessonView(A.student, ref("lp_l5"));
  assert.deepEqual([first?.previousLessonId, first?.nextLessonId], [null, "lp_l3"]);
  assert.deepEqual([middle?.previousLessonId, middle?.nextLessonId], ["lp_l1", "lp_l5"]);
  assert.deepEqual([last?.previousLessonId, last?.nextLessonId], ["lp_l3", null]);
});

test("completar calcula el porcentaje sobre las lecciones publicadas y no cambia el estado de la matrícula", async () => {
  const one = await setLessonCompleted(A.student, { ...ref("lp_l1"), completed: true });
  assert.deepEqual(one, { ok: true, progressPercent: 33.33, completedLessons: 1, totalLessons: 3, nextLessonId: "lp_l3" });
  assert.equal((await enrollment()).progressPercent, 33.33);

  const two = await setLessonCompleted(A.student, { ...ref("lp_l3"), completed: true });
  assert.deepEqual(two, { ok: true, progressPercent: 66.67, completedLessons: 2, totalLessons: 3, nextLessonId: "lp_l5" });

  const three = await setLessonCompleted(A.student, { ...ref("lp_l5"), completed: true });
  assert.deepEqual(three, { ok: true, progressPercent: 100, completedLessons: 3, totalLessons: 3, nextLessonId: null });
  const row = await enrollment();
  assert.equal(row.progressPercent, 100);
  assert.equal(row.status, "ACTIVE");
  assert.equal(row.completedAt, null);

  const view = await getLessonView(A.student, ref("lp_l3"));
  assert.equal(view?.completedLessons, 3);
  assert.ok(view?.completedAt instanceof Date);
  assert.deepEqual(view?.outline.flatMap((section) => section.lessons.map((lesson) => lesson.completed)), [true, true, true]);
});

test("marcar dos veces es idempotente y conserva la fecha", async () => {
  await setLessonCompleted(A.student, { ...ref("lp_l1"), completed: true });
  const firstRow = await db.lessonProgress.findFirstOrThrow({ where: { enrollmentId: ENROLLMENT, lessonId: "lp_l1" } });
  const again = await setLessonCompleted(A.student, { ...ref("lp_l1"), completed: true });
  assert.deepEqual(again, { ok: true, progressPercent: 33.33, completedLessons: 1, totalLessons: 3, nextLessonId: "lp_l3" });
  const rows = await db.lessonProgress.findMany({ where: { enrollmentId: ENROLLMENT, lessonId: "lp_l1" } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].completedAt?.getTime(), firstRow.completedAt?.getTime());
  assert.equal((await enrollment()).progressPercent, 33.33);
});

test("marcar como no completada baja el avance; repetirlo no cambia nada", async () => {
  await setLessonCompleted(A.student, { ...ref("lp_l1"), completed: true });
  await setLessonCompleted(A.student, { ...ref("lp_l3"), completed: true });
  const undone = await setLessonCompleted(A.student, { ...ref("lp_l3"), completed: false });
  assert.equal(undone.ok && undone.progressPercent, 33.33);
  const again = await setLessonCompleted(A.student, { ...ref("lp_l3"), completed: false });
  assert.equal(again.ok && again.progressPercent, 33.33);
  const row = await db.lessonProgress.findFirstOrThrow({ where: { enrollmentId: ENROLLMENT, lessonId: "lp_l3" } });
  assert.equal(row.completed, false);
  assert.equal(row.completedAt, null);
  assert.equal((await getLessonView(A.student, ref("lp_l3")))?.completedAt, null);
  // Desmarcar algo que nunca se marcó no crea registros.
  await setLessonCompleted(A.student, { ...ref("lp_l5"), completed: false });
  assert.equal(await db.lessonProgress.count({ where: { lessonId: "lp_l5" } }), 0);
});

test("lo no publicado no se ve ni se completa", async () => {
  assert.equal(await getLessonView(A.student, ref("lp_l2")), null);
  assert.equal(await getLessonView(A.student, ref("lp_l4")), null);
  assert.equal((await setLessonCompleted(A.student, { ...ref("lp_l2"), completed: true })).ok, false);
  assert.equal((await setLessonCompleted(A.student, { ...ref("lp_l4"), completed: true })).ok, false);
  assert.equal(await db.lessonProgress.count({ where: { lessonId: { in: LESSON_IDS } } }), 0);
  assert.equal((await enrollment()).progressPercent, 0);
});

test("un estudiante no inscrito y un estudiante de otra institución no pueden ver ni completar", async () => {
  for (const outsider of [A.student2, B.student]) {
    assert.equal(await getLessonView(outsider, ref("lp_l1")), null);
    assert.equal((await setLessonCompleted(outsider, { ...ref("lp_l1"), completed: true })).ok, false);
  }
  // Tampoco sirve pedir la lección de A bajo el curso propio de B.
  assert.equal(await getLessonView(B.student, ref("lp_l1", B.courseId)), null);
  assert.equal((await setLessonCompleted(B.student, { ...ref("lp_l1", B.courseId), completed: true })).ok, false);
  assert.equal(await db.lessonProgress.count({ where: { lessonId: { in: LESSON_IDS } } }), 0);
});

test("matrícula retirada no entra; matrícula completada consulta pero no cambia su avance", async () => {
  await db.enrollment.update({ where: { id: ENROLLMENT }, data: { status: "DROPPED" } });
  assert.equal(await getLessonView(A.student, ref("lp_l1")), null);
  assert.equal((await setLessonCompleted(A.student, { ...ref("lp_l1"), completed: true })).ok, false);

  await db.enrollment.update({ where: { id: ENROLLMENT }, data: { status: "COMPLETED" } });
  const view = await getLessonView(A.student, ref("lp_l1"));
  assert.equal(view?.mode, "student");
  assert.equal(view?.canComplete, false);
  assert.equal((await setLessonCompleted(A.student, { ...ref("lp_l1"), completed: true })).ok, false);
  assert.equal(await db.lessonProgress.count({ where: { lessonId: { in: LESSON_IDS } } }), 0);
});

test("vista previa: solo quien gestiona el curso, y sin avance", async () => {
  for (const manager of [A.teacher, A.admin]) {
    const view = await getLessonView(manager, ref("lp_l1"));
    assert.equal(view?.mode, "preview");
    assert.equal(view?.canComplete, false);
    assert.equal(view?.nextLessonId, "lp_l3");
  }
  // Quien gestiona puede revisar un borrador; el temario sigue mostrando solo lo publicado.
  const draft = await getLessonView(A.teacher, ref("lp_l2"));
  assert.equal(draft?.lesson.isPublished, false);
  assert.equal(draft?.totalLessons, 3);
  assert.deepEqual([draft?.previousLessonId, draft?.nextLessonId], [null, null]);

  assert.equal(await getLessonView(A.teacher2, ref("lp_l1")), null, "docente de otro curso");
  assert.equal(await getLessonView(B.teacher, ref("lp_l1")), null, "docente de otra institución");
  assert.equal(await getLessonView(B.admin, ref("lp_l1")), null, "administrador de otra institución");
  assert.equal(await getLessonView(A.parent, ref("lp_l1")), null, "acudiente");
  assert.equal((await setLessonCompleted(A.teacher, { ...ref("lp_l1"), completed: true })).ok, false);
  assert.equal(await db.lessonProgress.count({ where: { lessonId: { in: LESSON_IDS } } }), 0);
});

test("video: solo se incrusta YouTube o Vimeo con dirección armada por nosotros", () => {
  const youtube = { kind: "embed", provider: "YouTube", src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" };
  assert.deepEqual(parseVideoLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s"), youtube);
  assert.deepEqual(parseVideoLink(" https://youtu.be/dQw4w9WgXcQ?si=abc "), youtube);
  assert.deepEqual(parseVideoLink("https://m.youtube.com/shorts/dQw4w9WgXcQ"), youtube);
  assert.deepEqual(parseVideoLink("https://vimeo.com/123456789"), { kind: "embed", provider: "Vimeo", src: "https://player.vimeo.com/video/123456789" });
  assert.deepEqual(parseVideoLink("https://player.vimeo.com/video/123456789?h=x"), { kind: "embed", provider: "Vimeo", src: "https://player.vimeo.com/video/123456789" });
  // Parecidos que no son YouTube ni códigos válidos: nunca se incrustan.
  assert.equal(parseVideoLink("https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ")?.kind, "link");
  assert.equal(parseVideoLink('https://www.youtube.com/watch?v="><script>')?.kind, "link");
  assert.deepEqual(parseVideoLink("https://videos.escuela.test/clase1"), { kind: "link", href: "https://videos.escuela.test/clase1" });
  for (const bad of ["http://youtu.be/dQw4w9WgXcQ", "javascript:alert(1)", "data:text/html,hola", "https://user:pass@vimeo.com/123456789", "Mira https://youtu.be/dQw4w9WgXcQ", "", null]) {
    assert.equal(parseVideoLink(bad), null);
  }
});
