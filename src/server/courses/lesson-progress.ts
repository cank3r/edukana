import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { courseWhereForScope, resolveCourseWriteScope } from "@/lib/course-scope";
import type { EdukanaRole } from "@/types/next-auth";

type Actor = { id: string; institutionId: string; role: EdukanaRole };
type LessonRef = { courseId: string; lessonId: string };

export type VideoLink =
  | { kind: "embed"; provider: "YouTube" | "Vimeo"; src: string }
  | { kind: "link"; href: string };

/**
 * Decide cómo mostrar el enlace de una lección de video.
 * Solo se incrusta YouTube o Vimeo, y la dirección del reproductor se arma aquí con el
 * código del video ya validado: nunca se usa tal cual lo que escribió el docente.
 * Otro enlace https se ofrece como botón; cualquier otra cosa no es un enlace.
 */
export function parseVideoLink(content: string | null | undefined): VideoLink | null {
  const raw = (content ?? "").trim();
  if (!raw || /\s/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  let youtubeId: string | null = null;
  if (host === "youtu.be") youtubeId = parts[0] ?? null;
  else if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    if (parts[0] === "watch") youtubeId = url.searchParams.get("v");
    else if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") youtubeId = parts[1] ?? null;
  }
  if (youtubeId && /^[A-Za-z0-9_-]{11}$/.test(youtubeId)) {
    return { kind: "embed", provider: "YouTube", src: `https://www.youtube-nocookie.com/embed/${youtubeId}` };
  }

  let vimeoId: string | null = null;
  if (host === "vimeo.com") vimeoId = parts[0] ?? null;
  else if (host === "player.vimeo.com" && parts[0] === "video") vimeoId = parts[1] ?? null;
  if (vimeoId && /^\d{6,12}$/.test(vimeoId)) {
    return { kind: "embed", provider: "Vimeo", src: `https://player.vimeo.com/video/${vimeoId}` };
  }

  return { kind: "link", href: url.toString() };
}

export type LessonView = {
  mode: "student" | "preview";
  /** El estudiante puede marcar avance (matrícula activa). */
  canComplete: boolean;
  course: { id: string; name: string };
  lesson: {
    id: string;
    title: string;
    summary: string | null;
    content: string | null;
    /** Video además del texto, ya normalizado (ver `src/lib/lesson-video.ts`). */
    videoUrl: string | null;
    type: "TEXT" | "VIDEO" | "DOCUMENT" | "ACTIVITY";
    estimatedMinutes: number;
    sectionTitle: string;
    isPublished: boolean;
    assets: { id: string; name: string; kind: string; mimeType: string }[];
  };
  outline: { id: string; title: string; lessons: { id: string; title: string; completed: boolean; current: boolean }[] }[];
  totalLessons: number;
  completedLessons: number;
  completedAt: Date | null;
  previousLessonId: string | null;
  nextLessonId: string | null;
};

const publishedLesson = { isPublished: true, section: { isPublished: true } } as const;

/** Capítulos y lecciones publicados, en el orden en que se estudian. */
async function publishedOutline(client: Prisma.TransactionClient, institutionId: string, courseId: string) {
  return client.courseSection.findMany({
    where: { institutionId, courseId, isPublished: true },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: {
      id: true,
      title: true,
      lessons: { where: { isPublished: true }, orderBy: [{ order: "asc" }, { id: "asc" }], select: { id: true, title: true } },
    },
  });
}

/** Porcentaje con dos decimales; sin lecciones publicadas el avance es 0. */
export function progressPercentOf(completedLessons: number, totalLessons: number) {
  return totalLessons ? Math.round((completedLessons / totalLessons) * 10000) / 100 : 0;
}

/**
 * Recalcula el avance de todas las matrículas activas del curso con las lecciones publicadas
 * de ahora. Se llama dentro de la misma transacción que publica, oculta, crea o borra contenido,
 * para que «20 % · 1 de 6» nunca quede desfasado. Las matrículas completadas no se tocan.
 */
