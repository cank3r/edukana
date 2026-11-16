"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import type { QuestionInput } from "@/server/assessment/question-bank";
import { setInstitutionAiEnabled, type AiActor } from "@/server/ai/access";
import { askCourse, generateQuestionDrafts, saveReviewedQuestions } from "@/server/ai/course";
import type { GeneratedQuestion } from "@/server/ai/parse";

const SESSION_ENDED = "Tu sesión terminó. Vuelve a iniciar sesión.";

async function currentActor(): Promise<AiActor | null> {
  const user = (await auth())?.user;
  return user?.id && user.institutionId ? { id: user.id, institutionId: user.institutionId, role: user.role } : null;
}

function failure(name: string, error: unknown) {
  const correlationId = crypto.randomUUID();
  console.error(`${name} failed`, { correlationId, error: error instanceof Error ? error.message : "unknown" });
  return { ok: false as const, message: `No se pudo completar. Intenta de nuevo. Código: ${correlationId}` };
}

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "");

export type GenerateState = { ok: boolean; message: string; sourceTitle?: string; questions?: GeneratedQuestion[]; runId?: string };

/** Pide a la IA preguntas propuestas. Campos: `courseId`, `source` («lesson:…» o «chapter:…»), `count`, `kind`. No guarda nada. */
export async function generateQuestionsAction(_state: GenerateState, formData: FormData): Promise<GenerateState> {
  const actor = await currentActor();
  if (!actor) return { ok: false, message: SESSION_ENDED };
  try {
    const result = await generateQuestionDrafts(actor, {
      courseId: text(formData, "courseId"),
      source: text(formData, "source"),
      count: Number(text(formData, "count")),
      kind: text(formData, "kind"),
    });
    if (!result.ok) return result;
    const total = result.questions.length;
    return {
      ok: true,
      message: `La IA propuso ${total === 1 ? "1 pregunta" : `${total} preguntas`}. Revísalas antes de guardarlas.`,
      sourceTitle: result.sourceTitle,
      questions: result.questions,
      runId: crypto.randomUUID(),
    };
  } catch (error) {
    return failure("generateQuestionsAction", error);
  }
}

export type SaveReviewedState = { ok: boolean; message: string; saved?: number };

function readDrafts(raw: string): QuestionInput[] | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return null;
    return value.map((item) => {
      const draft = (item ?? {}) as Record<string, unknown>;
      return {
        type: String(draft.type ?? ""),
        prompt: String(draft.prompt ?? ""),
        options: Array.isArray(draft.options) ? draft.options.map(String) : undefined,
        correctIndex: typeof draft.correctIndex === "number" ? draft.correctIndex : undefined,
        answer: typeof draft.answer === "string" ? draft.answer : undefined,
        explanation: typeof draft.explanation === "string" ? draft.explanation : undefined,
        points: typeof draft.points === "number" ? draft.points : Number(draft.points),
      };
    });
  } catch {
    return null;
  }
}

/** Guarda en el banco las preguntas revisadas. Campos: `courseId` y `questions` (lista en JSON). */
export async function saveReviewedQuestionsAction(_state: SaveReviewedState, formData: FormData): Promise<SaveReviewedState> {
  const actor = await currentActor();
  if (!actor) return { ok: false, message: SESSION_ENDED };
  try {
    const drafts = readDrafts(text(formData, "questions"));
    if (!drafts) return { ok: false, message: "No pudimos leer las preguntas. Vuelve a generarlas." };
    const result = await saveReviewedQuestions(actor, text(formData, "courseId"), drafts);
    if (!result.ok) return result;
    revalidatePath(`/dashboard/aula/${result.courseId}`, "layout");
    return { ok: true, saved: result.saved, message: result.saved === 1 ? "Se guardó 1 pregunta en el banco del curso." : `Se guardaron ${result.saved} preguntas en el banco del curso.` };
  } catch (error) {
    return failure("saveReviewedQuestionsAction", error);
  }
}

export type AskState = { ok: boolean; message: string; found?: boolean; answer?: string; sources?: { id: string; title: string }[]; question?: string };

/** «Pregúntale al curso». Campos: `courseId`, `lessonId`, `question`. No guarda la conversación. */
export async function askCourseAction(_state: AskState, formData: FormData): Promise<AskState> {
  const actor = await currentActor();
  if (!actor) return { ok: false, message: SESSION_ENDED };
  const question = text(formData, "question");
  try {
    const result = await askCourse(actor, { courseId: text(formData, "courseId"), lessonId: text(formData, "lessonId") || undefined, question });
    if (!result.ok) return { ...result, question };
    return { ok: true, message: "", found: result.found, answer: result.answer, sources: result.sources, question };
  } catch (error) {
    return { ...failure("askCourseAction", error), question };
  }
}

export type AiSettingState = { ok: boolean; message: string };

/** Enciende o apaga la IA para toda la institución. Campo: `enabled` («1» o «0»). */
export async function setInstitutionAiAction(_state: AiSettingState, formData: FormData): Promise<AiSettingState> {
  const actor = await currentActor();
  if (!actor) return { ok: false, message: SESSION_ENDED };
  try {
    const enabled = text(formData, "enabled") === "1";
    const result = await setInstitutionAiEnabled(actor, enabled);
    if (!result.ok) return result;
    revalidatePath("/dashboard", "layout");
    return { ok: true, message: enabled ? "Asistente de IA encendido." : "Asistente de IA apagado. Nadie de tu institución podrá usarlo." };
  } catch (error) {
    return failure("setInstitutionAiAction", error);
  }
}
