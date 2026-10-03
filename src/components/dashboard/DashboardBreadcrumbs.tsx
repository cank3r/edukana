"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { breadcrumbLabel } from "@/lib/ux";

export default function DashboardBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length <= 1) return null;
  const parentHref = `/${segments.slice(0, -1).join("/")}`;

  return (
    <div className="border-b border-slate-200 bg-white px-4 py-2 sm:px-8">
      <Link href={parentHref} className="mb-1 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 md:hidden">
        <ChevronLeft size={16} aria-hidden="true" /> Volver a {breadcrumbLabel(segments.at(-2) ?? "dashboard")}
      </Link>
      <nav aria-label="Ruta de navegación" className="hidden items-center gap-1 text-sm text-slate-600 md:flex">
        {segments.map((segment, index) => {
          const href = `/${segments.slice(0, index + 1).join("/")}`;
          const current = index === segments.length - 1;
          const isVirtualGroup = href === "/dashboard/gestion/estudiantes";
          const label = breadcrumbLabel(segment);
          return <span className="flex items-center gap-1" key={href}>{index > 0 && <ChevronRight size={14} aria-hidden="true" />}{current ? <span aria-current="page" className="font-semibold text-slate-900">{label}</span> : isVirtualGroup ? <span>{label}</span> : <Link className="rounded-sm hover:text-blue-700" href={href}>{label}</Link>}</span>;
        })}
      </nav>
    </div>
  );
}
