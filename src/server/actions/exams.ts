"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { startExamAttempt, submitExamAttempt, type AttemptQuestion } from "@/server/exams";

export type StartExamState =
  | { ok: true; attemptId: string; expiresAt: string; resumed: boolean; questions: AttemptQuestion[] }
  | { ok: false; message: string };
export type SubmitExamState = { ok: boolean; message: string };

async function requireParticipant() {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId || user.role !== "STUDENT") return null;
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  return capabilities.has("course.participate") ? { id: user.id, institutionId: user.institutionId } : null;
}

/** Botón "Iniciar examen". Campo: `examId`. Devuelve las preguntas y la hora límite que fija el servidor. */
export async function startExamAttemptAction(_state: StartExamState, formData: FormData): Promise<StartExamState> {
  const actor = await requireParticipant();
  if (!actor) return { ok: false, message: "No tienes permiso para presentar este examen." };
  try {
    const result = await startExamAttempt(actor, String(formData.get("examId") ?? ""));
    if (!result.ok) return { ok: false, message: result.message };
    const { attemptId, expiresAt, resumed, questions } = result;
    return { ok: true, attemptId, expiresAt: expiresAt.toISOString(), resumed, questions };
  } catch (error) {
    const correlationId = crypto.randomUUID();
    console.error("startExamAttemptAction failed", { correlationId, error });
    return { ok: false, message: `No se pudo iniciar el examen. Intenta de nuevo. Código: ${correlationId}` };
  }
}

/** Botón "Enviar examen". Campos: `attemptId` y un `question_<bankItemId>` por pregunta. */
export async function submitExamAttemptAction(_state: SubmitExamState, formData: FormData): Promise<SubmitExamState> {
  const actor = await requireParticipant();
  if (!actor) return { ok: false, message: "No tienes permiso para presentar este examen." };
  const attemptId = String(formData.get("attemptId") ?? "");
  const responses: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("question_") && typeof value === "string") responses[key.slice("question_".length)] = value;
  }
  try {
    const result = await submitExamAttempt(actor, attemptId, responses);
    const attempt = await db.examAttempt.findFirst({
      where: { id: attemptId, studentId: actor.id, institutionId: actor.institutionId },
      select: { exam: { select: { courseId: true } } },
    });
    if (attempt) revalidatePath(`/dashboard/aula/${attempt.exam.courseId}`);
    if (!result.ok) return { ok: false, message: result.message };
    return {
      ok: true,
      message:
        result.status === "GRADED"
          ? `Intento ${result.attemptNumber} calificado: ${result.score}/${result.maxScore}.`
          : `Intento ${result.attemptNumber} enviado. Tu docente revisará las respuestas abiertas.`,
    };
  } catch (error) {
    const correlationId = crypto.randomUUID();
    console.error("submitExamAttemptAction failed", { correlationId, error });
    return { ok: false, message: `No se pudo enviar el examen. Intenta de nuevo. Código: ${correlationId}` };
  }
}
