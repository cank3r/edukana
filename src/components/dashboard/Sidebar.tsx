"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  BarChart2, BookOpen, Calendar, ChevronRight, CreditCard, GraduationCap,
  LayoutDashboard, LogOut, Megaphone, Settings, UserPlus, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EdukanaRole } from "@/types/next-auth";

interface SidebarUser {
  name?: string | null;
  email?: string | null;
  role: EdukanaRole;
  institutionSlug: string;
}

const NAV_ITEMS: Array<{ label: string; href: string; icon: React.ElementType; roles?: EdukanaRole[] }> = [
  { label: "Inicio", href: "/dashboard", icon: LayoutDashboard },
  { label: "Mi portal", href: "/dashboard/portal", icon: GraduationCap, roles: ["STUDENT"] },
  { label: "Gestión", href: "/dashboard/gestion", icon: Users, roles: ["ADMIN", "COORDINATOR", "SUPER_ADMIN"] },
  { label: "Aula", href: "/dashboard/aula", icon: BookOpen },
  { label: "Comunidad", href: "/dashboard/comunidad", icon: Megaphone },
  { label: "Admisiones", href: "/dashboard/admisiones", icon: UserPlus, roles: ["ADMIN", "COORDINATOR", "SUPER_ADMIN"] },
  { label: "Pagos", href: "/dashboard/pagos", icon: CreditCard, roles: ["ADMIN", "SUPER_ADMIN"] },
  { label: "Calendario", href: "/dashboard/calendario", icon: Calendar },
  { label: "Analítica", href: "/dashboard/analitica", icon: BarChart2, roles: ["ADMIN", "COORDINATOR", "SUPER_ADMIN"] },
  { label: "Configuración", href: "/dashboard/configuracion", icon: Settings, roles: ["ADMIN", "SUPER_ADMIN"] },
];

export default function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user.role));

  return (
    <aside className="flex h-full w-16 shrink-0 flex-col border-r md:w-60" style={{ background: "var(--navy)", borderColor: "rgba(255,255,255,0.06)" }}>
      <div className="flex h-[73px] items-center justify-center border-b px-3 md:justify-start md:px-5" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <Link href="/dashboard" aria-label="Ir al inicio de Edukana">
          <Image className="hidden md:block" src="/logos/edukana_horizontal_color_fondo_oscuro.svg" alt="Edukana" width={140} height={38} priority />
          <Image className="md:hidden" src="/logos/edukana_isotipo_color.svg" alt="Edukana" width={34} height={34} priority />
        </Link>
      </div>

      <nav aria-label="Navegación principal" className="flex-1 space-y-0.5 overflow-y-auto px-2 py-4 md:px-3">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} title={item.label} aria-current={active ? "page" : undefined}
              className={cn("group flex items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all md:justify-start", active ? "text-white" : "text-gray-400 hover:bg-white/5 hover:text-white")}
              style={active ? { background: "var(--blue)", color: "white" } : {}}>
              <Icon size={18} aria-hidden="true" /><span className="hidden flex-1 md:block">{item.label}</span>{active && <ChevronRight size={14} className="hidden opacity-60 md:block" />}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t px-2 pb-4 pt-3 md:px-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <button onClick={() => signOut({ callbackUrl: "/login" })} title="Cerrar sesión" aria-label="Cerrar sesión"
          className="flex w-full items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-400 transition-all hover:bg-white/5 hover:text-white md:justify-start">
          <LogOut size={18} /><span className="hidden md:block">Cerrar sesión</span>
        </button>
        <div className="hidden items-center gap-3 rounded-lg px-3 py-2.5 md:flex" style={{ background: "rgba(255,255,255,0.04)" }}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: "var(--blue)" }}>{user.name?.charAt(0).toUpperCase() ?? "U"}</div>
          <div className="min-w-0"><p className="truncate text-sm font-medium text-white">{user.name}</p><p className="truncate text-xs" style={{ color: "#6B7DA8" }}>{user.email}</p></div>
        </div>
      </div>
    </aside>
  );
}
