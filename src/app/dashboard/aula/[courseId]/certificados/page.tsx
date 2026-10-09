import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { formatNumber } from "@/lib/gradebook-calc";
import { getMyCourseCertificate, listCourseCertificates, type CourseCertificates, type MyCourseCertificate } from "@/server/courses/certificates";
import { CertificateList, IssueAllPanel, ShareTools } from "./CertificateTools";

export const dynamic = "force-dynamic";

const card = "rounded-xl border border-slate-200 bg-white p-4 sm:p-5";
const day = (value: Date, timeZone: string) => new Intl.DateTimeFormat("es", { timeZone, dateStyle: "long" }).format(value);
const NOTES: Record<string, string> = { COMPLETED: "Curso completado", FAILED: "No aprobó", DROPPED: "Retirado" };

function requirementText(threshold: number) {
  return threshold >= 100 ? "Completar todas las lecciones del curso (100% de avance)." : `Completar al menos ${threshold}% de las lecciones del curso.`;
}

export default async function CourseCertificatesPage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const { courseId } = await params;
  const actor = { id: user.id, institutionId: user.institutionId, role: user.role };

  const managed = await listCourseCertificates(actor, courseId);
  if (managed) return <ManagerView data={managed} />;
  const mine = await getMyCourseCertificate(actor, courseId);
  if (mine) return <StudentView data={mine} />;
  notFound();
}

function ManagerView({ data }: { data: CourseCertificates }) {
  const { course, rows, timezone } = data;
  const issued = rows.filter((row) => row.state === "issued").length;
  const eligible = rows.filter((row) => row.state === "eligible");
  const pending = rows.length - issued - eligible.length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="mt-1 text-2xl font-bold" style={{ color: "var(--navy)" }}>Certificados</h1>
        <p className="mt-1 text-sm text-slate-600">Entrega el certificado a quienes terminaron el curso. Cada uno tiene un enlace público para comprobar que es auténtico.</p>
      </header>

      <section className={card} aria-labelledby="requisitos">
        <h2 id="requisitos" className="text-lg font-bold text-slate-950">Requisitos para recibir el certificado</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>{requirementText(course.completionThreshold)}</li>
          <li>O que tú marques el curso como completado para ese estudiante.</li>
        </ul>
        <p className="mt-2 text-sm text-slate-600">
          {data.hasGrades
            ? "La nota actual de cada estudiante aparece en la lista para que la tengas en cuenta. El curso no tiene una nota mínima: tú decides a quién emitirlo."
            : "Este curso todavía no tiene calificaciones, así que solo cuenta el avance."}{" "}
          El avance mínimo se cambia en <Link className="font-semibold text-blue-700 underline" href={`/dashboard/aula/${course.id}/editar`}>Editar curso</Link>.
        </p>
      </section>

      <dl className="grid grid-cols-3 gap-3">
        {[
          { label: "Certificados emitidos", value: issued },
          { label: "Cumplen y aún no lo tienen", value: eligible.length },
          { label: "Aún no cumplen", value: pending },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <dt className="text-xs font-medium text-slate-600">{item.label}</dt>
            <dd className="mt-1 text-2xl font-bold text-slate-950">{item.value}</dd>
          </div>
        ))}
      </dl>

      {rows.length > 0 && <IssueAllPanel courseId={course.id} names={eligible.map((row) => row.name)} />}

      <section className={card} aria-labelledby="inscritos">
        <h2 id="inscritos" className="text-lg font-bold text-slate-950">Estudiantes ({rows.length})</h2>
        {rows.length === 0 ? (
          <p className="mt-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            Todavía no hay estudiantes en este curso. Cuando los inscribas, aquí verás quién ya puede recibir su certificado.{" "}
            <Link className="font-semibold text-blue-700 underline" href={`/dashboard/aula/${course.id}/estudiantes`}>Inscribir estudiantes</Link>
          </p>
        ) : (
          <CertificateList
            courseId={course.id}
            showGrades={data.hasGrades}
            rows={rows.map((row) => ({
              enrollmentId: row.enrollmentId,
              name: row.name,
              note: NOTES[row.status] ?? "",
              canMarkCompleted: row.status === "ACTIVE",
              canReopen: row.status === "COMPLETED",
              progressPercent: row.progressPercent,
              grade: row.grade === null ? "" : `${formatNumber(row.grade)} de 100`,
              state: row.state,
              missing: row.missing,
              code: row.certificate?.code ?? "",
              issuedOn: row.certificate ? day(row.certificate.issuedAt, timezone) : "",
              revokedOn: row.revoked ? day(row.revoked.at, timezone) : "",
              revokeReason: row.revoked?.reason ?? "",
            }))}
          />
        )}
      </section>
    </div>
  );
}

function StudentView({ data }: { data: MyCourseCertificate }) {
  const { course, certificate } = data;
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="mt-1 text-2xl font-bold" style={{ color: "var(--navy)" }}>Mi certificado</h1>
      </header>

      {certificate ? (
        <section className={card}>
          <h2 className="text-lg font-bold text-slate-950">¡Felicidades! Ya tienes tu certificado</h2>
          <p className="mt-1 text-sm text-slate-700">
            Se emitió el {day(certificate.issuedAt, data.timezone)}. Puedes abrirlo para imprimirlo o guardarlo, y compartir el enlace: cualquiera que lo abra podrá comprobar que es auténtico.
          </p>
          <div className="mt-4"><ShareTools code={certificate.code} /></div>
        </section>
      ) : (
        <section className={card}>
          <h2 className="text-lg font-bold text-slate-950">{data.eligible ? "Ya cumples los requisitos" : "Todavía no tienes el certificado de este curso"}</h2>
          <p className="mt-1 text-sm text-slate-700">
            {data.eligible ? "Tu docente todavía no ha emitido tu certificado. Cuando lo haga, aparecerá aquí." : data.missing}
          </p>
          {!data.eligible && (
            <Link className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white" href={`/dashboard/aula/${course.id}`}>Seguir con el curso</Link>
          )}
        </section>
      )}

      <section className={card} aria-labelledby="como-voy">
        <h2 id="como-voy" className="text-lg font-bold text-slate-950">Cómo vas</h2>
        <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-slate-600">Tu avance</dt>
            <dd className="text-2xl font-bold text-slate-950">{data.progressPercent}%</dd>
            <dd className="text-xs text-slate-500">Se pide {course.completionThreshold}%</dd>
          </div>
          {data.hasGrades && (
            <div>
              <dt className="text-slate-600">Tu nota actual</dt>
              <dd className="text-2xl font-bold text-slate-950">{data.grade === null ? "—" : formatNumber(data.grade)}</dd>
              <dd className="text-xs text-slate-500">{data.grade === null ? "Aún sin notas publicadas" : "de 100"}</dd>
            </div>
          )}
        </dl>
        <p className="mt-3 text-sm text-slate-600">
          Todos tus certificados están en <Link className="font-semibold text-blue-700 underline" href="/dashboard/mis-certificados">Mis certificados</Link>.
        </p>
      </section>
    </div>
  );
}
