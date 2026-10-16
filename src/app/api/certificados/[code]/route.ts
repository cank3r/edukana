import { getRequestInstitution } from "@/server/platform/domains";
import { db } from "@/lib/db";
import { verifyCertificateIdentity } from "@/lib/lms";

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const institutionId = (await getRequestInstitution())?.id;
  const certificate = await db.certificate.findUnique({ where: { verificationCode: code.toUpperCase(), ...(institutionId ? { institutionId } : {}) }, include: { institution: { select: { name: true } }, course: { select: { name: true, code: true } }, enrollment: { include: { student: { select: { name: true } } } } } });
  if (!certificate) return Response.json({ valid: false, reason: "not_found" }, { status: 404 });
  const secret = process.env.CERTIFICATE_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) return Response.json({ valid: false, reason: "verification_unavailable" }, { status: 503 });
  const authentic = verifyCertificateIdentity(certificate.verificationCode, certificate.enrollmentId, certificate.courseId, secret, certificate.verificationHash);
  const valid = authentic && !certificate.revokedAt;
  return Response.json({ valid, code: certificate.verificationCode, issuedAt: certificate.issuedAt, revokedAt: certificate.revokedAt, institution: certificate.institution.name, course: certificate.course, student: certificate.enrollment.student.name }, { status: valid ? 200 : 410, headers: { "Cache-Control": "private, no-store" } });
}
