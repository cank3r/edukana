import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { courseWhereForScope, resolveCourseWriteScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import { normalizeAnswer } from "@/lib/lms";
import type { EdukanaRole } from "@/types/next-auth";

export type Manager = { id: string; institutionId: string; role: EdukanaRole };
export type QuestionKind = "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER";
export type QuestionResult = { ok: true; id: string; courseId: string } | { ok: false; message: string };

const KINDS = ["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER"] as const;

/** Opciones fijas de verdadero o falso; la clave es una de las dos, tal cual. */
export const TRUE_FALSE_OPTIONS = ["Verdadero", "Falso"] as const;

const NO_COURSE = "No encontramos ese curso o no tienes permiso para gestionarlo.";
const NO_QUESTION = "No encontramos esa pregunta.";

/**
 * Curso que la persona puede gestionar: de su institución y, si es docente, suyo.
 * Devuelve null para estudiantes, docentes ajenos y cualquier usuario de otra institución.
 */
export async function findManagedCourse(actor: Manager, courseId: string) {
  if (!actor.id || !actor.institutionId || !courseId) return null;
  const capabilities = await getEffectiveCapabilities(actor.institutionId, actor.role);
  const where = courseWhereForScope(actor.institutionId, resolveCourseWriteScope(actor, capabilities));
  if (!where) return null;
  return db.course.findFirst({
    where: { AND: [where, { id: courseId, institutionId: actor.institutionId }] },
    select: { id: true, name: true, teacherId: true, institution: { select: { timezone: true } } },
  });
}

export type QuestionInput = {
  type: string;
  prompt: string;
  /** Selección múltiple: textos de las opciones, en orden. */
  options?: string[];
  /** Selección múltiple: posición (desde 0) de la opción correcta dentro de `options`. */
  correctIndex?: number;
  /** Verdadero o falso: "Verdadero" o "Falso". Respuesta corta: la respuesta esperada. */
  answer?: string;
  explanation?: string;
  points: number;
};

const baseSchema = z.object({
  type: z.enum(KINDS, { message: "Elige el tipo de pregunta." }),
  prompt: z.string().trim().min(3, "Escribe la pregunta.").max(10000, "La pregunta es demasiado larga."),
  explanation: z.string().trim().max(5000, "La explicación es demasiado larga.").optional(),
  points: z
    .number({ message: "Escribe cuántos puntos vale." })
    .positive("Los puntos deben ser mayores que cero.")
    .max(1000, "El máximo es 1000 puntos."),
});

type Normalized = {
  type: QuestionKind;
  prompt: string;
  options: string[] | null;
  answerKey: string;
  explanation: string | null;
  defaultPoints: number;
};

/**
 * Valida y deja la pregunta en el formato que califica `src/server/exams.ts`:
 * selección múltiple guarda la lista de textos y como clave el texto exacto de la correcta;
 * verdadero o falso guarda ["Verdadero","Falso"] y una de las dos como clave;
 * respuesta corta no guarda opciones y su clave es la respuesta esperada (la revisa el docente).
 */
export function normalizeQuestion(input: QuestionInput): { ok: true; data: Normalized } | { ok: false; message: string } {
  const parsed = baseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const { type, prompt, points } = parsed.data;
  const common = { type, prompt, explanation: parsed.data.explanation || null, defaultPoints: points };

  if (type === "MULTIPLE_CHOICE") {
    const raw = (input.options ?? []).map((option) => String(option ?? "").trim());
    const correctText = raw[input.correctIndex ?? -1] ?? "";
    const options = raw.filter(Boolean);
    if (options.length < 2) return { ok: false, message: "Escribe al menos dos opciones." };
    if (options.length > 6) return { ok: false, message: "Puedes poner hasta seis opciones." };
    if (options.some((option) => option.length > 500)) return { ok: false, message: "Cada opción puede tener hasta 500 letras." };
    if (new Set(options.map(normalizeAnswer)).size !== options.length) {
      return { ok: false, message: "Hay dos opciones iguales. Cambia una de ellas." };
    }
    if (!correctText) return { ok: false, message: "Marca cuál opción es la correcta." };
    return { ok: true, data: { ...common, options, answerKey: correctText } };
  }
  if (type === "TRUE_FALSE") {
    const answer = TRUE_FALSE_OPTIONS.find((option) => option === input.answer);
    if (!answer) return { ok: false, message: "Marca si la respuesta correcta es Verdadero o Falso." };
    return { ok: true, data: { ...common, options: [...TRUE_FALSE_OPTIONS], answerKey: answer } };
  }
  const expected = String(input.answer ?? "").trim();
  if (!expected) return { ok: false, message: "Escribe la respuesta esperada. Te servirá de guía al revisar." };
  if (expected.length > 5000) return { ok: false, message: "La respuesta esperada es demasiado larga." };
  return { ok: true, data: { ...common, options: null, answerKey: expected } };
}

const jsonOptions = (options: string[] | null) => (options === null ? Prisma.DbNull : options);

export async function createQuestion(actor: Manager, courseId: string, input: QuestionInput): Promise<QuestionResult> {
  const course = await findManagedCourse(actor, courseId);
  if (!course) return { ok: false, message: NO_COURSE };
  const normalized = normalizeQuestion(input);
  if (!normalized.ok) return normalized;
  const { options, ...data } = normalized.data;
  const created = await db.questionBankItem.create({
    data: { institutionId: actor.institutionId, courseId: course.id, ...data, options: jsonOptions(options) },
    select: { id: true },
  });
  return { ok: true, id: created.id, courseId: course.id };
}

async function findManagedQuestion(actor: Manager, questionId: string) {
  if (!actor.institutionId || !questionId) return null;
  const question = await db.questionBankItem.findFirst({
    where: { id: questionId, institutionId: actor.institutionId },
    select: { id: true, courseId: true },
  });
  if (!question) return null;
  return (await findManagedCourse(actor, question.courseId)) ? question : null;
}

/**
 * Corrige una pregunta del banco. Los exámenes que ya la incluyen conservan la copia
 * que se guardó al armarlos: este cambio solo se ve en exámenes donde se agregue después.
 */
export async function updateQuestion(actor: Manager, questionId: string, input: QuestionInput): Promise<QuestionResult> {
  const question = await findManagedQuestion(actor, questionId);
  if (!question) return { ok: false, message: NO_QUESTION };
  const normalized = normalizeQuestion(input);
  if (!normalized.ok) return normalized;
  const { options, ...data } = normalized.data;
  await db.questionBankItem.update({ where: { id: question.id }, data: { ...data, options: jsonOptions(options) } });
  return { ok: true, id: question.id, courseId: question.courseId };
}

/**
 * Borra una pregunta solo si ningún examen la usa: la base de datos no permite borrar
 * una pregunta que está en un examen o que ya tiene respuestas de estudiantes.
 */
export async function deleteQuestion(actor: Manager, questionId: string): Promise<QuestionResult> {
  const question = await findManagedQuestion(actor, questionId);
  if (!question) return { ok: false, message: NO_QUESTION };
  const [exams, answers] = await Promise.all([
    db.exam.findMany({
      where: { institutionId: actor.institutionId, questions: { some: { bankItemId: question.id } } },
      select: { title: true },
      orderBy: { createdAt: "asc" },
    }),
    db.examAnswer.count({ where: { bankItemId: question.id } }),
  ]);
  if (exams.length) {
    const one = exams.length === 1;
    const names = exams.slice(0, 3).map((exam) => `«${exam.title}»`).join(", ") + (exams.length > 3 ? ` y ${exams.length - 3} más` : "");
    return {
      ok: false,
      message: `No se puede borrar: esta pregunta está en ${one ? "el examen" : "los exámenes"} ${names}. Quítala primero de ${one ? "ese examen" : "esos exámenes"}; si ya ${one ? "tiene" : "tienen"} intentos de estudiantes, la pregunta debe quedarse.`,
    };
  }
  if (answers) return { ok: false, message: "No se puede borrar: hay estudiantes que ya respondieron esta pregunta." };
  await db.questionBankItem.delete({ where: { id: question.id } });
  return { ok: true, id: question.id, courseId: question.courseId };
}

export type QuestionListItem = {
  id: string;
  type: QuestionKind;
  prompt: string;
  options: string[];
  answerKey: string;
  explanation: string | null;
  defaultPoints: number;
  examCount: number;
};

export function readOptions(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((option): option is string => typeof option === "string") : [];
}

/** Banco de preguntas del curso, con búsqueda por texto y filtro por tipo. Null si no puede gestionarlo. */
export async function listQuestions(actor: Manager, courseId: string, filter: { q?: string; type?: string } = {}) {
  const course = await findManagedCourse(actor, courseId);
  if (!course) return null;
  const q = filter.q?.trim().slice(0, 100) ?? "";
  const type = KINDS.find((kind) => kind === filter.type);
  const scope = { institutionId: actor.institutionId, courseId: course.id };
  const [total, rows] = await Promise.all([
    db.questionBankItem.count({ where: scope }),
    db.questionBankItem.findMany({
      where: { ...scope, ...(type ? { type } : {}), ...(q ? { prompt: { contains: q, mode: "insensitive" as const } } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 200,
      select: {
        id: true,
        type: true,
        prompt: true,
        options: true,
        answerKey: true,
        explanation: true,
        defaultPoints: true,
        _count: { select: { examQuestions: true } },
      },
    }),
  ]);
  const questions: QuestionListItem[] = rows.map(({ _count, options, ...row }) => ({
    ...row,
    options: readOptions(options),
    examCount: _count.examQuestions,
  }));
  return { course: { id: course.id, name: course.name }, total, questions };
}

export async function getQuestion(actor: Manager, questionId: string) {
  const found = await findManagedQuestion(actor, questionId);
  if (!found) return null;
  const row = await db.questionBankItem.findUniqueOrThrow({
    where: { id: found.id },
    select: {
      id: true,
      courseId: true,
      type: true,
      prompt: true,
      options: true,
      answerKey: true,
      explanation: true,
      defaultPoints: true,
      examQuestions: { select: { exam: { select: { id: true, title: true } } } },
    },
  });
  const { examQuestions, options, ...question } = row;
  return { ...question, options: readOptions(options), exams: examQuestions.map((link) => link.exam) };
}
