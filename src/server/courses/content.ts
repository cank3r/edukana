import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { courseWhereForScope, resolveCourseWriteScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import type { EdukanaRole } from "@/types/next-auth";

/**
 * Editor de contenido de un curso: capítulos (`CourseSection`) y lecciones (`Lesson`).
 *
 * Todas las operaciones pasan por `manageWhere`: solo quien gestiona el curso
 * (su docente, o coordinación/administración de la misma institución) puede leer o cambiar algo.
 *
 * Formato de `Lesson.content` según el tipo:
 * - TEXT, DOCUMENT, ACTIVITY: texto libre (se muestra respetando los saltos de línea).
 * - VIDEO: únicamente el enlace del video, una sola línea que empieza por `http://` o `https://`
 *   (por ejemplo un enlace de YouTube o Vimeo). La explicación del video va en `summary`.
 *   `videoLinkFromContent` devuelve ese enlace o null si el contenido no lo es.
 *
 * Un estudiante ve una lección solo si la lección y su capítulo están publicados.
 * El `order` de capítulos (por curso) y de lecciones (por capítulo) queda siempre 0,1,2… sin huecos.
 */

type Actor = { id: string; institutionId: string; role: EdukanaRole };
type Tx = Prisma.TransactionClient;
export type ContentResult = { ok: true; courseId: string; id?: string } | { ok: false; message: string };
export type MoveDirection = "up" | "down";

export const LESSON_TYPES = ["TEXT", "VIDEO", "DOCUMENT", "ACTIVITY"] as const;

const NOT_FOUND_COURSE = "No encontramos ese curso o no tienes permiso para cambiar su contenido.";
const NOT_FOUND_CHAPTER = "No encontramos ese capítulo o no tienes permiso para cambiarlo.";
const NOT_FOUND_LESSON = "No encontramos esa lección o no tienes permiso para cambiarla.";

export const chapterSchema = z.object({
  title: z.string().trim().min(3, "Escribe un título de al menos 3 letras.").max(120, "El título es demasiado largo."),
  description: z.string().trim().max(500, "La descripción es demasiado larga.").optional(),
});

export const lessonSchema = z
  .object({
    title: z.string().trim().min(3, "Escribe un título de al menos 3 letras.").max(140, "El título es demasiado largo."),
    summary: z.string().trim().max(500, "El resumen es demasiado largo.").optional(),
    type: z.enum(LESSON_TYPES, { error: "Elige el tipo de lección." }),
    content: z.string().trim().max(50000, "El contenido es demasiado largo.").optional(),
    estimatedMinutes: z.coerce
      .number({ error: "Escribe los minutos con números." })
      .int("Escribe los minutos sin decimales.")
      .min(1, "La duración mínima es 1 minuto.")
      .max(600, "La duración máxima es 600 minutos."),
  })
  .refine((lesson) => lesson.type !== "VIDEO" || videoLinkFromContent(lesson.content) !== null, {
    message: "Pega el enlace completo del video. Debe empezar por https://",
    path: ["content"],
  });

export type ChapterInput = { title: string; description?: string };
export type LessonInput = { title: string; summary?: string; type: string; content?: string; estimatedMinutes: number | string };

/** Enlace de una lección de video, o null si `content` no es un enlace válido de una sola línea. */
export function videoLinkFromContent(content: string | null | undefined): string | null {
  const value = content?.trim() ?? "";
  if (!value || /\s/.test(value) || value.length > 2000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}

async function manageWhere(actor: Actor): Promise<Prisma.CourseWhereInput | null> {
  if (!actor.id || !actor.institutionId) return null;
  const capabilities = await getEffectiveCapabilities(actor.institutionId, actor.role);
  return courseWhereForScope(actor.institutionId, resolveCourseWriteScope(actor, capabilities));
}

function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Revisa los datos.";
}

function audit(tx: Tx, actor: Actor, action: string, entity: "CourseSection" | "Lesson", entityId: string, changes: Prisma.InputJsonObject) {
  return tx.auditLog.create({ data: { institutionId: actor.institutionId, userId: actor.id, action, entity, entityId, changes } });
}

/** Deja el orden 0,1,2… Recorre de menor a mayor, así ningún paso choca con el índice único. */
async function renumberChapters(tx: Tx, institutionId: string, courseId: string) {
  const rows = await tx.courseSection.findMany({ where: { institutionId, courseId }, orderBy: { order: "asc" }, select: { id: true, order: true } });
  for (const [index, row] of rows.entries()) {
    if (row.order !== index) await tx.courseSection.update({ where: { id: row.id }, data: { order: index } });
  }
}

async function renumberLessons(tx: Tx, institutionId: string, sectionId: string) {
  const rows = await tx.lesson.findMany({ where: { institutionId, sectionId }, orderBy: { order: "asc" }, select: { id: true, order: true } });
  for (const [index, row] of rows.entries()) {
    if (row.order !== index) await tx.lesson.update({ where: { id: row.id }, data: { order: index } });
  }
}

/** Temario completo para la pantalla del editor; null si el curso no existe o no lo gestiona quien pregunta. */
export async function getCourseContent(actor: Actor, courseId: string) {
  const where = await manageWhere(actor);
  if (!where || !courseId) return null;
  return db.course.findFirst({
    where: { id: courseId, ...where },
    select: {
      id: true,
      name: true,
      sections: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          isPublished: true,
          lessons: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              title: true,
              summary: true,
              content: true,
              type: true,
              estimatedMinutes: true,
              isPublished: true,
              assets: { where: { confirmedAt: { not: null } }, orderBy: { createdAt: "asc" }, select: { id: true, originalName: true, uploaderId: true } },
            },
          },
        },
      },
    },
  });
}

