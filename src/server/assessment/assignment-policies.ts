/** Submission revisions cannot store fileUrls until a separately approved schema change. */
export function hasUnarchivableSubmissionFiles(fileUrls: unknown): boolean {
  return fileUrls != null && (!Array.isArray(fileUrls) || fileUrls.length > 0);
}

export const SUBMISSION_LINK_RETENTION_MESSAGE =
  "Esta entrega incluye enlaces y por ahora no se puede reemplazar sin perderlos del historial. " +
  "Se conserva tu entrega actual. Habla con tu docente si necesitas corregirla.";

export class SubmissionRevisionUnavailable extends Error {
  constructor() {
    super(SUBMISSION_LINK_RETENTION_MESSAGE);
    this.name = "SubmissionRevisionUnavailable";
  }
}

export const ASSIGNMENT_RETENTION_MESSAGE =
  "Esta tarea tiene entregas o notas que deben conservarse y no se puede borrar. " +
  "Puedes ocultarla: los estudiantes dejan de verla y su historial se conserva.";

/** Drafts count too: deleting their parent would also remove evidence and revisions. */
export function assignmentDeletionBlocked(submissionCount: number, gradeEntryCount: number): boolean {
  return submissionCount > 0 || gradeEntryCount > 0;
}

type SubmissionGrade = { status: string; score: number | null; feedback?: string | null };
type LinkedGrade = {
  isPublished: boolean;
  entries: ReadonlyArray<{ score: number | null; feedback: string | null; isExcused: boolean }>;
};

/**
 * Linked tasks follow gradebook publication and its authoritative, student-scoped entry.
 * Never fall back to a stale Submission grade when a linked grade is hidden or missing.
 */
export function studentAssignmentGrade(submission: SubmissionGrade | null, gradeItem: LinkedGrade | null) {
  const hidden = { graded: false, score: null, feedback: "" } as const;
  if (!submission || submission.status === "DRAFT") return hidden;
  if (gradeItem) {
    if (!gradeItem.isPublished) return hidden;
    const entry = gradeItem.entries[0];
    if (!entry || entry.isExcused || entry.score === null) return hidden;
    return { graded: true, score: entry.score, feedback: entry.feedback ?? "" };
  }
  if (submission.status !== "GRADED") return hidden;
  return { graded: true, score: submission.score, feedback: submission.feedback ?? "" };
}

/** Same decision for the student list, detail, and the transactional write. */
export function assignmentSubmissionAccess(
  assignment: { dueDate: Date | null; allowLate: boolean },
  submission: { status: string; fileUrls: unknown } | null,
  isActive: boolean,
  now: Date,
): { allowed: boolean; why: string } {
  if (!isActive) return { allowed: false, why: "Ya no estás inscrito en este curso, así que no puedes entregar." };
  if (submission?.status === "GRADED") {
    return { allowed: false, why: "Tu docente ya calificó esta entrega y no se puede cambiar." };
  }
  if (submission && submission.status !== "DRAFT" && hasUnarchivableSubmissionFiles(submission.fileUrls)) {
    return { allowed: false, why: SUBMISSION_LINK_RETENTION_MESSAGE };
  }
  if (assignment.dueDate && assignment.dueDate < now && !assignment.allowLate) {
    return { allowed: false, why: "La fecha límite ya pasó y esta tarea no acepta entregas tarde." };
  }
  return { allowed: true, why: "" };
}
