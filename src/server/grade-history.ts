import type { Prisma } from "@prisma/client";
import { hasUnarchivableSubmissionFiles, SubmissionRevisionUnavailable } from "./assessment/assignment-policies";

type Tx = Prisma.TransactionClient;

export type GradeWrite = {
  institutionId: string;
  gradeItemId: string;
  enrollmentId: string;
  score: number;
  feedback?: string | null;
  /** Quien registra la nota; en notas automáticas, el docente responsable del curso. */
  actorId: string;
  autoGraded?: boolean;
  /** Motivo del cambio. Obligatorio para modificar una nota de un período ya publicado. */
  reason?: string | null;
};

export type GradeWriteResult = { ok: true; changed: boolean } | { ok: false; reason: "reason_required"; message: string };

/**
 * Única puerta para registrar o cambiar una nota. Si la nota ya existía y cambia, guarda
 * valor anterior, valor nuevo, actor, motivo y fecha. Las revisiones nunca se editan ni borran.
 */
export async function writeGradeEntry(tx: Tx, input: GradeWrite, now = new Date()): Promise<GradeWriteResult> {
  const key = { gradeItemId: input.gradeItemId, enrollmentId: input.enrollmentId };
  const feedback = input.feedback ?? null;
  const existing = await tx.gradeEntry.findUnique({
    where: { gradeItemId_enrollmentId: key },
    select: { id: true, score: true, feedback: true, gradeItem: { select: { gradingPeriod: { select: { isPublished: true } } } } },
  });
  const data = { score: input.score, feedback, gradedById: input.actorId, gradedAt: now, autoGraded: input.autoGraded ?? false };

  if (!existing) {
    await tx.gradeEntry.create({ data: { institutionId: input.institutionId, ...key, ...data } });
    return { ok: true, changed: true };
  }
  if (existing.score === input.score && existing.feedback === feedback) return { ok: true, changed: false };

  const reason = input.reason?.trim() || null;
  if (existing.gradeItem.gradingPeriod.isPublished && !reason) {
    return { ok: false, reason: "reason_required", message: "Esta nota ya fue publicada. Escribe el motivo del cambio." };
  }
  await tx.gradeEntryRevision.create({
    data: {
      institutionId: input.institutionId,
      gradeEntryId: existing.id,
      previousScore: existing.score,
      newScore: input.score,
      previousFeedback: existing.feedback,
      reason,
      actorId: input.actorId,
      createdAt: now,
    },
  });
  await tx.gradeEntry.update({ where: { id: existing.id }, data });
  return { ok: true, changed: true };
}

/**
 * Conserva la versión vigente de una entrega antes de reemplazarla. Devuelve false si no
 * había entrega previa. Rechaza enlaces que el esquema de revisiones no puede conservar.
 */
export async function archiveSubmissionVersion(tx: Tx, scope: { assignmentId: string; studentId: string; institutionId: string }) {
  const current = await tx.submission.findUnique({
    where: { assignmentId_studentId: { assignmentId: scope.assignmentId, studentId: scope.studentId } },
    select: { id: true, content: true, fileUrls: true, submittedAt: true, assets: { select: { id: true } } },
  });
  if (!current) return false;
  if (hasUnarchivableSubmissionFiles(current.fileUrls)) throw new SubmissionRevisionUnavailable();
  await tx.submissionRevision.create({
    data: {
      institutionId: scope.institutionId,
      submissionId: current.id,
      content: current.content,
      assetIds: current.assets.map((asset) => asset.id),
      submittedAt: current.submittedAt,
    },
  });
  return true;
}
