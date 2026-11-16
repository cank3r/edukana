"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  createManualItem,
  deleteManualItem,
  saveCategories,
  saveGrade,
  setItemPublished,
  setupSimpleGrading,
  updateManualItem,
  type GradebookActor,
  type GradebookResult,
} from "@/server/assessment/gradebook";

export type GradebookActionState = { ok: boolean; message: string };

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();
/** Acepta coma o punto decimal. Vacío → null; texto que no es número → NaN. */
function numberOrNull(raw: string): number | null {
  if (!raw) return null;
  return /^\d+([.,]\d+)?$/.test(raw) ? Number(raw.replace(",", ".")) : Number.NaN;
}

/**
 * Autentica, ejecuta y refresca las dos pantallas del curso. El permiso sobre el curso lo
 * decide la lógica de `@/server/assessment/gradebook`, siempre dentro de la institución en sesión.
 */
async function run(name: string, courseId: string, work: (actor: GradebookActor) => Promise<GradebookResult>): Promise<GradebookActionState> {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return { ok: false, message: "Tu sesión terminó. Vuelve a iniciar sesión." };
  try {
    const result = await work({ id: user.id, institutionId: user.institutionId, role: user.role });
    if (result.ok && courseId) {
      revalidatePath(`/dashboard/aula/${courseId}/calificaciones`);
      revalidatePath(`/dashboard/aula/${courseId}/mis-notas`);
    }
    return result;
  } catch (error) {
    const correlationId = crypto.randomUUID();
    console.error(`${name} failed`, { correlationId, error });
    return { ok: false, message: `No se pudo guardar. Intenta de nuevo. Código: ${correlationId}` };
  }
}

/** Crea un período y la categoría «General» al 100 %. Campo: `courseId`. */
export async function setupSimpleGradingAction(_state: GradebookActionState, formData: FormData): Promise<GradebookActionState> {
  const courseId = text(formData, "courseId");
  return run("setupSimpleGradingAction", courseId, (actor) => setupSimpleGrading(actor, courseId));
}

/** Guarda las categorías de un período. Campos: `courseId`, `gradingPeriodId` y, repetidos por fila, `categoryId`, `name`, `weight`. */
export async function saveCategoriesAction(_state: GradebookActionState, formData: FormData): Promise<GradebookActionState> {
  const courseId = text(formData, "courseId");
  const ids = formData.getAll("categoryId").map(String);
  const names = formData.getAll("name").map(String);
  const weights = formData.getAll("weight").map((value) => numberOrNull(String(value).trim()));
  if (names.length !== ids.length || weights.length !== ids.length) return { ok: false, message: "Revisa las categorías e intenta de nuevo." };
  if (weights.some((weight) => weight === null)) return { ok: false, message: "Escribe el peso de cada categoría." };
  const categories = names.map((name, index) => ({ id: ids[index] || undefined, name, weight: weights[index] as number }));
  return run("saveCategoriesAction", courseId, (actor) =>
    saveCategories(actor, { courseId, gradingPeriodId: text(formData, "gradingPeriodId"), categories }),
  );
}

/** Crea o edita una actividad manual. Campos: `courseId`, `gradeItemId` (vacío al crear), `title`, `maxScore`, `categoryId`, `isPublished` (casilla, solo al crear). */
export async function saveManualItemAction(_state: GradebookActionState, formData: FormData): Promise<GradebookActionState> {
  const courseId = text(formData, "courseId");
  const gradeItemId = text(formData, "gradeItemId");
  const maxScore = numberOrNull(text(formData, "maxScore"));
  if (maxScore === null) return { ok: false, message: "Escribe el puntaje máximo." };
  const input = { title: text(formData, "title"), maxScore, categoryId: text(formData, "categoryId") };
  // La casilla «Mostrar la nota a los estudiantes» solo existe al crear (viene marcada).
  const isPublished = formData.get("isPublished") === "on";
  return run("saveManualItemAction", courseId, (actor) =>
    gradeItemId ? updateManualItem(actor, { ...input, gradeItemId }) : createManualItem(actor, { ...input, courseId, isPublished }),
  );
}

/** Borra una actividad manual y sus notas. Campos: `courseId`, `gradeItemId`. */
export async function deleteManualItemAction(_state: GradebookActionState, formData: FormData): Promise<GradebookActionState> {
  const courseId = text(formData, "courseId");
  return run("deleteManualItemAction", courseId, (actor) => deleteManualItem(actor, text(formData, "gradeItemId")));
}

/** Publica u oculta las notas de una actividad. Campos: `courseId`, `gradeItemId`, `published` ("true" | "false"). */
export async function setItemPublishedAction(_state: GradebookActionState, formData: FormData): Promise<GradebookActionState> {
  const courseId = text(formData, "courseId");
  return run("setItemPublishedAction", courseId, (actor) =>
    setItemPublished(actor, text(formData, "gradeItemId"), text(formData, "published") === "true"),
  );
}

/** Pone o corrige una nota. Campos: `courseId`, `gradeItemId`, `enrollmentId`, `score`, `feedback`, `isExcused` (casilla), `reason`. */
export async function saveGradeAction(_state: GradebookActionState, formData: FormData): Promise<GradebookActionState> {
  const courseId = text(formData, "courseId");
  const score = numberOrNull(text(formData, "score"));
  if (Number.isNaN(score)) return { ok: false, message: "La nota debe ser un número, por ejemplo 85 o 8,5." };
  return run("saveGradeAction", courseId, (actor) =>
    saveGrade(actor, {
      gradeItemId: text(formData, "gradeItemId"),
      enrollmentId: text(formData, "enrollmentId"),
      score,
      feedback: text(formData, "feedback"),
      isExcused: formData.get("isExcused") === "on",
      reason: text(formData, "reason"),
    }),
  );
}