export async function recalculateCourseProgress(tx: Prisma.TransactionClient, institutionId: string, courseId: string) {
  const sections = await publishedOutline(tx, institutionId, courseId);
  const ordered = sections.flatMap((section) => section.lessons.map((item) => item.id));
  const enrollments = await tx.enrollment.findMany({
    where: { institutionId, courseId, status: "ACTIVE" },
    select: { id: true, progressPercent: true },
  });
  if (enrollments.length === 0) return;
  const done = ordered.length
    ? await tx.lessonProgress.groupBy({
        by: ["enrollmentId"],
        where: { institutionId, enrollmentId: { in: enrollments.map((row) => row.id) }, completed: true, lessonId: { in: ordered } },
        _count: { _all: true },
      })
    : [];
  const completedBy = new Map(done.map((row) => [row.enrollmentId, row._count._all]));
  // Una actualización por porcentaje distinto, no una por estudiante.
  const byPercent = new Map<number, string[]>();
  for (const row of enrollments) {
    const percent = progressPercentOf(completedBy.get(row.id) ?? 0, ordered.length);
    if (percent === row.progressPercent) continue;
    byPercent.set(percent, [...(byPercent.get(percent) ?? []), row.id]);
  }
  for (const [progressPercent, ids] of byPercent) {
    await tx.enrollment.updateMany({ where: { id: { in: ids }, institutionId }, data: { progressPercent } });
  }
}

async function manageableCourse(actor: Actor, courseId: string) {
  const capabilities = await getEffectiveCapabilities(actor.institutionId, actor.role);
  const where = courseWhereForScope(actor.institutionId, resolveCourseWriteScope(actor, capabilities));
  if (!where) return null;
  return db.course.findFirst({ where: { AND: [{ id: courseId }, where] }, select: { id: true, name: true } });
}

/**
 * Todo lo que la pantalla de la lección necesita, o `null` si la persona no puede verla.
 * Estudiante: matrícula activa o completada, curso publicado y solo lo publicado.
 * Quien gestiona el curso: vista previa, sin avance.
 */
export async function getLessonView(actor: Actor, ref: LessonRef): Promise<LessonView | null> {
  if (!actor.institutionId || !ref.courseId || !ref.lessonId) return null;

  let mode: LessonView["mode"];
  let course: { id: string; name: string } | null;
  let enrollment: { id: string; status: string } | null = null;

  if (actor.role === "STUDENT") {
    const capabilities = await getEffectiveCapabilities(actor.institutionId, actor.role);
    if (!capabilities.has("course.view")) return null;
    mode = "student";
    course = await db.course.findFirst({
      where: { id: ref.courseId, institutionId: actor.institutionId, isPublished: true, archivedAt: null },
      select: { id: true, name: true },
    });
    if (!course) return null;
    enrollment = await db.enrollment.findFirst({
      where: { studentId: actor.id, courseId: course.id, status: { in: ["ACTIVE", "COMPLETED"] } },
      select: { id: true, status: true },
    });
    if (!enrollment) return null;
  } else {
    mode = "preview";
    course = await manageableCourse(actor, ref.courseId);
    if (!course) return null;
  }

  const lesson = await db.lesson.findFirst({
    where: {
      id: ref.lessonId,
      institutionId: actor.institutionId,
      courseId: course.id,
      ...(mode === "student" ? publishedLesson : {}),
    },
    select: {
      id: true,
      title: true,
      summary: true,
      content: true,
      videoUrl: true,
      type: true,
      estimatedMinutes: true,
      isPublished: true,
      section: { select: { title: true, isPublished: true } },
      assets: {
        where: { institutionId: actor.institutionId, confirmedAt: { not: null }, visibility: { not: "PRIVATE" } },
        orderBy: { createdAt: "asc" },
        select: { id: true, originalName: true, kind: true, mimeType: true },
      },
    },
  });
  if (!lesson) return null;

  const sections = await publishedOutline(db, actor.institutionId, course.id);
  const ordered = sections.flatMap((section) => section.lessons.map((item) => item.id));
  const progress = enrollment
    ? await db.lessonProgress.findMany({
        where: { enrollmentId: enrollment.id, institutionId: actor.institutionId, completed: true, lessonId: { in: ordered } },
        select: { lessonId: true, completedAt: true },
      })
    : [];
  const done = new Map(progress.map((row) => [row.lessonId, row.completedAt]));
  const index = ordered.indexOf(lesson.id);

  return {
    mode,
    canComplete: mode === "student" && enrollment?.status === "ACTIVE",
    course,
    lesson: {
      id: lesson.id,
      title: lesson.title,
      summary: lesson.summary,
      content: lesson.content,
      videoUrl: lesson.videoUrl,
      type: lesson.type,
      estimatedMinutes: lesson.estimatedMinutes,
      sectionTitle: lesson.section.title,
      isPublished: lesson.isPublished && lesson.section.isPublished,
      assets: lesson.assets.map((asset) => ({ id: asset.id, name: asset.originalName, kind: asset.kind, mimeType: asset.mimeType })),
    },
    outline: sections
      .filter((section) => section.lessons.length > 0)
      .map((section) => ({
        id: section.id,
        title: section.title,
        lessons: section.lessons.map((item) => ({ id: item.id, title: item.title, completed: done.has(item.id), current: item.id === lesson.id })),
      })),
    totalLessons: ordered.length,
    completedLessons: done.size,
    completedAt: done.get(lesson.id) ?? null,
    previousLessonId: index > 0 ? ordered[index - 1] : null,
    nextLessonId: index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null,
  };
}

