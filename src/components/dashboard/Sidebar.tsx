"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Calendar,
  Megaphone,
  UserPlus,
  CreditCard,
  BarChart2,
  Settings,
  LogOut,
  ChevronRight,
  GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarUser {
  name?: string | null;
  email?: string | null;
  role: string;
  institutionSlug: string;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { label: "Inicio", href: "/dashboard", icon: LayoutDashboard },
  { label: "Gestión", href: "/dashboard/gestion", icon: Users, roles: ["ADMIN", "COORDINATOR", "SUPER_ADMIN"] },
  { label: "Aula", href: "/dashboard/aula", icon: BookOpen },
  { label: "Comunidad", href: "/dashboard/comunidad", icon: Megaphone },
  { label: "Admisiones", href: "/dashboard/admisiones", icon: UserPlus, roles: ["ADMIN", "COORDINATOR", "SUPER_ADMIN"] },
  { label: "Pagos", href: "/dashboard/pagos", icon: CreditCard, roles: ["ADMIN", "SUPER_ADMIN"] },
  { label: "Calendario", href: "/dashboard/calendario", icon: Calendar },
  { label: "Analítica", href: "/dashboard/analitica", icon: BarChart2, roles: ["ADMIN", "COORDINATOR", "SUPER_ADMIN"] },
];

export default function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(user.role)
  );

  return (
    <aside
      className="w-60 flex flex-col h-full border-r"
      style={{ background: "var(--navy)", borderColor: "rgba(255,255,255,0.06)" }}
    >
      {/* Logo */}
      <div className="px-5 py-5 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <Link href="/dashboard" className="flex items-center gap-2">
          <GraduationCap size={22} style={{ color: "var(--cyan)" }} />
          <span className="text-lg font-bold tracking-tight" style={{ color: "white" }}>
            edu<span style={{ color: "var(--cyan)" }}>kana</span>
          </span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
                isActive
                  ? "text-white"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              )}
              style={isActive ? { background: "var(--blue)", color: "white" } : {}}
            >
              <Icon size={17} />
              <span className="flex-1">{item.label}</span>
              {isActive && <ChevronRight size={14} className="opacity-60" />}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: user + settings */}
      <div className="px-3 pb-4 border-t pt-3 space-y-0.5" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <Link
          href="/dashboard/configuracion"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-all"
        >
          <Settings size={17} />
          <span>Configuración</span>
        </Link>

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-all"
        >
          <LogOut size={17} />
          <span>Cerrar sesión</span>
        </button>

        {/* User chip */}
        <div className="mt-3 flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ background: "var(--blue)", color: "white" }}
          >
            {user.name?.charAt(0).toUpperCase() ?? "U"}
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-medium text-white truncate">{user.name}</p>
            <p className="text-xs truncate" style={{ color: "#6B7DA8" }}>{user.email}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
