import Link from "next/link";
import { BookOpen, ChevronRight, ExternalLink, Globe, Plus, ShoppingBag } from "lucide-react";
import type { IndependentHome as HomeData } from "@/server/platform/independent";
import { plural } from "@/lib/ux";

type Props = { home: HomeData; userName?: string | null };

/** Inicio del docente independiente: crear y ver sus cursos, sus ventas y su página pública. */
export function IndependentHome({ home, userName }: Props) {
  const firstName = userName?.split(" ")[0];
  const { numbers } = home;
  const cards = [
    { href: "/dashboard/aula/nuevo", label: "Crear un curso", detail: "Ponle nombre y empieza a agregar lecciones.", icon: <Plus size={20} aria-hidden="true" />, external: false },
    { href: "/dashboard/aula", label: "Mis cursos", detail: numbers.courses ? plural(numbers.courses, "curso", "cursos") : "Aún no tienes cursos.", icon: <BookOpen size={20} aria-hidden="true" />, external: false },
    {
      href: "/dashboard/ventas",
      label: "Ventas",
      detail: numbers.pendingOrders ? plural(numbers.pendingOrders, "pedido por confirmar", "pedidos por confirmar") : "Pedidos, cupones y precios.",
      icon: <ShoppingBag size={20} aria-hidden="true" />,
      external: false,
    },
    {
      href: `/catalogo/${home.slug}`,
      label: "Mi página pública",
      detail: numbers.publicCourses ? plural(numbers.publicCourses, "curso a la venta", "cursos a la venta") : "Todavía no hay cursos a la venta.",
      icon: <Globe size={20} aria-hidden="true" />,
      external: true,
    },
  ];

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-8">
      <header className="mb-6">
        <p className="mb-1 text-sm text-slate-600">Hola{firstName ? `, ${firstName}` : ""}</p>
        <h1 className="break-words text-2xl font-bold" style={{ color: "var(--navy)" }}>{home.name}</h1>
      </header>

      {numbers.courses === 0 && (
        <section className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-5" aria-labelledby="primer-curso">
          <h2 id="primer-curso" className="text-lg font-bold text-slate-950">Empieza por tu primer curso</h2>
          <p className="mt-1 text-sm text-slate-700">Crea el curso, agrega lecciones, ponle precio en «Ventas» y compártelo con tu página pública.</p>
          <Link href="/dashboard/aula/nuevo" className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white">Crear mi primer curso</Link>
        </section>
      )}

      <section aria-labelledby="que-hacer">
        <h2 id="que-hacer" className="sr-only">Qué quieres hacer</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {cards.map((card) => (
            <li key={card.label}>
              <Link
                href={card.href}
                {...(card.external ? { target: "_blank", rel: "noopener" } : {})}
                className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm"
              >
                <span className="rounded-lg bg-blue-50 p-2 text-blue-700">{card.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-900">{card.label}</span>
                  <span className="block text-sm text-slate-600">{card.detail}</span>
                </span>
                {card.external
                  ? <ExternalLink className="shrink-0 text-slate-400" size={18} aria-label="Se abre en otra pestaña" />
                  : <ChevronRight className="shrink-0 text-slate-400" size={18} aria-hidden="true" />}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-6 text-sm text-slate-600">{numbers.activeStudents === 1 ? "1 estudiante inscrito" : `${numbers.activeStudents} estudiantes inscritos`} en tus cursos.</p>
    </div>
  );
}
