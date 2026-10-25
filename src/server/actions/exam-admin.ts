"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createExam, deleteExam, reviewExamAttempt, setExamPublished, updateExam, type ExamInput, type ExamResult, type ReviewInput } from "@/server/assessment/exam-admin";
import type { Manager } from "@/server/assessment/question-bank";

export type ExamActionState = { ok: boolean; message: string; examId?: string };

async function currentManager(): Promise<Manager | null> {
  const user = (await auth())?.user;
  return user?.id && user.institutionId ? { id: user.id, institutionId: user.institutionId, role: user.role } : null;
}

const SESSION_ENDED: ExamActionState = { ok: false, message: "Tu sesión terminó. Vuelve a iniciar sesión." };

function failure(name: string, error: unknown): ExamActionState {
  const correlationId = crypto.randomUUID();
  console.error(`${name} failed`, { correlationId, error });
  return { ok: false, message: `No se pudo completar. Intenta de nuevo. Código: ${correlationId}` };
}

function finish(result: ExamResult): ExamActionState {
  if (!result.ok) return result;
  revalidatePath(`/dashboard/aula/${result.courseId}`, "layout");
  return { ok: true, message: result.message, examId: result.id };
}

const number = (value: unknown) => (typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value.replace(",", ".")) : Number.NaN);

/** Lee el formulario del examen. El campo `payload` lleva en JSON lo que la pantalla armó. */
function readExam(formData: FormData): ExamInput | null {
  try {
    const raw = JSON.parse(String(formData.get("payload") ?? "")) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") return null;
    const questions = Array.isArray(raw.questions) ? (raw.questions as Array<Record<string, unknown>>) : [];
    const duration = raw.durationMinutes;
    return {
      title: String(raw.title ?? ""),
      instructions: String(raw.instructions ?? ""),
      questions: questions.map((question) => ({ bankItemId: String(question?.bankItemId ?? ""), points: number(question?.points) })),
      durationMinutes: duration === null || duration === undefined || duration === "" ? null : number(duration),
      maxAttempts: number(raw.maxAttempts),
      opensAt: String(raw.opensAt ?? ""),
      closesAt: String(raw.closesAt ?? ""),
      showReview: raw.showReview === true,
      gradeCategoryId: String(raw.gradeCategoryId ?? "") || undefined,
    };
  } catch {
    return null;
  }
}

/** Crea (campo `courseId`) o corrige (campo `examId`) un examen. Campo `payload`: ver `readExam`. */
export async function saveExamAction(_state: ExamActionState, formData: FormData): Promise<ExamActionState> {
  const actor = await currentManager();
  if (!actor) return SESSION_ENDED;
  const input = readExam(formData);
  if (!input) return { ok: false, message: "No pudimos leer el formulario. Recarga la página e intenta de nuevo." };
  try {
    const examId = String(formData.get("examId") ?? "");
    if (examId) return finish(await updateExam(actor, examId, input));
    return finish(await createExam(actor, String(formData.get("courseId") ?? ""), input));
  } catch (error) {
    return failure("saveExamAction", error);
  }
}

/** Publica u oculta. Campos: `examId` y `publish` ("true" | "false"). */
export async function setExamPublishedAction(_state: ExamActionState, formData: FormData): Promise<ExamActionState> {
  const actor = await currentManager();
  if (!actor) return SESSION_ENDED;
  try {
    return finish(await setExamPublished(actor, String(formData.get("examId") ?? ""), formData.get("publish") === "true"));
  } catch (error) {
    return failure("setExamPublishedAction", error);
  }
}

/** Borra el examen. Campos: `examId` y `reason` (obligatorio si ya tiene intentos). */
export async function deleteExamAction(_state: ExamActionState, formData: FormData): Promise<ExamActionState> {
  const actor = await currentManager();
  if (!actor) return SESSION_ENDED;
  try {
    return finish(await deleteExam(actor, String(formData.get("examId") ?? ""), String(formData.get("reason") ?? "")));
  } catch (error) {
    return failure("deleteExamAction", error);
  }
}

/** Revisión de respuestas cortas. Campos: `attemptId` y, por cada respuesta, `score_<id>` y `feedback_<id>`. */
export async function reviewExamAttemptAction(_state: ExamActionState, formData: FormData): Promise<ExamActionState> {
  const actor = await currentManager();
  if (!actor) return SESSION_ENDED;
  const answers: ReviewInput["answers"] = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("score_") || typeof value !== "string") continue;
    const id = key.slice("score_".length);
    answers[id] = { score: value.trim() === "" ? null : number(value), feedback: String(formData.get(`feedback_${id}`) ?? "") };
  }
  try {
    return finish(await reviewExamAttempt(actor, String(formData.get("attemptId") ?? ""), { answers }));
  } catch (error) {
    return failure("reviewExamAttemptAction", error);
  }
}