export async function createChapter(actor: Actor, courseId: string, input: ChapterInput): Promise<ContentResult> {
  const parsed = chapterSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const where = await manageWhere(actor);
  if (!where) return { ok: false, message: NOT_FOUND_COURSE };
  return db.$transaction(async (tx) => {
    const course = await tx.course.findFirst({ where: { id: courseId, ...where }, select: { id: true } });
    if (!course) return { ok: false, message: NOT_FOUND_COURSE } as const;
    const last = await tx.courseSection.findFirst({ where: { institutionId: actor.institutionId, courseId: course.id }, orderBy: { order: "desc" }, select: { order: true } });
    const chapter = await tx.courseSection.create({
      data: { institutionId: actor.institutionId, courseId: course.id, title: parsed.data.title, description: parsed.data.description || null, order: (last?.order ?? -1) + 1 },
      select: { id: true },
    });
    await audit(tx, actor, "COURSE_CHAPTER_CREATED", "CourseSection", chapter.id, { courseId: course.id, title: parsed.data.title });
    return { ok: true, courseId: course.id, id: chapter.id } as const;
  });
}

export async function updateChapter(actor: Actor, chapterId: string, input: ChapterInput): Promise<ContentResult> {
  const parsed = chapterSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const where = await manageWhere(actor);
  if (!where) return { ok: false, message: NOT_FOUND_CHAPTER };
  return db.$transaction(async (tx) => {
    const chapter = await tx.courseSection.findFirst({ where: { id: chapterId, institutionId: actor.institutionId, course: where }, select: { id: true, courseId: true, title: true } });
    if (!chapter) return { ok: false, message: NOT_FOUND_CHAPTER } as const;
    await tx.courseSection.update({ where: { id: chapter.id }, data: { title: parsed.data.title, description: parsed.data.description || null } });
    await audit(tx, actor, "COURSE_CHAPTER_UPDATED", "CourseSection", chapter.id, { courseId: chapter.courseId, titleChanged: chapter.title !== parsed.data.title });
    return { ok: true, courseId: chapter.courseId, id: chapter.id } as const;
  });
}

export async function setChapterPublished(actor: Actor, chapterId: string, publish: boolean): Promise<ContentResult> {
  const where = await manageWhere(actor);
  if (!where) return { ok: false, message: NOT_FOUND_CHAPTER };
  return db.$transaction(async (tx) => {
    const chapter = await tx.courseSection.findFirst({ where: { id: chapterId, institutionId: actor.institutionId, course: where }, select: { id: true, courseId: true } });
    if (!chapter) return { ok: false, message: NOT_FOUND_CHAPTER } as const;
    await tx.courseSection.update({ where: { id: chapter.id }, data: { isPublished: publish } });
    await audit(tx, actor, publish ? "COURSE_CHAPTER_PUBLISHED" : "COURSE_CHAPTER_HIDDEN", "CourseSection", chapter.id, { courseId: chapter.courseId });
    return { ok: true, courseId: chapter.courseId, id: chapter.id } as const;
  });
}

