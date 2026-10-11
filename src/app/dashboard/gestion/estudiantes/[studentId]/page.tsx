import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { spanishLabel } from "@/lib/ux";
import { CreditCard, Mail, Phone } from "lucide-react";
import { peopleProfileHref, peopleReturnHref } from "../../people-navigation";

export default async function StudentDetailPage({ params, searchParams }: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ volver?: string }>;
}) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("people.view")) redirect("/dashboard");
  const { studentId } = await params;
  const returnHref = peopleReturnHref((await searchParams).volver);

  const student = await db.user.findFirst({
    where: {
      id: studentId,
      institutionId: user.institutionId,
      role: "STUDENT",
      ...(user.role === "TEACHER" ? { enrollments: { some: { course: { teacherId: user.id, institutionId: user.institutionId } } } } : {}),
    },
    include: {
      enrollments: {
        where: { course: { institutionId: user.institutionId, ...(user.role === "TEACHER" ? { teacherId: user.id } : {}) } },
        include: { course: { select: { id: true, name: true, code: true } }, attendances: { select: { status: true } } },
        orderBy: { enrolledAt: "desc" },
      },
    },
  });
  if (!student) notFound();

  const canViewFinance = capabilities.has("finance.manage");
  const payments = canViewFinance ? await db.paymentConcept.findMany({
    where: { institutionId: user.institutionId, studentId: student.id },
    orderBy: { dueDate: "desc" },
    take: 10,
  }) : [];
  const money = (amount: number, currency: string) => new Intl.NumberFormat("es-DO", {
    style: "currency", currency, maximumFractionDigits: 0,
  }).format(amount);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-8">
      <Link
        href={peopleProfileHref(studentId, returnHref)}
        className="inline-flex min-h-11 items-center rounded-md font-semibold text-blue-700 underline
          focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
      >
        ← Volver a la ficha personal
      </Link>
      <header className="rounded-xl p-4 sm:p-5" style={{ background: "var(--cloud)" }}>
        <p className="mb-1 text-sm font-medium text-slate-600">Notas y asistencia</p>
        <h1 className="[overflow-wrap:anywhere] text-2xl font-bold" style={{ color: "var(--navy)" }}>{student.name}</h1>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
          <span className="flex min-w-0 items-start gap-2">
            <Mail size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span className="[overflow-wrap:anywhere]">{student.email}</span>
          </span>
          {student.phone && (
            <span className="flex min-w-0 items-start gap-2">
              <Phone size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span className="[overflow-wrap:anywhere]">{student.phone}</span>
            </span>
          )}
        </div>
      </header>

      <div className={`grid gap-6 ${canViewFinance ? "lg:grid-cols-3" : ""}`}>
        <section aria-labelledby="estudiante-cursos" className={canViewFinance ? "min-w-0 lg:col-span-2" : "min-w-0"}>
          <h2 id="estudiante-cursos" className="mb-3 font-semibold" style={{ color: "var(--navy)" }}>Cursos y desempeño</h2>
          <div className="space-y-3">
            {student.enrollments.map((enrollment) => {
              const total = enrollment.attendances.length;
              const present = enrollment.attendances.filter((a) => a.status === "PRESENT" || a.status === "LATE").length;
              return (
                <article key={enrollment.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <div className="min-w-0">
                      <h3>
                        <Link
                          href={`/dashboard/aula/${enrollment.course.id}`}
                          className="inline-flex min-h-11 items-center rounded-md font-semibold text-blue-700 underline
                            [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-4
                            focus-visible:outline-blue-600"
                        >
                          {enrollment.course.name}
                        </Link>
                      </h3>
                      <p className="text-sm text-slate-500">{enrollment.course.code ?? "Sin código"}</p>
                    </div>
                    <span className="mt-2 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                      {spanishLabel(enrollment.status)}
                    </span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-sm">
                    <div>
                      <dt className="text-slate-600">Nota final</dt>
                      <dd className="mt-1 font-semibold text-slate-900">{enrollment.finalGrade ?? "Sin registrar"}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-600">Asistencia</dt>
                      <dd className="mt-1 font-semibold text-slate-900">
                        {total ? `${Math.round((present / total) * 100)} %` : "Sin registros"}
                      </dd>
                    </div>
                  </dl>
                </article>
              );
            })}
            {student.enrollments.length === 0 && (
              <Empty text="No tiene cursos inscritos. Las notas y la asistencia aparecerán aquí cuando tenga una matrícula." />
            )}
          </div>
        </section>
        {canViewFinance && (
          <section aria-labelledby="estudiante-cuenta" className="min-w-0">
            <h2 id="estudiante-cuenta" className="mb-3 flex items-center gap-2 font-semibold" style={{ color: "var(--navy)" }}>
              <CreditCard size={18} aria-hidden="true" /> Cuenta
            </h2>
            <div className="space-y-2">
              {payments.map((payment) => (
                <div key={payment.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="[overflow-wrap:anywhere] text-sm font-medium text-slate-950">{payment.concept}</p>
                  <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
                    <span className="text-slate-600">{spanishLabel(payment.status)}</span>
                    <strong className="text-slate-900">{money(payment.amount, payment.currency)}</strong>
                  </div>
                </div>
              ))}
              {payments.length === 0 && <Empty text="Sin cargos registrados para este estudiante." />}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">{text}</p>;
}
