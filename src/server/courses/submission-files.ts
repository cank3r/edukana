import { Prisma } from "@prisma/client";
import { courseWhereForScope, resolveCourseWriteScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import { SUBMISSION_MAX_FILES } from "@/lib/uploads";
import { assignmentSubmissionAccess, SubmissionRevisionUnavailable } from "@/server/assessment/assignment-policies";
import { lockAssignmentSubmission } from "@/server/assessment/submission-lock";
import { archiveSubmissionVersion } from "@/server/grade-history";
import { pendingSubmissionFilesWhere, type UploadActor } from "./uploads";

/**
 * Archivos de una entrega (`StorageAsset.submissionId`).
 * - Listos: el estudiante los subió para esta tarea y todavía no entregó (sin `submissionId`).
 * - De la entrega: forman la versión vigente.
 * Al volver a entregar, la versión anterior queda en `SubmissionRevision.assetIds` (lo hace
 * `archiveSubmissionVersion`). Un archivo que el estudiante deja fuera de la versión nueva se
 * desliga de la entrega pero NO se borra: sigue siendo parte de la versión anterior.
 */

export type SubmissionFile = { id: string; name: string; sizeBytes: number; url: string };
export type SubmissionStudent = { id: string; institutionId: string };
export type SubmitWithFilesResult = { ok: true; courseId: string; resubmitted: boolean } | { ok: false; message: string };

const fileSelect = { id: true, originalName: true, sizeBytes: true } as const;
const toFile = (asset: { id: string; originalName: string; sizeBytes: number }): SubmissionFile => ({
  id: asset.id,
  name: asset.originalName,
  sizeBytes: asset.sizeBytes,
  url: `/api/assets/${asset.id}`,
});

/** Lo que ve el estudiante: los archivos de su entrega vigente y los que tiene listos para entregar. */
export async function submissionFilesForStudent(student: SubmissionStudent, assignmentId: string) {
  if (!assignmentId) return { current: [], pending: [] };
  const [current, pending] = await Promise.all([
    db.storageAsset.findMany({
      where: { institutionId: student.institutionId, confirmedAt: { not: null }, submission: { assignmentId, studentId: student.id } },
      orderBy: { createdAt: "asc" },
      select: fileSelect,
    }),
    db.storageAsset.findMany({ where: pendingSubmissionFilesWhere(student, assignmentId), orderBy: { createdAt: "asc" }, select: fileSelect }),
  ]);
  return { current: current.map(toFile), pending: pending.map(toFile) };
}

/** Lo que ve quien gestiona el curso en el detalle de una entrega. */
export async function submissionFilesForManager(actor: UploadActor, submissionId: string): Promise<SubmissionFile[]> {
  const where = courseWhereForScope(actor.institutionId, resolveCourseWriteScope(actor, actor.capabilities));
  if (!where || !submissionId) return [];
  const assets = await db.storageAsset.findMany({
    where: { institutionId: actor.institutionId, confirmedAt: { not: null }, submissionId, submission: { assignment: { course: where } } },
    orderBy: { createdAt: "asc" },
    select: fileSelect,
  });
  return assets.map(toFile);
}

function cleanLink(value: string): { ok: true; link: string | null } | { ok: false } {
  const text = value.trim();
  if (!text) return { ok: true, link: null };
  if (text.length > 2000 || /\s/.test(text)) return { ok: false };
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || !url.hostname.includes(".")) return { ok: false };
    return { ok: true, link: url.toString() };
  } catch {
    return { ok: false };
  }
}

const fail = (message: string) => ({ ok: false, message }) as const;
class StaleFiles extends Error {}

/**
 * Entrega o vuelve a entregar con texto, enlace y hasta cinco archivos. Mismas reglas que la
 * entrega sin archivos (`assignmentSubmissionAccess`): se puede reenviar mientras no esté
 * calificada y la tarea siga abierta; los enlaces previos bloquean el reenvío. `assetIds` es la
 * lista final de archivos de la versión nueva: archivos de la entrega vigente que se conservan
 * y archivos listos del propio estudiante.
 */
