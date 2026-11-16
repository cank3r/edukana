"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  createChapter,
  createLesson,
  deleteChapter,
  deleteLesson,
  moveChapter,
  moveLesson,
  setChapterPublished,
  setLessonPublished,
  updateChapter,
  updateLesson,
  type ContentResult,
} from "@/server/courses/content";
import type { EdukanaRole } from "@/types/next-auth";

export type ContentActionState = { ok: boolean; message: string };

type Actor = { id: string; institutionId: string; role: EdukanaRole };

// El permiso sobre el curso concreto lo decide `src/server/courses/content.ts`; aquí solo se exige sesión.
async function currentActor(): Promise<Actor | null> {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return null;
  return { id: user.id, institutionId: user.institutionId, role: user.role };
}

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

async function run(name: string, okMessage: string, work: (actor: Actor) => Promise<ContentResult>): Promise<ContentActionState> {
  const actor = await currentActor();
  if (!actor) return { ok: false, message: "Tu sesión terminó. Vuelve a iniciar sesión." };
  try {
    const result = await work(actor);
    if (!result.ok) return result;
    revalidatePath(`/dashboard/aula/${result.courseId}`, "layout");
    return { ok: true, message: okMessage };
  } catch (error) {
    const correlationId = crypto.randomUUID();
    console.error(`${name} failed`, { correlationId, error });
    return { ok: false, message: `No se pudo guardar. Intenta de nuevo. Código: ${correlationId}` };
  }
}

/** Crea o corrige un capítulo. Campos: `courseId` (al crear) o `chapterId` (al editar), `title`, `description`. */
export async function saveChapterAction(_state: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const chapterId = text(formData, "chapterId");
  const input = { title: text(formData, "title"), description: text(formData, "description") };
  return run("saveChapterAction", chapterId ? "Capítulo guardado." : "Capítulo agregado.", (actor) =>
    chapterId ? updateChapter(actor, chapterId, input) : createChapter(actor, text(formData, "courseId"), input),
  );
}

/** Crea o corrige una lección. Campos: `chapterId` (al crear) o `lessonId` (al editar), `title`, `summary`, `type`, `content`, `videoUrl`, `estimatedMinutes`. */
export async function saveLessonAction(_state: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const lessonId = text(formData, "lessonId");
  const input = {
    title: text(formData, "title"),
    summary: text(formData, "summary"),
    type: text(formData, "type"),
    content: text(formData, "content"),
    videoUrl: text(formData, "videoUrl"),
    estimatedMinutes: text(formData, "estimatedMinutes") || "10",
  };
  return run("saveLessonAction", lessonId ? "Lección guardada." : "Lección agregada.", (actor) =>
    lessonId ? updateLesson(actor, lessonId, input) : createLesson(actor, text(formData, "chapterId"), input),
  );
}

/**
 * Subir, bajar, publicar, ocultar o borrar un capítulo o una lección.
 * Campos: `kind` ("chapter" | "lesson"), `id` y `op` ("up" | "down" | "publish" | "hide" | "delete").
 */
export async function contentItemAction(_state: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const kind = text(formData, "kind");
  const id = text(formData, "id");
  const op = text(formData, "op");
  if (kind !== "chapter" && kind !== "lesson") return { ok: false, message: "Acción no válida." };
  const isChapter = kind === "chapter";
  const subject = isChapter ? "Capítulo" : "Lección";
  const end = isChapter ? "o" : "a";
  if (op === "up" || op === "down") {
    return run("contentItemAction", `${subject} movid${end} hacia ${op === "up" ? "arriba" : "abajo"}.`, (actor) =>
      isChapter ? moveChapter(actor, id, op) : moveLesson(actor, id, op),
    );
  }
  if (op === "publish" || op === "hide") {
    const publish = op === "publish";
    const message = publish ? `${subject} publicad${end}.` : `${subject} ocult${end}: los estudiantes ya no l${end} ven.`;
    return run("contentItemAction", message, (actor) => (isChapter ? setChapterPublished(actor, id, publish) : setLessonPublished(actor, id, publish)));
  }
  if (op === "delete") {
    return run("contentItemAction", `${subject} borrad${end}.`, (actor) => (isChapter ? deleteChapter(actor, id) : deleteLesson(actor, id)));
  }
  return { ok: false, message: "Acción no válida." };
}
