import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { spanishLabel } from "@/lib/ux";
import { ChevronLeft, CreditCard, Mail, Phone } from "lucide-react";

export default async function StudentDetailPage({ params }: { params: Promise<{ studentId: string }> }) {
  const session = await auth();
  const user = session!.user;
  if (!["ADMIN", "COORDINATOR", "SUPER_ADMIN", "TEACHER"].includes(user.role)) redirect("/dashboard");
  const { studentId } = await params;

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

  const payments = user.role === "TEACHER" ? [] : await db.paymentConcept.findMany({
    where: { institutionId: user.institutionId, studentId: student.id },
    orderBy: { dueDate: "desc" },
    take: 10,
  });
  const money = (amount: number, currency: string) => new Intl.NumberFormat("es-DO", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8">
      <Link href="/dashboard/gestion" className="mb-6 flex w-fit items-center gap-1 text-sm text-slate-500"><ChevronLeft size={16} /> Volver a estudiantes</Link>
      <header className="mb-6 rounded-2xl p-6 text-white" style={{ background: "var(--navy)" }}><div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-xl font-bold">{student.name.charAt(0)}</div><h1 className="text-2xl font-bold">{student.name}</h1><div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-300"><span className="flex items-center gap-1"><Mail size={14} />{student.email}</span>{student.phone && <span className="flex items-center gap-1"><Phone size={14} />{student.phone}</span>}</div></header>
      <div className="grid gap-6 lg:grid-cols-3"><section className="lg:col-span-2"><h2 className="mb-3 font-semibold" style={{ color: "var(--navy)" }}>Cursos y desempeño</h2><div className="space-y-3">{student.enrollments.map((enrollment) => { const total = enrollment.attendances.length; const present = enrollment.attendances.filter((a) => a.status === "PRESENT" || a.status === "LATE").length; return <Link href={`/dashboard/aula/${enrollment.course.id}`} key={enrollment.id} className="block rounded-xl border border-slate-200 bg-white p-4 hover:shadow-sm"><div className="flex items-center justify-between"><div><p className="font-semibold" style={{ color: "var(--navy)" }}>{enrollment.course.name}</p><p className="text-xs text-slate-500">{enrollment.course.code ?? "Sin código"}</p></div><p className="text-sm">Nota: <strong>{enrollment.finalGrade ?? "—"}</strong></p></div><p className="mt-2 text-xs text-slate-500">Asistencia: {total ? `${Math.round((present / total) * 100)}%` : "Sin registros"}</p></Link>; })}{student.enrollments.length === 0 && <Empty text="No tiene cursos inscritos." />}</div></section>
      <section><h2 className="mb-3 flex items-center gap-2 font-semibold" style={{ color: "var(--navy)" }}><CreditCard size={17} /> Cuenta</h2><div className="space-y-2">{payments.map((payment) => <div key={payment.id} className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-sm font-medium">{payment.concept}</p><div className="mt-1 flex justify-between text-xs text-slate-500"><span>{spanishLabel(payment.status)}</span><strong>{money(payment.amount, payment.currency)}</strong></div></div>)}{payments.length === 0 && <Empty text={user.role === "TEACHER" ? "Información financiera restringida." : "Sin cargos registrados."} />}</div></section></div>
    </div>
  );
}

function Empty({ text }: { text: string }) { return <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">{text}</p>; }
