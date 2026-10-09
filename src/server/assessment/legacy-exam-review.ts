import { z } from "zod";
import { db } from "@/lib/db";
import { reviewExamAttempt, type ExamResult, type ReviewInput } from "./exam-admin";
import { findManagedCourse, type Manager } from "./question-bank";

const REOPEN = "Abre Exámenes en el curso y entra a los resultados para revisar el intento.";
const frozenQuestion = z.object({
  type: z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER"]),
  prompt: z.string(),
  answerKey: z.string(),
  options: z.array(z.string()).nullable(),
  points: z.number().min(0),
});

/** Stale clients may only delegate a complete, frozen attempt and an explicit reason. */
export async function reviewLegacyExamAttempt(actor: Manager, attemptId: string, input: ReviewInput): Promise<ExamResult> {
  if (!input.reason?.trim()) return { ok: false, message: `Escribe el motivo de esta revisión. ${REOPEN}` };
  const attempt = await db.examAttempt.findFirst({
    where: { id: attemptId, institutionId: actor.institutionId, status: "SUBMITTED" },
    select: {
      maxScore: true,
      answers: { select: { id: true, bankItemId: true } },
      exam: { select: { courseId: true, questions: { select: { bankItemId: true, points: true, snapshot: true } } } },
    },
  });
  if (!attempt || !(await findManagedCourse(actor, attempt.exam.courseId))) {
    return { ok: false, message: "No encontramos ese intento o no tienes permiso para revisarlo." };
  }
  const incomplete = { ok: false, message: `No podemos verificar todas las preguntas de este intento. ${REOPEN}` } as const;
  const questions = new Map<string, z.infer<typeof frozenQuestion>>();
  for (const question of attempt.exam.questions) {
    const frozen = frozenQuestion.safeParse(question.snapshot);
    // The canonical service reads row points. Reject inconsistent old evidence rather
    // than silently scoring against mutable rows or falling back to the live bank.
    if (!frozen.success || frozen.data.points !== question.points || questions.has(question.bankItemId)) return incomplete;
    questions.set(question.bankItemId, frozen.data);
  }
  const total = [...questions.values()].reduce((sum, question) => sum + question.points, 0);
  if (!questions.size || attempt.maxScore === null || !Number.isFinite(attempt.maxScore) ||
    Math.abs(total - attempt.maxScore) > 1e-8 || attempt.answers.length !== questions.size) return incomplete;
  const answered = new Set<string>();
  const manualAnswerIds = new Set<string>();
  for (const answer of attempt.answers) {
    const question = questions.get(answer.bankItemId);
    if (!question || answered.has(answer.bankItemId)) return incomplete;
    answered.add(answer.bankItemId);
    if (question.type === "SHORT_ANSWER") {
      manualAnswerIds.add(answer.id);
      if (!Object.hasOwn(input.answers, answer.id)) {
        return { ok: false, message: `Faltan puntuaciones de respuestas cortas. ${REOPEN}` };
      }
    }
  }
  if (Object.keys(input.answers).some((id) => !manualAnswerIds.has(id))) {
    return { ok: false, message: `La revisión incluye respuestas que no corresponden a este intento. ${REOPEN}` };
  }
  return reviewExamAttempt(actor, attemptId, input);
}
