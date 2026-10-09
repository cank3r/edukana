import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BookOpen, ChevronRight, Plus, Users } from "lucide-react";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { resolveCourseReadScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import { courseListWhere, courseStatusLabel } from "@/server/courses/course";

export const dynamic = "force-dynamic";

const statusStyle = {
  Publicado: "bg-emerald-50 text-emerald-800",
  Borrador: "bg-amber-50 text-amber-900",
  Archivado: "bg-slate-100 text-slate-700",
} as const;

export default async function AulaPage({ searchParams }: { searchParams: Promise<{ q?: string; ver?: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("course.view")) notFound();

  const readScope = resolveCourseReadScope(user, capabilities);
  const isStudent = readScope.kind === "student";
  const canCreate = capabilities.has("course.create") && readScope.kind === "all";
  const showRoster = capabilities.has("course.roster.view");
  const params = await searchParams;
  const query = params.q?.trim().slice(0, 100) ?? "";
  const archived = !isStudent && params.ver === "archivados";
  const where = courseListWhere(user.institutionId, readScope, { archived });

  const courses = where
    ? await db.course.findMany({
        where: { ...where, ...(query ? { name: { contains: query, mode: "insensitive" as const } } : {}) },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          name: true,
          code: true,
          isPublished: true,
          archivedAt: true,
          teacher: { select: { name: true } },
          period: { select: { name: true } },
          _count: { select: { enrollments: { where: { status: { in: ["ACTIVE", "COMPLETED"] } } }, lessons: true } },
          enrollments: {
            where: { studentId: isStudent ? user.id : "__none__" },
            select: { progressPercent: true },
            take: 1,
          },
        },
      })
    : [];
  const filtering = Boolean(query) || archived;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">{isStudent ? "Mis cursos" : "Cursos"}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {isStudent ? "Continúa aprendiendo desde tus cursos publicados." : "Crea, publica y archiva cursos sin perder su historial."}
          </p>
        </div>
        {canCreate && (
          <Link href="/dashboard/aula/nuevo" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white">
            <Plus size={18} aria-hidden="true" />Crear curso
          </Link>
        )}
      </header>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <form className="flex flex-1 gap-2" role="search">
          {archived && <input type="hidden" name="ver" value="archivados" />}
          <label className="sr-only" htmlFor="course-search">Buscar curso por nombre</label>
          <input
            id="course-search"
            name="q"
            defaultValue={query}
            placeholder="Buscar por nombre…"
            className="min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
          <button type="submit" className="min-h-11 rounded-lg border border-blue-600 bg-white px-4 font-semibold text-blue-700">Buscar</button>
        </form>
        {!isStudent && (
          <nav aria-label="Filtrar cursos" className="flex gap-2">
            <FilterLink active={!archived} href={query ? `/dashboard/aula?q=${encodeURIComponent(query)}` : "/dashboard/aula"}>Activos</FilterLink>
            <FilterLink active={archived} href={`/dashboard/aula?ver=archivados${query ? `&q=${encodeURIComponent(query)}` : ""}`}>Archivados</FilterLink>
          </nav>
        )}
      </div>

      {courses.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center sm:p-12">
          <BookOpen size={40} className="mx-auto mb-3 text-slate-300" aria-hidden="true" />
          {filtering ? (
            <>
              <h2 className="font-semibold text-slate-950">{query ? `No encontramos cursos con «${query}».` : "No hay cursos archivados."}</h2>
              <p className="mt-1 text-sm text-slate-600">{query ? "Prueba con otra palabra o quita la búsqueda." : "Cuando archives un curso aparecerá aquí."}</p>
              <Link href="/dashboard/aula" className="mt-4 inline-flex min-h-11 items-center font-semibold text-blue-700 underline">Ver cursos activos</Link>
            </>
          ) : isStudent ? (
            <>
              <h2 className="font-semibold text-slate-950">Todavía no tienes cursos publicados</h2>
              <p className="mt-1 text-sm text-slate-600">Aquí aparecerán cuando tu institución te inscriba y el curso esté listo.</p>
            </>
          ) : canCreate ? (
            <>
              <h2 className="font-semibold text-slate-950">Todavía no hay cursos</h2>
              <p className="mt-1 text-sm text-slate-600">Crea el primero. Nacerá como borrador para que puedas prepararlo antes de publicarlo.</p>
              <Link href="/dashboard/aula/nuevo" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white">
                <Plus size={18} aria-hidden="true" />Crear curso
              </Link>
            </>
          ) : (
            <>
              <h2 className="font-semibold text-slate-950">Todavía no hay cursos disponibles</h2>
              <p className="mt-1 text-sm text-slate-600">La administración debe crear el primer curso.</p>
            </>
          )}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => {
            const status = courseStatusLabel(course);
            const progress = Math.round(course.enrollments[0]?.progressPercent ?? 0);
            return (
              <li key={course.id}>
                <Link href={`/dashboard/aula/${course.id}`} className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 focus-visible:ring-2 focus-visible:ring-blue-500 hover:shadow-md">
                  <div className="flex flex-wrap items-center gap-2">
                    {!isStudent && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle[status]}`}>{status}</span>}
                    {course.code && <span className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">{course.code}</span>}
                  </div>
                  <h2 className="mt-3 text-lg font-bold text-slate-950">{course.name}</h2>
                  <p className="mt-1 text-sm text-slate-600">{course.teacher.name} · {course.period.name}</p>
                  {isStudent && (
                    <div className="mt-4">
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={`Avance en ${course.name}`}>
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-slate-600">{progress}% completado</p>
                    </div>
                  )}
                  <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-sm text-slate-600">
                    {showRoster ? <span className="flex items-center gap-1.5"><Users size={15} aria-hidden="true" />{course._count.enrollments}</span> : <span>{course._count.lessons} lecciones</span>}
                    <span className="flex items-center gap-1 font-semibold text-blue-700">Abrir<ChevronRight size={16} aria-hidden="true" /></span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FilterLink({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold ${active ? "bg-blue-600 text-white" : "border border-slate-300 bg-white text-slate-800"}`}>
      {children}
    </Link>
  );
}
