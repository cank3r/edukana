import { db } from "@/lib/db";

type Reviewer = { id: string; institutionId: string };
export type ReviewResult = { ok: true; message: string } | { ok: false; message: string };

/** Solo reseña quien está inscrito (activo o ya terminó) en un curso de su institución. */
async function reviewableEnrollment(user: Reviewer, courseId: string) {
  if (!user?.id || !user.institutionId || !courseId) return null;
  return db.enrollment.findFirst({
    where: { studentId: user.id, courseId, status: { in: ["ACTIVE", "COMPLETED"] }, course: { institutionId: user.institutionId }, student: { institutionId: user.institutionId, status: "ACTIVE" } },
    select: { id: true },
  });
}

/** Su reseña del curso si puede reseñar; `canReview` false si no está inscrito. */
export async function getOwnReview(user: Reviewer | null, courseId: string) {
  if (!user || !(await reviewableEnrollment(user, courseId))) return { canReview: false as const, review: null };
  const review = await db.courseReview.findUnique({ where: { courseId_userId: { courseId, userId: user.id } }, select: { rating: true, comment: true } });
  return { canReview: true as const, review };
}

/** Crea o corrige su reseña: de 1 a 5 estrellas y un comentario opcional de hasta 1000 caracteres. */
export async function saveReview(user: Reviewer, courseId: string, input: { rating: string | number; comment?: string }): Promise<ReviewResult> {
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, message: "Elige de 1 a 5 estrellas." };
  const comment = String(input.comment ?? "").trim();
  if (comment.length > 1000) return { ok: false, message: "El comentario es demasiado largo (máximo 1000 caracteres)." };
  if (!(await reviewableEnrollment(user, courseId))) return { ok: false, message: "Solo quienes están inscritos en este curso pueden dejar una reseña." };

  const existing = await db.courseReview.findUnique({ where: { courseId_userId: { courseId, userId: user.id } }, select: { id: true } });
  await db.courseReview.upsert({
    where: { courseId_userId: { courseId, userId: user.id } },
    create: { institutionId: user.institutionId, courseId, userId: user.id, rating, comment: comment || null },
    update: { rating, comment: comment || null },
  });
  return { ok: true, message: existing ? "Tu reseña se actualizó. Gracias." : "Gracias por tu reseña." };
}
