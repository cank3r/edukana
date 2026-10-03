import { auth } from "@/lib/auth";
import { hasCapability } from "@/lib/capabilities";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { TrendingUp, Users, BookOpen, UserPlus } from "lucide-react";

export default async function AnaliticaPage() {
  const session = await auth();
  const user = session!.user;

  if (!hasCapability(user.role, "analytics.view")) {
    redirect("/dashboard");
  }

  const iid = user.institutionId;

  const [
    totalStudents,
    totalTeachers,
    totalCourses,
    totalEnrollments,
    totalLeads,
    acceptedLeads,
    totalPayments,
    paidPayments,
    recentStudents,
  ] = await Promise.all([
    db.user.count({ where: { institutionId: iid, role: "STUDENT", status: "ACTIVE" } }),
    db.user.count({ where: { institutionId: iid, role: "TEACHER", status: "ACTIVE" } }),
    db.course.count({ where: { institutionId: iid } }),
    db.enrollment.count({ where: { course: { institutionId: iid }, status: "ACTIVE" } }),
    db.admissionLead.count({ where: { institutionId: iid } }),
    db.admissionLead.count({ where: { institutionId: iid, stage: "ACCEPTED" } }),
    db.paymentConcept.aggregate({ where: { institutionId: iid }, _sum: { amount: true }, _count: true }),
    db.paymentConcept.aggregate({ where: { institutionId: iid, status: "PAID" }, _sum: { amount: true } }),
    db.user.findMany({
      where: { institutionId: iid, role: "STUDENT", status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { name: true, email: true, createdAt: true },
    }),
  ]);

  const admissionRate = totalLeads > 0
    ? Math.round((acceptedLeads / totalLeads) * 100)
    : 0;

  const collectionRate = totalPayments._sum.amount && Number(totalPayments._sum.amount) > 0
    ? Math.round((Number(paidPayments._sum.amount ?? 0) / Number(totalPayments._sum.amount)) * 100)
    : 0;

  const fmt = (n: number) =>
    new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 }).format(n);

  const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat("es", { day: "numeric", month: "short" }).format(d);

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Analítica</h1>
        <p className="text-sm mt-1" style={{ color: "var(--gray)" }}>
          Indicadores clave de tu institución
        </p>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KPICard label="Estudiantes activos" value={totalStudents} icon={<Users size={18} />} color="var(--blue)" bg="var(--blue-light)" />
        <KPICard label="Docentes activos" value={totalTeachers} icon={<BookOpen size={18} />} color="var(--green)" bg="var(--green-light)" />
        <KPICard label="Cursos activos" value={totalCourses} icon={<TrendingUp size={18} />} color="var(--cyan)" bg="var(--cyan-light)" />
        <KPICard label="Inscripciones" value={totalEnrollments} icon={<UserPlus size={18} />} color="var(--coral)" bg="var(--coral-light)" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Admisiones */}
        <div className="rounded-2xl p-5" style={{ background: "white", border: "1px solid #E2E8F0" }}>
          <h3 className="font-semibold mb-4" style={{ color: "var(--navy)" }}>Admisiones</h3>
          <div className="space-y-3">
            <MetricRow label="Total solicitudes" value={totalLeads} />
            <MetricRow label="Aceptados" value={acceptedLeads} />
            <div className="pt-2">
              <div className="flex justify-between text-xs mb-1.5">
                <span style={{ color: "var(--gray)" }}>Tasa de aceptación</span>
                <span className="font-semibold" style={{ color: "var(--green)" }}>{admissionRate}%</span>
              </div>
              <div className="h-2 rounded-full" style={{ background: "#F1F5F9" }}>
                <div
                  className="h-2 rounded-full transition-all"
                  style={{ width: `${admissionRate}%`, background: "var(--green)" }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Finanzas */}
        <div className="rounded-2xl p-5" style={{ background: "white", border: "1px solid #E2E8F0" }}>
          <h3 className="font-semibold mb-4" style={{ color: "var(--navy)" }}>Finanzas</h3>
          <div className="space-y-3">
            <MetricRow label="Total facturado" value={fmt(Number(totalPayments._sum.amount ?? 0))} />
            <MetricRow label="Cobrado" value={fmt(Number(paidPayments._sum.amount ?? 0))} />
            <div className="pt-2">
              <div className="flex justify-between text-xs mb-1.5">
                <span style={{ color: "var(--gray)" }}>Tasa de cobro</span>
                <span className="font-semibold" style={{ color: "var(--blue)" }}>{collectionRate}%</span>
              </div>
              <div className="h-2 rounded-full" style={{ background: "#F1F5F9" }}>
                <div
                  className="h-2 rounded-full"
                  style={{ width: `${collectionRate}%`, background: "var(--blue)" }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Nuevos estudiantes */}
        <div className="rounded-2xl p-5" style={{ background: "white", border: "1px solid #E2E8F0" }}>
          <h3 className="font-semibold mb-4" style={{ color: "var(--navy)" }}>Últimos estudiantes</h3>
          {recentStudents.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--gray)" }}>Sin datos aún.</p>
          ) : (
            <div className="space-y-3">
              {recentStudents.map((s) => (
                <div key={s.email} className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ background: "var(--blue)" }}
                  >
                    {s.name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: "var(--navy)" }}>{s.name}</p>
                    <p className="text-xs" style={{ color: "var(--gray)" }}>{fmtDate(s.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KPICard({ label, value, icon, color, bg }: {
  label: string; value: number | string; icon: React.ReactNode; color: string; bg: string;
}) {
  return (
    <div className="rounded-xl p-5 flex items-center gap-4" style={{ background: "white", border: "1px solid #E2E8F0" }}>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: bg, color }}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold" style={{ color: "var(--navy)" }}>{value}</p>
        <p className="text-xs" style={{ color: "var(--gray)" }}>{label}</p>
      </div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span style={{ color: "var(--gray)" }}>{label}</span>
      <span className="font-semibold" style={{ color: "var(--navy)" }}>{value}</span>
    </div>
  );
}
