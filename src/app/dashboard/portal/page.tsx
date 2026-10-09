import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { chargeBalances } from "@/server/finance/charges";
import { formatMoney } from "@/server/finance/money";
import { getStudentCourses } from "@/server/student-home";
import { BookOpen, CreditCard } from "lucide-react";
import { STATUS_LABEL } from "../pagos/labels";
import { CourseCard } from "../StudentHome";

export default async function StudentPortalPage() {
  const session = await auth();
  const user = session!.user;
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (user.role !== "STUDENT" || !capabilities.has("student.portal.view")) redirect("/dashboard");

  const [courses, payments] = await Promise.all([
    getStudentCourses({ id: user.id, institutionId: user.institutionId }),
    db.paymentConcept.findMany({ where: { institutionId: user.institutionId, studentId: user.id }, orderBy: { dueDate: "asc" }, take: 20 }),
  ]);
  // Lo pagado sale de los pagos reales (no anulados), no del estado guardado ni del decimal antiguo.
  const balances = await chargeBalances(user.institutionId, payments.map((payment) => payment.id));
  const active = courses.filter((course) => !course.completed);
  const completed = courses.filter((course) => course.completed);

  const date = (value: Date | null) => value ? new Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone: "UTC" }).format(value) : "Sin fecha";
  const account = payments.flatMap((payment) => {
    const balance = balances.get(payment.id);
    return balance ? [{ id: payment.id, concept: payment.concept, dueDate: payment.dueDate, currency: balance.currency, amount: formatMoney(balance.amountCents, balance.currency), owed: formatMoney(balance.balanceCents, balance.currency), status: STATUS_LABEL[balance.shownStatus].label }] : [];
  });

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <div className="mb-8"><h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Mis cursos</h1><p className="mt-1 text-sm text-slate-600">Todos tus cursos, con tu avance y tu nota final cuando el curso termina.</p></div>
      {courses.length === 0 ? (
        <div className="mb-8"><Empty text="Todavía no estás inscrito en ningún curso. Tu institución debe inscribirte." /></div>
      ) : (
        <>
          <section className="mb-8" aria-labelledby="en-curso">
            <h2 id="en-curso" className="mb-3 font-semibold" style={{ color: "var(--navy)" }}>En curso</h2>
            {active.length === 0 ? <Empty text="No tienes cursos en marcha." /> : <div className="grid gap-3 md:grid-cols-2">{active.map((course) => <CourseCard key={course.courseId} course={course} />)}</div>}
          </section>
          {completed.length > 0 && (
            <section className="mb-8" aria-labelledby="completados">
              <h2 id="completados" className="mb-3 font-semibold" style={{ color: "var(--navy)" }}>Completados</h2>
              <div className="grid gap-3 md:grid-cols-2">{completed.map((course) => <CourseCard key={course.courseId} course={course} />)}</div>
            </section>
          )}
        </>
      )}
      <section><h2 className="mb-3 flex items-center gap-2 font-semibold" style={{ color: "var(--navy)" }}><CreditCard size={18} /> Estado de cuenta</h2><p className="mb-3 flex flex-wrap gap-2"><Link className="inline-flex min-h-11 items-center rounded-lg border border-blue-600 px-4 text-sm font-semibold text-blue-700" href="/dashboard/mi-cuenta">Ver mi estado de cuenta completo</Link><Link className="inline-flex min-h-11 items-center rounded-lg border border-blue-600 px-4 text-sm font-semibold text-blue-700" href="/dashboard/mis-certificados">Mis certificados</Link></p>{account.length === 0 ? <Empty text="No tienes cargos registrados." /> : <><div className="mobile-card-list">{account.map((charge) => <article className="rounded-xl border border-slate-200 bg-white p-4" key={charge.id}><div className="flex items-start justify-between gap-3"><h3 className="font-semibold text-slate-900">{charge.concept}</h3><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">{charge.status}</span></div><dl className="mt-3 grid grid-cols-3 gap-2 text-sm"><div><dt className="text-slate-500">Monto</dt><dd className="font-semibold">{charge.amount}</dd></div><div><dt className="text-slate-500">Debes</dt><dd className="font-semibold">{charge.owed}</dd></div><div><dt className="text-slate-500">Vencimiento</dt><dd>{date(charge.dueDate)}</dd></div></dl></article>)}</div><div className="desktop-table overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[560px] text-sm"><thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-3">Concepto</th><th className="p-3">Vencimiento</th><th className="p-3">Monto</th><th className="p-3">Debes</th><th className="p-3">Estado</th></tr></thead><tbody>{account.map((charge) => <tr key={charge.id} className="border-t border-slate-100"><td className="p-3">{charge.concept}</td><td className="p-3 text-slate-500">{date(charge.dueDate)}</td><td className="p-3 font-medium">{charge.amount}</td><td className="p-3 font-medium">{charge.owed}</td><td className="p-3">{charge.status}</td></tr>)}</tbody></table></div></>}</section>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-700"><BookOpen className="mx-auto mb-2 text-slate-400" aria-hidden="true" />{text}</div>;
}
