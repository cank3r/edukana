import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findBrand, listPublicCourses } from "@/server/catalog/public";
import { isFree } from "@/server/catalog/pricing";
import { formatMoney } from "@/server/finance/money";
import { BrandHeader, Stars } from "./Brand";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ institutionSlug: string }>; searchParams: Promise<{ q?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const brand = await findBrand((await params).institutionSlug);
  if (!brand) return { title: "Catálogo no encontrado" };
  const title = `${brand.name} · Cursos`;
  const description = `Mira los cursos que ofrece ${brand.name} e inscríbete en línea.`;
  return { title: { absolute: title }, description, openGraph: { title, description, type: "website", ...(brand.logoUrl?.startsWith("https://") ? { images: [brand.logoUrl] } : {}) } };
}

export default async function CatalogPage({ params, searchParams }: Props) {
  const brand = await findBrand((await params).institutionSlug);
  if (!brand) notFound();
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw ?? "").trim().slice(0, 100);
  const courses = await listPublicCourses(brand.id, q);

  return (
    <div className="min-h-screen" style={{ background: "var(--cloud)" }}>
      <BrandHeader brand={brand} />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-8 sm:py-10">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: "var(--navy)" }}>Cursos de {brand.name}</h1>
          <p className="mt-1 text-slate-600">Elige un curso, mira de qué trata e inscríbete en línea.</p>
        </div>

        <form className="flex gap-2" role="search">
          <label className="sr-only" htmlFor="buscar-curso">Buscar curso</label>
          <input id="buscar-curso" name="q" defaultValue={q} placeholder="Buscar por nombre o tema…" className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500" />
          <button className="min-h-11 shrink-0 rounded-lg bg-blue-600 px-4 font-semibold text-white" type="submit">Buscar</button>
        </form>
        {q && (
          <p className="text-sm text-slate-700">
            {courses.length === 1 ? "1 curso" : `${courses.length} cursos`} para «{q}»
            <Link href={`/catalogo/${brand.slug}`} className="ml-2 inline-flex min-h-11 items-center text-blue-700 underline">Ver todos</Link>
          </p>
        )}

        {courses.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-700">
            {q ? "Ningún curso coincide con esa búsqueda. Prueba con otra palabra o mira todos los cursos." : `${brand.name} todavía no tiene cursos abiertos al público. Vuelve pronto.`}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <li key={course.id}>
                <Link href={`/catalogo/${brand.slug}/${course.id}`} className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-blue-300 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
                  {course.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- portada externa del curso
                    <img src={course.imageUrl} alt="" className="aspect-video w-full object-cover" />
                  ) : (
                    <div aria-hidden className="flex aspect-video w-full items-center justify-center text-4xl font-bold text-white" style={{ background: brand.brandColor ?? "var(--blue)" }}>
                      {course.name.trim().charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-1 p-4">
                    <h2 className="text-lg font-bold text-slate-950">{course.name}</h2>
                    <p className="text-sm text-slate-600">Con {course.teacherName}</p>
                    <p className="text-sm text-slate-600">{course.lessons === 1 ? "1 lección" : `${course.lessons} lecciones`}</p>
                    <p className="text-sm"><Stars rating={course.rating} count={course.reviews} /></p>
                    <p className="mt-auto pt-2 text-lg font-bold text-slate-950">{isFree(course.priceCents) ? "Gratis" : formatMoney(course.priceCents!, course.currency)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