export async function submitAssignmentWithFiles(
  student: SubmissionStudent,
  input: { assignmentId: string; content?: string; link?: string; assetIds?: string[] },
  now = new Date(),
): Promise<SubmitWithFilesResult> {
  const unavailable = fail("Esta tarea no está disponible para ti.");
  if (!input.assignmentId || !student.institutionId) return unavailable;
  const content = input.content?.trim() ?? "";
  const link = cleanLink(input.link ?? "");
  if (!link.ok) return fail("El enlace no es válido. Debe empezar con https:// y no tener espacios.");
  const assetIds = [...new Set((input.assetIds ?? []).filter(Boolean))];
  if (assetIds.length > SUBMISSION_MAX_FILES) return fail(`Puedes entregar hasta ${SUBMISSION_MAX_FILES} archivos. Quita alguno.`);
  if (!content && !link.link && assetIds.length === 0) return fail("Escribe tu respuesta, pega un enlace o adjunta un archivo antes de entregar.");
  if (content.length > 30000) return fail("El texto es demasiado largo. Acórtalo o adjúntalo como archivo.");

  const assignmentWhere = { id: input.assignmentId, isPublished: true, course: { institutionId: student.institutionId, isPublished: true } };
  const assignment = await db.assignment.findFirst({ where: assignmentWhere, select: { id: true } });
  if (!assignment) return unavailable;

  try {
    return await db.$transaction(async (tx) => {
      const key = { assignmentId: assignment.id, studentId: student.id };
      if (!(await lockAssignmentSubmission(tx, { ...key, institutionId: student.institutionId }))) return unavailable;
      const current = await tx.assignment.findFirst({ where: assignmentWhere, select: { id: true, courseId: true, dueDate: true, allowLate: true } });
      if (!current) return unavailable;
      const enrollment = await tx.enrollment.findFirst({ where: { studentId: student.id, courseId: current.courseId, status: "ACTIVE" }, select: { id: true } });
      if (!enrollment) return unavailable;
      const existing = await tx.submission.findUnique({ where: { assignmentId_studentId: key }, select: { id: true, status: true, fileUrls: true } });
      const allowed = assignmentSubmissionAccess(current, existing, true, now);
      if (!allowed.allowed) return fail(allowed.why);

      // Cada archivo pedido debe ser de la entrega vigente o estar listo y ser del propio estudiante.
      const linked = existing ? await tx.storageAsset.findMany({ where: { submissionId: existing.id }, select: { id: true } }) : [];
      const pending = assetIds.length
        ? await tx.storageAsset.findMany({ where: { ...pendingSubmissionFilesWhere(student, current.id), id: { in: assetIds } }, select: { id: true } })
        : [];
      const linkedIds = new Set<string>(linked.map((asset) => asset.id));
      const pendingIds = new Set<string>(pending.map((asset) => asset.id));
      if (assetIds.some((id) => !linkedIds.has(id) && !pendingIds.has(id))) throw new StaleFiles();

      const resubmitted = Boolean(existing && existing.status !== "DRAFT");
      if (resubmitted) await archiveSubmissionVersion(tx, { ...key, institutionId: student.institutionId });
      const fields = { content: content || null, fileUrls: link.link ? [link.link] : Prisma.JsonNull, status: "SUBMITTED" as const, submittedAt: now };
      const submission = await tx.submission.upsert({
        where: { assignmentId_studentId: key },
        create: { institutionId: student.institutionId, ...key, enrollmentId: enrollment.id, ...fields },
        update: { ...fields, score: null, feedback: null, gradedAt: null },
        select: { id: true },
      });
      const dropped = [...linkedIds].filter((id) => !assetIds.includes(id));
      // Se desligan sin borrarse: siguen en la versión anterior (SubmissionRevision.assetIds).
      if (dropped.length) await tx.storageAsset.updateMany({ where: { id: { in: dropped }, submissionId: submission.id }, data: { submissionId: null, assignmentId: null } });
      if (pendingIds.size) await tx.storageAsset.updateMany({ where: { id: { in: [...pendingIds] }, submissionId: null }, data: { submissionId: submission.id } });
      return { ok: true as const, courseId: current.courseId, resubmitted };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  } catch (error) {
    if (error instanceof StaleFiles) return fail("Uno de los archivos ya no está disponible. Recarga la página y revisa tus archivos.");
    if (error instanceof SubmissionRevisionUnavailable) return fail(error.message);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return fail("Tu entrega cambió mientras intentabas enviarla. Recarga la página antes de volver a entregar.");
    }
    throw error;
  }
}
