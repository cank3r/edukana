"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { breadcrumbLabel } from "@/lib/ux";

export default function DashboardBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length <= 1) return null;
  // Tramos que agrupan en la dirección pero no tienen pantalla propia: nunca se enlazan.
  const isVirtual = (href: string) => href === "/dashboard/gestion/estudiantes" || /^\/dashboard\/aula\/[^/]+\/leccion$/.test(href);
  const hrefAt = (index: number) => `/${segments.slice(0, index + 1).join("/")}`;
  // Un identificador no se muestra: bajo «aula» es el curso.
  const labelAt = (index: number) => {
    const label = breadcrumbLabel(segments[index]);
    return label === "Detalle" && segments[index - 1] === "aula" ? "Curso" : label;
  };
  let parentIndex = segments.length - 2;
  while (parentIndex > 0 && isVirtual(hrefAt(parentIndex))) parentIndex -= 1;
  const parentHref = hrefAt(parentIndex);
  const parentLabel = labelAt(parentIndex);

  return (
    <div className="border-b border-slate-200 bg-white px-4 py-2 sm:px-8">
      <Link href={parentHref} className="mb-1 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 md:hidden">
        <ChevronLeft size={16} aria-hidden="true" /> {parentLabel === "Curso" ? "Volver al curso" : `Volver a ${parentLabel}`}
      </Link>
      <nav aria-label="Ruta de navegación" className="hidden items-center gap-1 text-sm text-slate-600 md:flex">
        {segments.map((_segment, index) => {
          const href = hrefAt(index);
          const current = index === segments.length - 1;
          const isVirtualGroup = isVirtual(href);
          const label = labelAt(index);
          return <span className="flex items-center gap-1" key={href}>{index > 0 && <ChevronRight size={14} aria-hidden="true" />}{current ? <span aria-current="page" className="font-semibold text-slate-900">{label}</span> : isVirtualGroup ? <span>{label}</span> : <Link className="rounded-sm hover:text-blue-700" href={href}>{label}</Link>}</span>;
        })}
      </nav>
    </div>
  );
}
