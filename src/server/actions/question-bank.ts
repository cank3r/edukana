"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createQuestion, deleteQuestion, updateQuestion, type Manager, type QuestionInput, type QuestionResult } from "@/server/assessment/question-bank";

export type QuestionActionState = { ok: boolean; message: string };

async function currentManager(): Promise<Manager | null> {
  const user = (await auth())?.user;
  return user?.id && user.institutionId ? { id: user.id, institutionId: user.institutionId, role: user.role } : null;
}

const SESSION_ENDED: QuestionActionState = { ok: false, message: "Tu sesión terminó. Vuelve a iniciar sesión." };

function failure(name: string, error: unknown): QuestionActionState {
  const correlationId = crypto.randomUUID();
  console.error(`${name} failed`, { correlationId, error });
  return { ok: false, message: `No se pudo completar. Intenta de nuevo. Código: ${correlationId}` };
}

function readQuestion(formData: FormData): QuestionInput {
  const text = (key: string) => String(formData.get(key) ?? "");
  const type = text("type");
  const points = text("points").trim();
  return {
    type,
    prompt: text("prompt"),
    options: formData.getAll("option").map(String),
    correctIndex: text("correctIndex") === "" ? undefined : Number(text("correctIndex")),
    answer: type === "TRUE_FALSE" ? text("truth") : text("expected"),
    explanation: text("explanation"),
    points: points === "" ? Number.NaN : Number(points.replace(",", ".")),
  };
}

function finish(result: QuestionResult, message: string): QuestionActionState {
  if (!result.ok) return result;
  revalidatePath(`/dashboard/aula/${result.courseId}`, "layout");
  return { ok: true, message };
}

/**
 * Guarda una pregunta. Campos: `courseId` (al crear) o `questionId` (al editar), `type`, `prompt`,
 * `option` (varios) y `correctIndex` para selección múltiple, `truth` para verdadero o falso,
 * `expected` para respuesta corta, `explanation` y `points`.
 */
export async function saveQuestionAction(_state: QuestionActionState, formData: FormData): Promise<QuestionActionState> {
  const actor = await currentManager();
  if (!actor) return SESSION_ENDED;
  try {
    const questionId = String(formData.get("questionId") ?? "");
    const input = readQuestion(formData);
    if (questionId) return finish(await updateQuestion(actor, questionId, input), "Pregunta guardada.");
    return finish(await createQuestion(actor, String(formData.get("courseId") ?? ""), input), "Pregunta agregada al banco.");
  } catch (error) {
    return failure("saveQuestionAction", error);
  }
}

/** Borra una pregunta que no está en ningún examen. Campo: `questionId`. */
export async function deleteQuestionAction(_state: QuestionActionState, formData: FormData): Promise<QuestionActionState> {
  const actor = await currentManager();
  if (!actor) return SESSION_ENDED;
  try {
    return finish(await deleteQuestion(actor, String(formData.get("questionId") ?? "")), "Pregunta borrada.");
  } catch (error) {
    return failure("deleteQuestionAction", error);
  }
}
