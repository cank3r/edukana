import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PaymentForm } from "@/components/dashboard/MutationForms";

const labels = { PAID: "Pagado", PENDING: "Pendiente", OVERDUE: "Vencido", PARTIAL: "Parcial", CANCELLED: "Cancelado" };

export default async function PagosPage() {
  const session = await auth();
  const user = session!.user;
  if (!["ADMIN", "SUPER_ADMIN"].includes(user.role)) redirect("/dashboard");
  const [payments, students, periods] = await Promise.all([
    db.paymentConcept.findMany({ where: { institutionId: user.institutionId }, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }], take: 100 }),
    db.user.findMany({ where: { institutionId: user.institutionId, role: "STUDENT", status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.academicPeriod.findMany({ where: { institutionId: user.institutionId }, select: { id: true, name: true }, orderBy: { startDate: "desc" } }),
  ]);
  const studentMap = new Map(students.map((student) => [student.id, student.name]));
  const total = (statuses: Array<keyof typeof labels>) => payments.filter((payment) => statuses.includes(payment.status)).reduce((sum, payment) => sum + payment.amount, 0);
  const money = (amount: number, currency = "DOP") => new Intl.NumberFormat("es-DO", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  const date = (value: Date | null) => value ? new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(value) : "—";

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8"><div className="mb-8"><h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Cobros</h1><p className="mt-1 text-sm text-slate-500">Estado de cuenta e historial de cobros</p></div>
      <details className="mb-6"><summary className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-semibold text-white">Registrar pago o cargo</summary><div className="mt-3"><PaymentForm students={students} periods={periods} /></div></details>
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4"><Metric label="Total facturado" value={money(total(["PAID", "PENDING", "OVERDUE", "PARTIAL"]))} /><Metric label="Cobrado" value={money(total(["PAID"]))} /><Metric label="Por cobrar" value={money(total(["PENDING", "PARTIAL"]))} /><Metric label="Vencido" value={money(total(["OVERDUE"]))} /></div>
      <div className="mobile-card-list">{payments.map((payment) => <article className="rounded-xl border border-slate-200 bg-white p-4" key={payment.id}><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-900">{payment.concept}</h2><p className="text-sm text-slate-600">{payment.studentId ? studentMap.get(payment.studentId) ?? "Estudiante no disponible" : "Cargo general"}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">{labels[payment.status]}</span></div><dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><div><dt className="text-slate-500">Monto</dt><dd className="font-semibold">{money(payment.amount, payment.currency)}</dd></div><div><dt className="text-slate-500">Vencimiento</dt><dd>{date(payment.dueDate)}</dd></div></dl><details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-blue-700">Editar este pago</summary><div className="mt-3"><PaymentForm students={students} periods={periods} payment={{ id: payment.id, studentId: payment.studentId, periodId: payment.periodId, concept: payment.concept, amount: payment.amount, currency: payment.currency, dueDate: payment.dueDate?.toISOString().slice(0, 10) ?? "", status: payment.status, notes: payment.notes }} /></div></details></article>)}</div>
      <div className="desktop-table overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[720px] text-sm"><thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-3">Estudiante</th><th className="p-3">Concepto</th><th className="p-3">Monto</th><th className="p-3">Vencimiento</th><th className="p-3">Estado</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id} className="border-t border-slate-100"><td className="p-3">{payment.studentId ? studentMap.get(payment.studentId) ?? "Estudiante no disponible" : "Cargo general"}</td><td className="p-3"><details><summary className="cursor-pointer font-medium text-blue-700">{payment.concept}</summary><div className="mt-3 min-w-[600px]"><PaymentForm students={students} periods={periods} payment={{ id: payment.id, studentId: payment.studentId, periodId: payment.periodId, concept: payment.concept, amount: payment.amount, currency: payment.currency, dueDate: payment.dueDate?.toISOString().slice(0, 10) ?? "", status: payment.status, notes: payment.notes }} /></div></details></td><td className="p-3 font-semibold">{money(payment.amount, payment.currency)}</td><td className="p-3 text-slate-500">{date(payment.dueDate)}</td><td className="p-3">{labels[payment.status]}</td></tr>)}{payments.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-slate-500">No hay registros de pago.</td></tr>}</tbody></table></div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-lg font-bold" style={{ color: "var(--navy)" }}>{value}</p></div>; }
