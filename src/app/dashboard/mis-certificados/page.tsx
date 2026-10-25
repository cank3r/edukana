import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listMyCertificates } from "@/server/courses/certificates";
import { ShareTools } from "../aula/[courseId]/certificados/CertificateTools";

export const dynamic = "force-dynamic";

export default async function MyCertificatesPage() {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const { certificates, timezone } = await listMyCertificates({ id: user.id, institutionId: user.institutionId, role: user.role });
  const day = (value: Date) => new Intl.DateTimeFormat("es", { timeZone: timezone, dateStyle: "long" }).format(value);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Mis certificados</h1>
        <p className="mt-1 text-sm text-slate-600">Los certificados de los cursos que terminaste. Ábrelos para imprimirlos o comparte su enlace.</p>
      </header>

      {certificates.length === 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-bold text-slate-950">Todavía no tienes certificados</h2>
          <p className="mt-1 text-sm text-slate-700">Cuando termines un curso y tu docente emita tu certificado, lo encontrarás aquí.</p>
          <Link className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white" href="/dashboard/aula">Ir a mis cursos</Link>
        </section>
      ) : (
        <ul className="space-y-3">
          {certificates.map((certificate) => (
            <li key={certificate.code} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
              <h2 className="text-lg font-bold text-slate-950">{certificate.courseName}</h2>
              <p className="mt-1 text-sm text-slate-600">Emitido el {day(certificate.issuedAt)}</p>
              <div className="mt-3"><ShareTools code={certificate.code} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