export type LessonCompletionResult =
  | { ok: true; progressPercent: number; completedLessons: number; totalLessons: number; nextLessonId: string | null }
  | { ok: false; message: string };

const UNAVAILABLE = "Esta lección no está disponible para ti.";

/**
 * Marca (o desmarca) una lección como completada para el estudiante que actúa y
 * recalcula el avance del curso en la misma transacción. No cambia el estado de la matrícula.
 * Repetir la misma marca no cambia nada: conserva la fecha original.
 */
export async function setLessonCompleted(actor: Actor, input: LessonRef & { completed: boolean }): Promise<LessonCompletionResult> {
  if (actor.role !== "STUDENT" || !actor.institutionId) return { ok: false, message: UNAVAILABLE };
  const capabilities = await getEffectiveCapabilities(actor.institutionId, actor.role);
  if (!capabilities.has("course.participate")) return { ok: false, message: UNAVAILABLE };

  return db.$transaction(async (tx): Promise<LessonCompletionResult> => {
    const lesson = await tx.lesson.findFirst({
      where: {
        id: input.lessonId,
        institutionId: actor.institutionId,
        courseId: input.courseId,
        ...publishedLesson,
        course: { institutionId: actor.institutionId, isPublished: true, archivedAt: null },
      },
      select: { id: true, courseId: true },
    });
    if (!lesson) return { ok: false, message: UNAVAILABLE };

    const enrollment = await tx.enrollment.findFirst({
      where: { studentId: actor.id, courseId: lesson.courseId },
      select: { id: true, status: true },
    });
    if (!enrollment || (enrollment.status !== "ACTIVE" && enrollment.status !== "COMPLETED")) return { ok: false, message: UNAVAILABLE };
    if (enrollment.status !== "ACTIVE") return { ok: false, message: "Este curso ya terminó: puedes consultarlo, pero tu avance ya no cambia." };
    // Pone en fila las marcas del mismo estudiante en el curso para que el porcentaje no se pise.
    await tx.$queryRaw`SELECT id FROM enrollments WHERE id = ${enrollment.id} FOR UPDATE`;

    const key = { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId: lesson.id } };
    const existing = await tx.lessonProgress.findUnique({ where: key, select: { completed: true } });
    if (input.completed && !existing) {
      await tx.lessonProgress.create({
        data: { institutionId: actor.institutionId, enrollmentId: enrollment.id, lessonId: lesson.id, completed: true, completedAt: new Date() },
      });
    } else if (input.completed && existing && !existing.completed) {
      await tx.lessonProgress.update({ where: key, data: { completed: true, completedAt: new Date() } });
    } else if (!input.completed && existing?.completed) {
      await tx.lessonProgress.update({ where: key, data: { completed: false, completedAt: null } });
    }

    const sections = await publishedOutline(tx, actor.institutionId, lesson.courseId);
    const ordered = sections.flatMap((section) => section.lessons.map((item) => item.id));
    const completedLessons = await tx.lessonProgress.count({
      where: { enrollmentId: enrollment.id, completed: true, lessonId: { in: ordered } },
    });
    const totalLessons = ordered.length;
    const progressPercent = progressPercentOf(completedLessons, totalLessons);
    await tx.enrollment.update({ where: { id: enrollment.id }, data: { progressPercent } });

    const index = ordered.indexOf(lesson.id);
    return {
      ok: true,
      progressPercent,
      completedLessons,
      totalLessons,
      nextLessonId: index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null,
    };
  });
}