/** Intercambia el capítulo con su vecino. En el borde no hace nada y responde ok. */
export async function moveChapter(actor: Actor, chapterId: string, direction: MoveDirection): Promise<ContentResult> {
  const where = await manageWhere(actor);
  if (!where) return { ok: false, message: NOT_FOUND_CHAPTER };
  return db.$transaction(async (tx) => {
    const chapter = await tx.courseSection.findFirst({ where: { id: chapterId, institutionId: actor.institutionId, course: where }, select: { id: true, courseId: true, order: true } });
    if (!chapter) return { ok: false, message: NOT_FOUND_CHAPTER } as const;
    const neighbour = await tx.courseSection.findFirst({
      where: { institutionId: actor.institutionId, courseId: chapter.courseId, order: direction === "up" ? { lt: chapter.order } : { gt: chapter.order } },
      orderBy: { order: direction === "up" ? "desc" : "asc" },
      select: { id: true, order: true },
    });
    if (neighbour) {
      // El índice único [courseId, order] impide el intercambio directo: se aparta uno a un valor
      // temporal negativo (ningún orden real lo es), se mueve el vecino y se coloca el primero.
      await tx.courseSection.update({ where: { id: chapter.id }, data: { order: -1 } });
      await tx.courseSection.update({ where: { id: neighbour.id }, data: { order: chapter.order } });
      await tx.courseSection.update({ where: { id: chapter.id }, data: { order: neighbour.order } });
      await renumberChapters(tx, actor.institutionId, chapter.courseId);
      await audit(tx, actor, "COURSE_CHAPTER_MOVED", "CourseSection", chapter.id, { courseId: chapter.courseId, direction });
    }
    return { ok: true, courseId: chapter.courseId, id: chapter.id } as const;
  });
}

/**
 * Borra el capítulo. Por las reglas de la base se borran con él sus lecciones y el avance
 * que los estudiantes registraron en ellas; los archivos adjuntos se desvinculan (no se borran).
 */
export async function deleteChapter(actor: Actor, chapterId: string): Promise<ContentResult> {
  const where = await manageWhere(actor);
  if (!where) return { ok: false, message: NOT_FOUND_CHAPTER };
  return db.$transaction(async (tx) => {
    const chapter = await tx.courseSection.findFirst({
      where: { id: chapterId, institutionId: actor.institutionId, course: where },
      select: { id: true, courseId: true, title: true, _count: { select: { lessons: true } } },
    });
    if (!chapter) return { ok: false, message: NOT_FOUND_CHAPTER } as const;
    await tx.courseSection.delete({ where: { id: chapter.id } });
    await renumberChapters(tx, actor.institutionId, chapter.courseId);
    await audit(tx, actor, "COURSE_CHAPTER_DELETED", "CourseSection", chapter.id, { courseId: chapter.courseId, title: chapter.title, lessonsDeleted: chapter._count.lessons });
    return { ok: true, courseId: chapter.courseId } as const;
  });
}

function lessonData(data: z.infer<typeof lessonSchema>) {
  return { title: data.title, summary: data.summary || null, type: data.type, content: data.content || null, estimatedMinutes: data.estimatedMinutes };
}

export async function createLesson(actor: Actor, chapterId: string, input: LessonInput): Promise<ContentResult> {
  const parsed = lessonSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const where = await manageWhere(actor);
  if (!where) return { ok: false, message: NOT_FOUND_CHAPTER };
  return db.$transaction(async (tx) => {
    const chapter = await tx.courseSection.findFirst({ where: { id: chapterId, institutionId: actor.institutionId, course: where }, select: { id: true, courseId: true } });
    if (!chapter) return { ok: false, message: NOT_FOUND_CHAPTER } as const;
    const last = await tx.lesson.findFirst({ where: { institutionId: actor.institutionId, sectionId: chapter.id }, orderBy: { order: "desc" }, select: { order: true } });
    const lesson = await tx.lesson.create({
      data: { institutionId: actor.institutionId, courseId: chapter.courseId, sectionId: chapter.id, order: (last?.order ?? -1) + 1, ...lessonData(parsed.data) },
      select: { id: true },
    });
    await audit(tx, actor, "COURSE_LESSON_CREATED", "Lesson", lesson.id, { courseId: chapter.courseId, chapterId: chapter.id, title: parsed.data.title, type: parsed.data.type });
    return { ok: true, courseId: chapter.courseId, id: lesson.id } as const;
  });
}

