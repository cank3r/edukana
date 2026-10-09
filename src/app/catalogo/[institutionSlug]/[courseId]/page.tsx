import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { isFree } from "@/server/catalog/pricing";
import { findBrand, getPublicCourse } from "@/server/catalog/public";
import { getOwnReview } from "@/server/catalog/reviews";
import { formatMoney } from "@/server/finance/money";
import { BrandHeader, Stars } from "../Brand";
import { EnrollForm } from "./EnrollForm";
import { ReviewForm } from "./ReviewForm";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ institutionSlug: string; courseId: string }> };

const load = cache(async (slug: string, courseId: string) => {
  const brand = await findBrand(slug);
  const course = brand ? await getPublicCourse(brand.id, courseId) : null;
  return brand && course ? { brand, course } : null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { institutionSlug, courseId } = await params;
  const data = await load(institutionSlug, courseId);
  if (!data) return { title: "Curso no encontrado" };
  const title = `${data.course.name} · ${data.brand.name}`;
  const description = (data.course.description ?? `Curso de ${data.brand.name} con ${data.course.teacherName}.`).replace(/\s+/g, " ").slice(0, 160);
  return { title, description, openGraph: { title, description, type: "website", ...(data.course.imageUrl?.startsWith("https://") ? { images: [data.course.imageUrl] } : {}) } };
}

export default async function PublicCoursePage({ params }: Props) {
  const { institutionSlug, courseId } = await params;
  const data = await load(institutionSlug, courseId);
  if (!data) notFound();
  const { brand, course } = data;
  const session = (await auth())?.user;
  const viewer = session?.id && session.institutionId === brand.id ? { id: session.id, institutionId: session.institutionId } : null;
  const own = await getOwnReview(viewer, course.id);
  const free = isFree(course.priceCents);
  const price = free ? "Gratis" : formatMoney(course.priceCents!, course.currency);
  const here = `/catalogo/${brand.slug}/${course.id}`;

  return (
    <div className="min-h-screen" style={{ background: "var(--cloud)" }}>
      <BrandHeader brand={brand} />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
        <Link href={`/catalogo/${brand.slug}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700">← Todos los cursos</Link>

        <div className="mt-2 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-6">
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {course.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- portada externa del curso
                <img src={course.imageUrl} alt="" className="aspect-video w-full object-cover" />
              )}
              <div className="space-y-2 p-5">
                <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: "var(--navy)" }}>{course.name}</h1>
                <p className="text-slate-700">Con <strong>{course.teacherName}</strong></p>
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                  <span>{course.lessons === 1 ? "1 lección" : `${course.lessons} lecciones`}</span>
                  <Stars rating={course.rating} count={course.reviewCount} />
                </p>
                <p className="pt-1 text-2xl font-bold text-slate-950 lg:hidden">{price}</p>
                <a href={own.canReview ? `/dashboard/aula/${course.id}` : "#inscribirse"} className="flex min-h-11 w-full items-center justify-center rounded-lg bg-blue-600 px-4 font-semibold text-white lg:hidden">
                  {own.canReview ? "Ir al curso" : free ? "Inscribirme gratis" : "Comprar curso"}
                </a>
                {course.description && <p className="whitespace-pre-line pt-2 text-slate-800">{course.description}</p>}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="temario">
              <h2 id="temario" className="text-lg font-bold text-slate-950">Temario</h2>
              {course.sections.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">El docente todavía está preparando el temario.</p>
              ) : (
                <ol className="mt-3 space-y-4">
                  {course.sections.map((section, index) => (
                    <li key={section.id}>
                      <p className="font-semibold text-slate-900">{index + 1}. {section.title}</p>
                      {section.lessons.length > 0 && (
                        <ul className="mt-1 space-y-1 border-l-2 border-slate-200 pl-4 text-sm text-slate-700">
                          {section.lessons.map((lesson) => <li key={lesson.id}>{lesson.title}</li>)}
                        </ul>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="resenas" id="resena">
              <h2 id="resenas" className="text-lg font-bold text-slate-950">Reseñas</h2>
              {own.canReview ? (
                <ReviewForm slug={brand.slug} courseId={course.id} rating={own.review?.rating ?? 0} comment={own.review?.comment ?? ""} />
              ) : !session ? (
                <p className="mt-2 text-sm text-slate-600">
                  ¿Tomas este curso? <Link className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline" href={`/login?callbackUrl=${encodeURIComponent(`${here}#resena`)}`}>Entra para dejar tu reseña</Link>
                </p>
              ) : null}
              {course.reviews.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">Todavía nadie ha dejado una reseña de este curso.</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100">
                  {course.reviews.map((review) => (
                    <li key={review.id} className="py-3">
                      <p className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-amber-500" aria-label={`${review.rating} de 5 estrellas`}>{"★".repeat(review.rating)}<span className="text-slate-300">{"★".repeat(5 - review.rating)}</span></span>
                        <strong className="text-slate-900">{review.author}</strong>
                      </p>
                      {review.comment && <p className="mt-1 whitespace-pre-line text-slate-800">{review.comment}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="lg:sticky lg:top-6 lg:self-start" id="inscribirse">
            <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="precio">
              <p id="precio" className="text-3xl font-bold text-slate-950">{price}</p>
              {own.canReview ? (
                <>
                  <p className="mt-2 text-sm text-slate-700">Ya estás inscrito en este curso.</p>
                  <Link href={`/dashboard/aula/${course.id}`} className="mt-3 flex min-h-11 w-full items-center justify-center rounded-lg bg-blue-600 px-4 font-semibold text-white">Ir al curso</Link>
                </>
              ) : (
                <EnrollForm slug={brand.slug} courseId={course.id} free={free} />
              )}
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
