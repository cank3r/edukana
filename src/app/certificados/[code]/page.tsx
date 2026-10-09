import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { verifyCertificateIdentity } from "@/lib/lms";

export default async function CertificatePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const certificate = await db.certificate.findUnique({ where: { verificationCode: code.toUpperCase() }, include: { institution: { select: { name: true } }, course: { select: { name: true, code: true } }, enrollment: { include: { student: { select: { name: true } } } } } });
  if (!certificate) notFound();
  const secret = process.env.CERTIFICATE_SECRET ?? process.env.AUTH_SECRET ?? "";
  const valid = Boolean(secret) && !certificate.revokedAt && verifyCertificateIdentity(certificate.verificationCode, certificate.enrollmentId, certificate.courseId, secret, certificate.verificationHash);
  return <main className="min-h-screen bg-slate-100 p-4 sm:p-10"><article className="mx-auto max-w-4xl overflow-hidden rounded-3xl border-8 border-blue-700 bg-white p-8 text-center shadow-xl sm:p-16"><Image src="/logos/edukana_horizontal_color.svg" alt="Edukana" width={220} height={60} className="mx-auto" priority /><p className="mt-10 text-xs font-bold uppercase tracking-[.35em] text-blue-700">Certificado verificable</p><h1 className="mt-4 text-3xl font-bold text-slate-900 sm:text-5xl">Certificado de finalización</h1><p className="mt-8 text-slate-500">{certificate.institution.name} certifica que</p><p className="mt-3 text-3xl font-semibold text-blue-700">{certificate.enrollment.student.name}</p><p className="mt-5 text-slate-600">completó satisfactoriamente el curso</p><p className="mt-2 text-2xl font-bold text-slate-900">{certificate.course.name}</p><div className="mx-auto mt-10 grid max-w-xl gap-4 border-t pt-6 text-sm sm:grid-cols-3"><div><span className="block text-slate-400">Código</span><strong>{certificate.verificationCode}</strong></div><div><span className="block text-slate-400">Emisión</span><strong>{new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(certificate.issuedAt)}</strong></div><div><span className="block text-slate-400">Estado</span><strong className={valid ? "text-emerald-600" : "text-red-600"}>{valid ? "Válido" : "No válido"}</strong></div></div><Link href={`/api/certificados/${certificate.verificationCode}`} className="mt-8 inline-block text-sm font-medium text-blue-700 underline">Ver registro JSON firmado</Link></article></main>;
}
