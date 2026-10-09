import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BookOpen, ChevronRight, Plus, Users } from "lucide-react";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { resolveCourseReadScope, resolveCourseWriteScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import { courseListWhere, courseStatusLabel } from "@/server/courses/course";

export const dynamic = "force-dynamic";

const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white";
const statusStyle = { Publicado: "bg-emerald-50 text-emerald-800", Borrador: "bg-amber-50 text-amber-900", Archivado: "bg-slate-100 text-slate-700" } as const;

export default async function AulaPage({ searchParams }: { searchParams: Promise<{ q?: string; ver?: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("course.view")) notFound();
  const readScope = resolveCourseReadScope(user, capabilities);
  const isStudent = readScope.kind === "student";
  const canCreate = resolveCourseWriteScope(user, capabilities).kind !== "none";
  const showRoster = capabilities.has("course.roster.view");

  const params = await searchParams;
  const q = params.q?.trim().slice(0, 100) ?? "";
  const archived = !isStudent && params.ver === "archivados";
  const where = courseListWhere(user.institutionId, readScope, { archived });

  const courses = where
    ? await db.course.findMany({
        where: { ...where, ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}) },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          name: true,
          code: true,
          isPublished: true,
          archivedAt: true,
          imageUrl: true,
          teacher: { select: { name: true } },
          period: { select: { name: true } },
          _count: { select: { enrollments: { where: { status: { in: ["ACTIVE", "COMPLETED"] } } } } },
          // Solo el estudiante trae su propia inscripción, para mostrar su avance.
          enrollments: { where: { studentId: isStudent ? user.id : "__ninguna__" }, select: { progressPercent: true, status: true, finalGrade: true }, take: 1 },
        },
      })
    : [];

  const filtering = Boolean(q) || archived;
  // Docente y estudiante ven solo sus cursos: el título coincide con «Mis cursos» del menú.
  const ownCourses = isStudent || user.role === "TEACHER";
  const tab = (active: boolean) => `inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold ${active ? "bg-blue-600 text-white" : "border border-slate-300 bg-white text-slate-800"}`;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>{ownCourses ? "Mis cursos" : "Cursos"}</h1>
          <p className="mt-1 text-sm text-slate-600">{isStudent ? "Entra a un curso para seguir estudiando. Los que terminaste siguen aquí, con tu nota final." : "Crea cursos, entra a trabajar en ellos y archiva los que ya terminaron."}</p>
        </div>
        {canCreate && <Link href="/dashboard/aula/nuevo" className={primary}><Plus size={18} aria-hidden="true" />Crear curso</Link>}
      </header>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <form className="flex flex-1 gap-2" role="search">
          {archived && <input type="hidden" name="ver" value="archivados" />}
          <label className="sr-only" htmlFor="buscar-curso">Buscar curso por nombre</label>
          <input id="buscar-curso" name="q" defaultValue={q} placeholder="Buscar por nombre…" className="min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500" />
          <button type="submit" className="min-h-11 rounded-lg border border-blue-600 px-4 font-semibold text-blue-700">Buscar</button>
        </form>
        {!isStudent && (
          <nav aria-label="Filtrar cursos" className="flex gap-2">
            <Link href={q ? `/dashboard/aula?q=${encodeURIComponent(q)}` : "/dashboard/aula"} aria-current={archived ? undefined : "page"} className={tab(!archived)}>Activos</Link>
            <Link href={`/dashboard/aula?ver=archivados${q ? `&q=${encodeURIComponent(q)}` : ""}`} aria-current={archived ? "page" : undefined} className={tab(archived)}>Archivados</Link>
          </nav>
        )}
      </div>

      {courses.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center sm:p-12">
          <BookOpen size={40} className="mx-auto mb-3 text-slate-300" aria-hidden="true" />
          {filtering ? (
            <>
              <p className="font-semibold text-slate-950">{q ? `No encontramos cursos con «${q}».` : "No hay cursos archivados."}</p>
              <p className="mt-1 text-sm text-slate-600">{q ? "Prueba con otra palabra o quita la búsqueda." : "Cuando archives un curso aparecerá aquí y podrás restaurarlo."}</p>
              <Link href="/dashboard/aula" className="mt-4 inline-flex min-h-11 items-center font-semibold text-blue-700 underline">Ver los cursos activos</Link>
            </>
          ) : isStudent ? (
            <>
              <p className="font-semibold text-slate-950">Todavía no tienes cursos.</p>
              <p className="mt-1 text-sm text-slate-600">Aquí aparecerán los cursos en los que tu institución te inscriba. Si esperabas ver uno, avisa a tu docente o a la administración.</p>
            </>
          ) : canCreate ? (
            <>
              <p className="font-semibold text-slate-950">Todavía no hay cursos.</p>
              <p className="mt-1 text-sm text-slate-600">Un curso reúne las lecciones, las tareas, los exámenes y las notas de un grupo de estudiantes. Crea el primero: nace como borrador y lo publicas cuando esté listo.</p>
              <Link href="/dashboard/aula/nuevo" className={`${primary} mt-4`}><Plus size={18} aria-hidden="true" />Crear curso</Link>
            </>
          ) : (
            <>
              <p className="font-semibold text-slate-950">Todavía no hay cursos.</p>
              <p className="mt-1 text-sm text-slate-600">Cuando la institución cree cursos aparecerán aquí.</p>
            </>
          )}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => {
            const status = courseStatusLabel(course);
            const own = course.enrollments[0];
            const progress = Math.round(own?.progressPercent ?? 0);
            return (
              <li key={course.id}>
                <Link href={`/dashboard/aula/${course.id}`} className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md">
                  {course.imageUrl && <Image src={course.imageUrl} alt="" width={640} height={360} unoptimized className="-mx-5 -mt-5 mb-4 aspect-video w-[calc(100%+2.5rem)] max-w-none bg-slate-100 object-cover" />}
                  <div className="flex flex-wrap items-center gap-2">
                    {!isStudent && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle[status]}`}>{status}</span>}
                    {own?.status === "COMPLETED" && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">Completado</span>}
                    {course.code && <span className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">{course.code}</span>}
                  </div>
                  <h2 className="mt-3 text-lg font-bold" style={{ color: "var(--navy)" }}>{course.name}</h2>
                  <p className="mt-1 text-sm text-slate-600">{course.teacher.name} · {course.period.name}</p>
                  {isStudent && (
                    <div className="mt-4">
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={`Avance en ${course.name}`}>
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-slate-600">{progress}% completado</p>
                      {own?.finalGrade != null && <p className="mt-2 text-sm text-slate-900">Nota final: <strong>{own.finalGrade}</strong></p>}
                    </div>
                  )}
                  <div className="mt-auto flex items-center justify-between pt-4 text-sm text-slate-600">
                    {showRoster ? <span className="flex items-center gap-1.5"><Users size={15} aria-hidden="true" />{course._count.enrollments} {course._count.enrollments === 1 ? "estudiante" : "estudiantes"}</span> : <span />}
                    <span className="flex items-center gap-1 font-semibold text-blue-700">{isStudent ? "Entrar" : "Abrir"}<ChevronRight size={16} aria-hidden="true" /></span>
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
