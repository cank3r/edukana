import { z } from "zod";

/**
 * Lectura y validación de lo que devuelve la IA. Nada de lo que responde el modelo se usa
 * sin pasar por aquí: si no cumple el formato, se rechaza con un mensaje que entiende el docente.
 */

export const MIN_GENERATED = 3;
export const MAX_GENERATED = 10;

export type GeneratedQuestion =
  | { type: "MULTIPLE_CHOICE"; prompt: string; options: string[]; correctIndex: number; explanation: string }
  | { type: "SHORT_ANSWER"; prompt: string; answer: string; explanation: string };

export type ParseResult<T> = { ok: true; data: T } | { ok: false; message: string };

const text = (max: number) => z.string().trim().min(1).max(max);

const multipleChoice = z
  .object({
    type: z.literal("MULTIPLE_CHOICE"),
    prompt: text(2000),
    options: z.array(text(500)).min(2).max(6),
    correctIndex: z.number().int().min(0),
    explanation: z.string().trim().max(2000).optional().default(""),
  })
  .refine((question) => question.correctIndex < question.options.length, { message: "la respuesta correcta no es una de las opciones", path: ["correctIndex"] })
  .refine((question) => new Set(question.options.map((option) => option.toLowerCase())).size === question.options.length, { message: "tiene opciones repetidas", path: ["options"] });

const shortAnswer = z.object({
  type: z.literal("SHORT_ANSWER"),
  prompt: text(2000),
  answer: text(2000),
  explanation: z.string().trim().max(2000).optional().default(""),
});

const questionsSchema = z.object({ questions: z.array(z.discriminatedUnion("type", [multipleChoice, shortAnswer])).min(1) });

const answerSchema = z.object({
  found: z.boolean(),
  answer: z.string().trim().max(4000),
  lessonIds: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
});

export type CourseAnswer = z.infer<typeof answerSchema>;

const UNREADABLE = "La IA respondió en un formato que no pudimos leer. Intenta de nuevo.";

/** Saca el objeto JSON de la respuesta aunque venga entre ``` o con texto alrededor. */
export function extractJson(raw: string): unknown {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

function describeIssue(issue: z.core.$ZodIssue | undefined): string {
  if (!issue) return "";
  const index = issue.path[0] === "questions" && typeof issue.path[1] === "number" ? issue.path[1] + 1 : null;
  const field = issue.path.at(-1);
  const what =
    issue.message && !issue.message.startsWith("Invalid") && !issue.message.startsWith("Too")
      ? issue.message
      : field === "correctIndex"
        ? "falta la respuesta correcta"
        : field === "options"
          ? "las opciones no son válidas"
          : field === "answer"
            ? "falta la respuesta esperada"
            : field === "prompt"
              ? "falta el enunciado"
              : field === "type"
                ? "el tipo de pregunta no es válido"
                : "no tiene el formato esperado";
  return index ? ` (pregunta ${index}: ${what})` : ` (${what})`;
}

/**
 * Valida la lista de preguntas propuesta por la IA. Si trae más de las pedidas se recortan;
 * si alguna no cumple, se rechaza todo para que el docente no revise preguntas a medias.
 */
export function parseGeneratedQuestions(raw: string, requested: number): ParseResult<GeneratedQuestion[]> {
  const json = extractJson(raw);
  if (json === undefined) return { ok: false, message: UNREADABLE };
  const parsed = questionsSchema.safeParse(json);
  if (!parsed.success) return { ok: false, message: `La IA devolvió preguntas incompletas${describeIssue(parsed.error.issues[0])}. Intenta de nuevo.` };
  const questions = parsed.data.questions.slice(0, Math.max(1, requested)).map((question): GeneratedQuestion =>
    question.type === "MULTIPLE_CHOICE"
      ? { type: "MULTIPLE_CHOICE", prompt: question.prompt, options: question.options, correctIndex: question.correctIndex, explanation: question.explanation }
      : { type: "SHORT_ANSWER", prompt: question.prompt, answer: question.answer, explanation: question.explanation },
  );
  return { ok: true, data: questions };
}

/** Valida la respuesta a «Pregúntale al curso». */
export function parseCourseAnswer(raw: string): ParseResult<CourseAnswer> {
  const json = extractJson(raw);
  if (json === undefined) return { ok: false, message: UNREADABLE };
  const parsed = answerSchema.safeParse(json);
  if (!parsed.success) return { ok: false, message: UNREADABLE };
  if (parsed.data.found && !parsed.data.answer) return { ok: false, message: UNREADABLE };
  return { ok: true, data: parsed.data };
}