export async function updateLesson(actor: Actor, lessonId: string, input: LessonInput): Promise<ContentResult> {
  const parsed = lessonSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const where = await manageWhere(actor);
  if (!where) return { ok: false, message: NOT_FOUND_LESSON };
  return db.$transaction(async (tx) => {
    const lesson = await tx.lesson.findFirst({ where: { id: lessonId, institutionId: actor.institutionId, course: where }, select: { id: true, courseId: true, title: true, type: true } });
    if (!lesson) return { ok: false, message: NOT_FOUND_LESSON } as const;
    await tx.lesson.update({ where: { id: lesson.id }, data: lessonData(parsed.data) });
    await audit(tx, actor, "COURSE_LESSON_UPDATED", "Lesson", lesson.id, { courseId: lesson.courseId, titleChanged: lesson.title !== parsed.data.title, typeFrom: lesson.type, typeTo: parsed.data.type });
    return { ok: true, courseId: lesson.courseId, id: lesson.id } as const;
  });
}

export async function setLessonPublished(actor: Actor, lessonId: string, publish: boolean): Promise<ContentResult> {
  const where = await manageWhere(actor);
  if (!where) return { ok: false, message: NOT_FOUND_LESSON };
  return db.$transaction(async (tx) => {
    const lesson = await tx.lesson.findFirst({ where: { id: lessonId, institutionId: actor.institutionId, course: where }, select: { id: true, courseId: true } });
    if (!lesson) return { ok: false, message: NOT_FOUND_LESSON } as const;
    await tx.lesson.update({ where: { id: lesson.id }, data: { isPublished: publish } });
    await audit(tx, actor, publish ? "COURSE_LESSON_PUBLISHED" : "COURSE_LESSON_HIDDEN", "Lesson", lesson.id, { courseId: lesson.courseId });
    return { ok: true, courseId: lesson.courseId, id: lesson.id } as const;
  });
}

/** Intercambia la lección con su vecina dentro del mismo capítulo. En el borde no hace nada. */
export async function moveLesson(actor: Actor, lessonId: string, direction: MoveDirection): Promise<ContentResult> {
  const where = await manageWhere(actor);
  if (!where) return { ok: false, message: NOT_FOUND_LESSON };
  return db.$transaction(async (tx) => {
    const lesson = await tx.lesson.findFirst({ where: { id: lessonId, institutionId: actor.institutionId, course: where }, select: { id: true, courseId: true, sectionId: true, order: true } });
    if (!lesson) return { ok: false, message: NOT_FOUND_LESSON } as const;
    const neighbour = await tx.lesson.findFirst({
      where: { institutionId: actor.institutionId, sectionId: lesson.sectionId, order: direction === "up" ? { lt: lesson.order } : { gt: lesson.order } },
      orderBy: { order: direction === "up" ? "desc" : "asc" },
      select: { id: true, order: true },
    });
    if (neighbour) {
      // Mismo intercambio en tres pasos que en capítulos, por el índice único [sectionId, order].
      await tx.lesson.update({ where: { id: lesson.id }, data: { order: -1 } });
      await tx.lesson.update({ where: { id: neighbour.id }, data: { order: lesson.order } });
      await tx.lesson.update({ where: { id: lesson.id }, data: { order: neighbour.order } });
      await renumberLessons(tx, actor.institutionId, lesson.sectionId);
      await audit(tx, actor, "COURSE_LESSON_MOVED", "Lesson", lesson.id, { courseId: lesson.courseId, direction });
    }
    return { ok: true, courseId: lesson.courseId, id: lesson.id } as const;
  });
}

/** Borra la lección y, con ella, el avance registrado por los estudiantes. Los archivos adjuntos se desvinculan. */
export async function deleteLesson(actor: Actor, lessonId: string): Promise<ContentResult> {
  const where = await manageWhere(actor);
  if (!where) return { ok: false, message: NOT_FOUND_LESSON };
  return db.$transaction(async (tx) => {
    const lesson = await tx.lesson.findFirst({ where: { id: lessonId, institutionId: actor.institutionId, course: where }, select: { id: true, courseId: true, sectionId: true, title: true } });
    if (!lesson) return { ok: false, message: NOT_FOUND_LESSON } as const;
    await tx.lesson.delete({ where: { id: lesson.id } });
    await renumberLessons(tx, actor.institutionId, lesson.sectionId);
    await audit(tx, actor, "COURSE_LESSON_DELETED", "Lesson", lesson.id, { courseId: lesson.courseId, chapterId: lesson.sectionId, title: lesson.title });
    return { ok: true, courseId: lesson.courseId } as const;
  });
}
