"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  BarChart2, BookOpen, Building2, Calendar, ChevronRight, CreditCard, GraduationCap,
  LayoutDashboard, LogOut, Megaphone, Menu, MoreHorizontal, Settings, UserCircle, UserPlus, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { groupNavigation, navigationForRole, type NavigationItem } from "@/lib/ux";
import type { EdukanaRole } from "@/types/next-auth";
import type { Capability } from "@/lib/capabilities";

interface SidebarUser {
  name?: string | null;
  email?: string | null;
  role: EdukanaRole;
  institutionSlug: string;
  institutionCount?: number;
}

const ICONS = {
  home: LayoutDashboard,
  portal: GraduationCap,
  people: Users,
  courses: BookOpen,
  community: Megaphone,
  admissions: UserPlus,
  payments: CreditCard,
  calendar: Calendar,
  analytics: BarChart2,
  settings: Settings,
};

export default function Sidebar({ user, capabilities }: { user: SidebarUser; capabilities: Capability[] }) {
  const pathname = usePathname();
  const { main, more } = groupNavigation(navigationForRole(user.role, capabilities));
  const isActive = (item: NavigationItem) => pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
  const moreActive = more.some(isActive);

  const mobileLink = (item: NavigationItem) => {
    const Icon = ICONS[item.icon];
    const active = isActive(item);
    return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} onClick={(event) => event.currentTarget.closest("details.mobile-menu")?.removeAttribute("open")} className={cn("flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-base font-semibold", active ? "bg-blue-600 text-white" : "text-slate-800 hover:bg-slate-100")}><Icon size={20} aria-hidden="true" /><span>{item.label}</span></Link>;
  };
  const desktopLink = (item: NavigationItem) => {
    const Icon = ICONS[item.icon];
    const active = isActive(item);
    return (
      <Link key={item.href} href={item.href} title={item.label} aria-current={active ? "page" : undefined}
        className={cn("group flex items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all md:justify-start", active ? "text-white" : "text-gray-400 hover:bg-white/5 hover:text-white")}
        style={active ? { background: "var(--blue)", color: "white" } : {}}>
        <Icon size={18} aria-hidden="true" /><span className="hidden flex-1 md:block">{item.label}</span>{active && <ChevronRight size={14} className="hidden opacity-60 md:block" />}
      </Link>
    );
  };

  return (
    <>
      <header className="relative z-40 flex h-16 w-full shrink-0 items-center justify-between border-b px-4 md:hidden" style={{ background: "var(--navy)", borderColor: "rgba(255,255,255,0.08)" }}>
        <Link href="/dashboard" aria-label="Ir al inicio de Edukana">
          <Image src="/logos/edukana_horizontal_color_fondo_oscuro.svg" alt="Edukana" width={128} height={34} priority />
        </Link>
        <details className="mobile-menu group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10">
            <Menu size={20} aria-hidden="true" /> Menú
          </summary>
          <div className="absolute right-2 top-[calc(100%-0.25rem)] w-[min(22rem,calc(100vw-1rem))] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
            <nav aria-label="Navegación móvil" className="space-y-1">
              {main.map(mobileLink)}
              {more.length > 0 && (
                <details open={moreActive || undefined}>
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-lg px-3 py-2 text-base font-semibold text-slate-800 hover:bg-slate-100 [&::-webkit-details-marker]:hidden"><MoreHorizontal size={20} aria-hidden="true" /> Más</summary>
                  <div className="ml-4 space-y-1 border-l border-slate-200 pl-2">{more.map(mobileLink)}</div>
                </details>
              )}
            </nav>
            {(user.institutionCount ?? 1) > 1 && <Link href="/elegir-institucion" className="mt-2 flex min-h-11 items-center gap-3 rounded-lg border-t border-slate-200 px-3 py-2 text-base font-semibold text-slate-700 hover:bg-slate-100"><Building2 size={20} aria-hidden="true" /> Cambiar de institución</Link>}
            <Link href="/dashboard/perfil" onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")} className="mt-2 flex min-h-11 items-center gap-3 rounded-lg border-t border-slate-200 px-3 py-2 text-base font-semibold text-slate-700 hover:bg-slate-100"><UserCircle size={20} aria-hidden="true" /> Mi perfil</Link>
            <button onClick={() => signOut({ callbackUrl: "/login" })} className="mt-2 flex min-h-11 w-full items-center gap-3 rounded-lg border-t border-slate-200 px-3 py-2 text-base font-semibold text-slate-700 hover:bg-slate-100">
              <LogOut size={20} aria-hidden="true" /> Cerrar sesión
            </button>
          </div>
        </details>
      </header>

      <aside className="hidden h-full w-60 shrink-0 flex-col border-r md:flex" style={{ background: "var(--navy)", borderColor: "rgba(255,255,255,0.06)" }}>
      <div className="flex h-[73px] items-center justify-center border-b px-3 md:justify-start md:px-5" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <Link href="/dashboard" aria-label="Ir al inicio de Edukana" title="Ir al inicio">
          <Image className="hidden md:block" src="/logos/edukana_horizontal_color_fondo_oscuro.svg" alt="Edukana" width={140} height={38} priority />
          <Image className="md:hidden" src="/logos/edukana_isotipo_color.svg" alt="Edukana" width={34} height={34} priority />
        </Link>
      </div>

      <nav aria-label="Navegación principal" className="flex-1 space-y-0.5 overflow-y-auto px-2 py-4 md:px-3">
        {main.map(desktopLink)}
        {more.length > 0 && (
          <details open={moreActive || undefined}>
            <summary className="flex cursor-pointer list-none items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-400 transition-all hover:bg-white/5 hover:text-white md:justify-start [&::-webkit-details-marker]:hidden"><MoreHorizontal size={18} aria-hidden="true" /><span className="hidden md:block">Más</span></summary>
            <div className="space-y-0.5 md:ml-3 md:border-l md:border-white/10 md:pl-2">{more.map(desktopLink)}</div>
          </details>
        )}
      </nav>

      <div className="space-y-2 border-t px-2 pb-4 pt-3 md:px-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        {(user.institutionCount ?? 1) > 1 && <Link href="/elegir-institucion" title="Cambiar de institución" aria-label="Cambiar de institución"
          className="flex w-full items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-400 transition-all hover:bg-white/5 hover:text-white md:justify-start">
          <Building2 size={18} aria-hidden="true" /><span className="hidden md:block">Cambiar de institución</span>
        </Link>}
        <button onClick={() => signOut({ callbackUrl: "/login" })} title="Cerrar sesión" aria-label="Cerrar sesión"
          className="flex w-full items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-400 transition-all hover:bg-white/5 hover:text-white md:justify-start">
          <LogOut size={18} /><span className="hidden md:block">Cerrar sesión</span>
        </button>
        <Link href="/dashboard/perfil" title="Mi perfil" aria-label={`Mi perfil: ${user.name ?? ""}`} className="hidden items-center gap-3 rounded-lg px-3 py-2.5 transition-all hover:bg-white/10 md:flex" style={{ background: "rgba(255,255,255,0.04)" }}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: "var(--blue)" }}>{user.name?.charAt(0).toUpperCase() ?? "U"}</div>
          <div className="min-w-0"><p className="truncate text-sm font-medium text-white">{user.name}</p><p className="truncate text-xs" style={{ color: "#6B7DA8" }}>{user.email}</p></div>
        </Link>
      </div>
      </aside>
    </>
  );
}
