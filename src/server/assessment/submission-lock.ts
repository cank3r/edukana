import type { Prisma } from "@prisma/client";

/**
 * Both assignment writers lock parent → submission. The parent also serializes the
 * first insert, when there is no submission row to lock. Callers must re-read their
 * authorization and state under READ COMMITTED after these locks have been acquired.
 * This is a local protocol for these writers, not a global order for other modules.
 */
export async function lockAssignmentSubmission(
  tx: Prisma.TransactionClient,
  scope: { assignmentId: string; studentId: string; institutionId: string },
): Promise<boolean> {
  const assignments = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT a."id" FROM "assignments" a
    JOIN "courses" c ON c."id" = a."courseId"
    WHERE a."id" = ${scope.assignmentId} AND c."institutionId" = ${scope.institutionId}
    FOR UPDATE OF a`;
  if (!assignments.length) return false;
  await tx.$queryRaw`
    SELECT "id" FROM "submissions"
    WHERE "assignmentId" = ${scope.assignmentId} AND "studentId" = ${scope.studentId}
    FOR UPDATE`;
  return true;
}
