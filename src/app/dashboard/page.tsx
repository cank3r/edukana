import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  Users,
  BookOpen,
  CalendarCheck,
  TrendingUp,
  Bell,
  ChevronRight,
} from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();
  const user = session?.user as any;

  // Stats básicos según el rol
  let stats = { students: 0, courses: 0, announcements: 0 };

  if (user?.institutionId) {
    const [students, courses, announcements] = await Promise.all([
      db.user.count({
        where: { institutionId: user.institutionId, role: "STUDENT", status: "ACTIVE" },
      }),
      db.course.count({
        where: { institutionId: user.institutionId },
      }),
      db.announcement.count({
        where: { institutionId: user.institutionId },
      }),
    ]);
    stats = { students, courses, announcements };
  }

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 18) return "Buenas tardes";
    return "Buenas noches";
  };

  const roleLabel: Record<string, string> = {
    SUPER_ADMIN: "Súper administrador",
    ADMIN: "Administrador",
    COORDINATOR: "Coordinador",
    TEACHER: "Docente",
    STUDENT: "Estudiante",
    PARENT: "Tutor",
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <p className="text-sm mb-1" style={{ color: "var(--gray)" }}>
          {greeting()}, {user?.name?.split(" ")[0]}
        </p>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>
          Tu institución, conectada
        </h1>
        <span
          className="inline-block mt-2 text-xs font-medium px-2.5 py-1 rounded-full"
          style={{ background: "var(--blue-light)", color: "var(--blue)" }}
        >
          {roleLabel[user?.role] ?? user?.role}
        </span>
      </div>

      {/* Stats cards */}
      {(user?.role === "ADMIN" || user?.role === "COORDINATOR" || user?.role === "SUPER_ADMIN") && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <StatCard
            icon={<Users size={20} style={{ color: "var(--blue)" }} />}
            label="Estudiantes activos"
            value={stats.students}
            bg="var(--blue-light)"
          />
          <StatCard
            icon={<BookOpen size={20} style={{ color: "var(--cyan)" }} />}
            label="Cursos activos"
            value={stats.courses}
            bg="var(--cyan-light)"
          />
          <StatCard
            icon={<Bell size={20} style={{ color: "var(--coral)" }} />}
            label="Anuncios publicados"
            value={stats.announcements}
            bg="var(--coral-light)"
          />
        </div>
      )}

      {/* Quick actions */}
      <div className="mb-8">
        <h2 className="text-base font-semibold mb-3" style={{ color: "var(--navy)" }}>
          Acceso rápido
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <QuickAction
            href="/dashboard/aula"
            icon={<BookOpen size={18} />}
            title="Mis cursos"
            desc="Accede a tus materias y contenidos"
            color="var(--blue)"
          />
          <QuickAction
            href="/dashboard/comunidad"
            icon={<Bell size={18} />}
            title="Anuncios"
            desc="Comunicados y novedades"
            color="var(--cyan)"
          />
          <QuickAction
            href="/dashboard/calendario"
            icon={<CalendarCheck size={18} />}
            title="Calendario"
            desc="Eventos y fechas importantes"
            color="var(--green)"
          />
          {(user?.role === "ADMIN" || user?.role === "SUPER_ADMIN") && (
            <>
              <QuickAction
                href="/dashboard/gestion"
                icon={<Users size={18} />}
                title="Gestión"
                desc="Estudiantes, docentes y grupos"
                color="var(--navy)"
              />
              <QuickAction
                href="/dashboard/admisiones"
                icon={<TrendingUp size={18} />}
                title="Admisiones"
                desc="Pipeline de nuevos aspirantes"
                color="var(--coral)"
              />
            </>
          )}
        </div>
      </div>

      {/* Nota de estado del sistema */}
      <div
        className="rounded-xl p-4 flex items-start gap-3"
        style={{ background: "var(--blue-light)", border: "1px solid #C7D7FD" }}
      >
        <span className="text-lg">🚀</span>
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--blue)" }}>
            Edukana MVP — en configuración inicial
          </p>
          <p className="text-xs mt-0.5" style={{ color: "#4B6DE0" }}>
            Tu institución se está configurando. Completa los datos en{" "}
            <a href="/dashboard/configuracion" className="underline font-medium">
              Configuración
            </a>{" "}
            para activar todos los módulos.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, bg }: { icon: React.ReactNode; label: string; value: number; bg: string }) {
  return (
    <div
      className="rounded-xl p-5 flex items-center gap-4"
      style={{ background: "white", border: "1px solid #E2E8F0" }}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: bg }}
      >
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold" style={{ color: "var(--navy)" }}>{value}</p>
        <p className="text-xs" style={{ color: "var(--gray)" }}>{label}</p>
      </div>
    </div>
  );
}

function QuickAction({
  href, icon, title, desc, color
}: {
  href: string; icon: React.ReactNode; title: string; desc: string; color: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 p-4 rounded-xl transition-all hover:shadow-sm group"
      style={{ background: "white", border: "1px solid #E2E8F0" }}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-white"
        style={{ background: color }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: "var(--navy)" }}>{title}</p>
        <p className="text-xs truncate" style={{ color: "var(--gray)" }}>{desc}</p>
      </div>
      <ChevronRight size={16} style={{ color: "#CBD5E1" }} className="group-hover:translate-x-0.5 transition-transform" />
    </a>
  );
}
