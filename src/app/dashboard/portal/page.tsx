import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { spanishLabel } from "@/lib/ux";
import { BookOpen, CreditCard } from "lucide-react";
import { listPortalTasksForStudent } from "@/server/assessment/student-portal-tasks";
import { PortalTasks } from "./PortalTasks";

export default async function StudentPortalPage() {
  const session = await auth();
  const user = session!.user;
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (user.role !== "STUDENT" || !capabilities.has("student.portal.view")) redirect("/dashboard");

  const [enrollments, payments] = await Promise.all([
    db.enrollment.findMany({
      where: { studentId: user.id, course: { institutionId: user.institutionId } },
      include: {
        course: {
          include: {
            teacher: { select: { name: true } },
          },
        },
      },
      orderBy: { enrolledAt: "desc" },
    }),
    db.paymentConcept.findMany({ where: { institutionId: user.institutionId, studentId: user.id }, orderBy: { dueDate: "asc" }, take: 20 }),
  ]);

  // Only the task slice uses M3 access and grade publication rules. Course cards and payments stay unchanged.
  const tasksByCourse = new Map(await Promise.all(enrollments.map(async ({ course }) => [
    course.id,
    await listPortalTasksForStudent({ id: user.id, institutionId: user.institutionId }, course.id),
  ] as const)));

  const money = (amount: number, currency: string) => new Intl.NumberFormat("es-DO", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  const date = (value: Date | null) => value ? new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(value) : "Sin fecha";
  const status = { PENDING: "Pendiente", PAID: "Pagado", OVERDUE: "Vencido", CANCELLED: "Cancelado", PARTIAL: "Parcial" };

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <div className="mb-8"><h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Mi portal estudiantil</h1><p className="mt-1 text-sm text-slate-500">Tus cursos, tareas, calificaciones y estado de cuenta</p></div>
      <section className="mb-8"><h2 className="mb-3 font-semibold" style={{ color: "var(--navy)" }}>Mis cursos</h2>{enrollments.length === 0 ? <Empty text="No tienes cursos inscritos." /> : <div className="grid gap-4 md:grid-cols-2">{enrollments.map(({ course, finalGrade, status: enrollmentStatus }) => <article key={course.id} className="rounded-xl border border-slate-200 bg-white p-5"><div className="mb-3 flex items-start justify-between gap-3"><div><p className="text-xs font-mono text-blue-600">{course.code ?? "CURSO"}</p><Link href={`/dashboard/aula/${course.id}`} className="font-bold hover:underline" style={{ color: "var(--navy)" }}>{course.name}</Link><p className="text-xs text-slate-500">{course.teacher.name}</p></div><span className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">{spanishLabel(enrollmentStatus)}</span></div><p className="mb-3 text-sm text-slate-600">Calificación final: <strong>{finalGrade ?? "Pendiente"}</strong></p><PortalTasks data={tasksByCourse.get(course.id) ?? null} /></article>)}</div>}</section>
      <section><h2 className="mb-3 flex items-center gap-2 font-semibold" style={{ color: "var(--navy)" }}><CreditCard size={18} /> Estado de cuenta</h2>{payments.length === 0 ? <Empty text="No tienes cargos registrados." /> : <><div className="mobile-card-list">{payments.map((payment) => <article className="rounded-xl border border-slate-200 bg-white p-4" key={payment.id}><div className="flex items-start justify-between gap-3"><h3 className="font-semibold text-slate-900">{payment.concept}</h3><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">{status[payment.status]}</span></div><dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><div><dt className="text-slate-500">Monto</dt><dd className="font-semibold">{money(payment.amount, payment.currency)}</dd></div><div><dt className="text-slate-500">Vencimiento</dt><dd>{date(payment.dueDate)}</dd></div></dl></article>)}</div><div className="desktop-table overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[560px] text-sm"><thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-3">Concepto</th><th className="p-3">Vencimiento</th><th className="p-3">Monto</th><th className="p-3">Estado</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id} className="border-t border-slate-100"><td className="p-3">{payment.concept}</td><td className="p-3 text-slate-500">{date(payment.dueDate)}</td><td className="p-3 font-medium">{money(payment.amount, payment.currency)}</td><td className="p-3">{status[payment.status]}</td></tr>)}</tbody></table></div></>}</section>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500"><BookOpen className="mx-auto mb-2 text-slate-300" />{text}</div>;
}
