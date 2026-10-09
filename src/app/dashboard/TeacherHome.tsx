import Link from "next/link";
import { BookOpen, ChevronRight, ClipboardCheck } from "lucide-react";
import type { HomeActor } from "@/server/student-home";
import { getTeacherHome } from "@/server/teacher-home";
import { LiveClassList } from "./StudentHome";

type Props = { user: HomeActor; userName?: string | null };

const sectionTitle = "mb-3 text-lg font-bold text-slate-900";
const plural = (count: number, one: string, many: string) => (count === 1 ? `1 ${one}` : `${count} ${many}`);
const smallLink = "inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:border-blue-400";

/** Inicio del docente: qué calificar, sus clases en vivo y sus cursos. */
export async function TeacherHome({ user, userName }: Props) {
  const home = await getTeacherHome(user);
  const firstName = userName?.split(" ")[0];

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <header className="mb-6">
        <p className="mb-1 text-sm text-slate-600">Hola{firstName ? `, ${firstName}` : ""}</p>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>¿Qué tengo hoy?</h1>
      </header>

      {home.courses.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
          <BookOpen className="mx-auto mb-3 text-slate-400" size={32} aria-hidden="true" />
          <p className="font-semibold text-slate-900">Todavía no tienes cursos a tu cargo</p>
          <p className="mt-1 text-sm text-slate-700">Quien administra tu institución debe asignarte un curso. Cuando lo haga, aparecerá aquí con sus estudiantes y entregas.</p>
        </div>
      ) : (
        <>
          <section className="mb-8" aria-labelledby="por-calificar">
            <h2 id="por-calificar" className={sectionTitle}>Por calificar</h2>
            {home.toGrade.length === 0 ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="font-semibold text-emerald-900">Todo al día</p>
                <p className="text-sm text-emerald-800">No hay entregas esperando nota.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {home.toGrade.map((course) => (
                  <li key={course.courseId}>
                    <Link href={`/dashboard/aula/${course.courseId}/tareas`} className="flex min-h-14 items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 hover:border-amber-400">
                      <span className="shrink-0 rounded-lg bg-white p-2 text-amber-700"><ClipboardCheck size={20} aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block break-words font-semibold text-slate-950">{course.name}</span>
                        <span className="block text-sm text-slate-700">{plural(course.toGrade, "entrega espera", "entregas esperan")} nota</span>
                      </span>
                      <ChevronRight className="shrink-0 text-slate-500" size={18} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mb-8" aria-labelledby="clases-en-vivo">
            <h2 id="clases-en-vivo" className={sectionTitle}>Mis próximas clases en vivo</h2>
            <LiveClassList classes={home.liveClasses} empty="No tienes clases en vivo en los próximos 7 días." host />
          </section>

          <section className="mb-8" aria-labelledby="mis-cursos">
            <h2 id="mis-cursos" className={sectionTitle}>Mis cursos</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {home.courses.map((course) => (
                <li key={course.courseId} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/dashboard/aula/${course.courseId}`} className="inline-flex min-h-11 min-w-0 items-center break-words font-semibold text-slate-900 underline-offset-2 hover:underline">{course.name}</Link>
                    {!course.isPublished && <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">Sin publicar</span>}
                  </div>
                  <p className="text-sm text-slate-700">{course.students === 0 ? "Sin estudiantes inscritos" : plural(course.students, "estudiante", "estudiantes")}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/dashboard/aula/${course.courseId}/contenido`} className={smallLink}>Contenido</Link>
                    <Link href={`/dashboard/aula/${course.courseId}/estudiantes`} className={smallLink}>Estudiantes</Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
