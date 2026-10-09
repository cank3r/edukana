import Link from "next/link";
import { AlertCircle, BookOpen, ChevronRight, ClipboardCheck, Megaphone, UserPlus, Users } from "lucide-react";
import type { Capability } from "@/lib/capabilities";
import { STALE_SUBMISSION_DAYS } from "@/server/admin-home";
import { getCoordinatorHome, type CoordinatorActor } from "@/server/coordinator-home";

type Props = { actor: CoordinatorActor; capabilities: ReadonlySet<Capability>; userName?: string | null };

const sectionTitle = "mb-3 text-lg font-bold text-slate-900";
const card = "rounded-xl border border-slate-200 bg-white p-4";
const smallLink = "inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:border-blue-400";
const plural = (count: number, one: string, many: string) => (count === 1 ? `1 ${one}` : `${count} ${many}`);
/** Cuántos cursos por completar se listan aquí; el resto está en «Cursos». */
const GAPS_SHOWN = 6;

/** Inicio de quien coordina: qué cursos necesitan atención, qué docentes van atrasados y los avisos recientes. */
export async function CoordinatorHome({ actor, capabilities, userName }: Props) {
  const home = await getCoordinatorHome(actor, capabilities);
  const firstName = userName?.split(" ")[0];
  const canPublish = capabilities.has("announcement.publish");
  const day = new Intl.DateTimeFormat("es", { timeZone: home.timezone, day: "numeric", month: "long" });
  const allClear = home.lateGrading.length === 0 && home.gaps.length === 0;

  const actions = [
    { href: "/dashboard/aula", label: "Ver cursos", icon: <BookOpen size={20} aria-hidden="true" /> },
    ...(canPublish ? [{ href: "/dashboard/comunidad", label: "Publicar un aviso", icon: <Megaphone size={20} aria-hidden="true" /> }] : []),
    ...(capabilities.has("people.view") ? [{ href: "/dashboard/gestion", label: "Ver personas", icon: <Users size={20} aria-hidden="true" /> }] : []),
    ...(capabilities.has("admissions.manage") ? [{ href: "/dashboard/admisiones", label: "Admisiones", icon: <UserPlus size={20} aria-hidden="true" /> }] : []),
  ];

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <header className="mb-6">
        <p className="mb-1 text-sm text-slate-600">Hola{firstName ? `, ${firstName}` : ""}</p>
        <h1 className="break-words text-2xl font-bold" style={{ color: "var(--navy)" }}>{home.institutionName || "Tu institución"}</h1>
        <p className="mt-1 text-sm text-slate-600">{home.courseCount === 0 ? "Todavía no hay cursos activos." : `${plural(home.courseCount, "curso activo", "cursos activos")}.`}</p>
      </header>

      <section className="mb-8" aria-labelledby="requiere-atencion">
        <h2 id="requiere-atencion" className={sectionTitle}>Requiere tu atención</h2>
        {allClear ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="font-semibold text-emerald-900">Todo al día</p>
            <p className="text-sm text-emerald-800">Ningún curso tiene entregas atrasadas sin nota, y todos tienen estudiantes y contenido publicado.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {home.lateGrading.length > 0 && (
              <div>
                <h3 className="mb-2 font-semibold text-slate-900">Entregas atrasadas sin calificar</h3>
                <ul className="space-y-3">
                  {home.lateGrading.map((course) => (
                    <li key={course.courseId}>
                      <Link href={`/dashboard/aula/${course.courseId}/tareas`} className="flex min-h-14 items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 hover:border-amber-400">
                        <span className="shrink-0 rounded-lg bg-white p-2 text-amber-700"><ClipboardCheck size={20} aria-hidden="true" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block break-words font-semibold text-slate-950">{course.name}</span>
                          <span className="block text-sm text-slate-700">{course.teacherName} · {plural(course.waiting, "entrega lleva", "entregas llevan")} más de {STALE_SUBMISSION_DAYS} días sin nota</span>
                        </span>
                        <ChevronRight className="shrink-0 text-slate-500" size={18} aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {home.gaps.length > 0 && (
              <div>
                <h3 className="mb-2 font-semibold text-slate-900">Cursos por completar</h3>
                <p className="mb-2 text-sm text-slate-600">Un estudiante solo ve un curso si está inscrito y si hay lecciones publicadas.</p>
                <ul className="space-y-3">
                  {home.gaps.slice(0, GAPS_SHOWN).map((course) => (
                    <li key={course.courseId} className={card}>
                      <div className="flex items-start gap-3">
                        <AlertCircle className="mt-0.5 shrink-0 text-amber-700" size={20} aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <Link href={`/dashboard/aula/${course.courseId}`} className="break-words font-semibold text-slate-950 underline-offset-2 hover:underline">{course.name}</Link>
                          <p className="text-sm text-slate-600">{course.teacherName}</p>
                          <p className="mt-1 text-sm text-slate-800">
                            {course.noStudents && course.noContent ? "Sin estudiantes inscritos y sin contenido publicado." : course.noStudents ? "Sin estudiantes inscritos." : "Sin contenido publicado."}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {course.noStudents && <Link href={`/dashboard/aula/${course.courseId}/estudiantes`} className={smallLink}>Inscribir estudiantes</Link>}
                            {course.noContent && <Link href={`/dashboard/aula/${course.courseId}/contenido`} className={smallLink}>Ver contenido</Link>}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                {home.gaps.length > GAPS_SHOWN && (
                  <Link href="/dashboard/aula" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline">
                    Ver los {home.gaps.length} cursos en «Cursos»
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="mb-8" aria-labelledby="docentes-pendientes">
        <h2 id="docentes-pendientes" className={sectionTitle}>Docentes con más pendientes</h2>
        {home.teachers.length === 0 ? (
          <p className={`${card} text-sm text-slate-700`}>Ningún docente tiene entregas esperando nota.</p>
        ) : (
          <ul className="space-y-2">
            {home.teachers.map((teacher) => (
              <li key={teacher.teacherId} className={`${card} flex items-center justify-between gap-3`}>
                <span className="min-w-0 break-words font-semibold text-slate-900">{teacher.name}</span>
                <span className="shrink-0 text-right text-sm text-slate-700">
                  {plural(teacher.waiting, "entrega por calificar", "entregas por calificar")}
                  <span className="block text-xs text-slate-500">en {plural(teacher.courses, "curso", "cursos")}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8" aria-labelledby="avisos-recientes">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="avisos-recientes" className="text-lg font-bold text-slate-900">Avisos recientes</h2>
          <Link href="/dashboard/comunidad" className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline">Ver todos</Link>
        </div>
        {home.announcements.length === 0 ? (
          <div className={card}>
            <p className="text-sm text-slate-700">Todavía no hay avisos.</p>
            {canPublish && <Link href="/dashboard/comunidad" className={`${smallLink} mt-3`}>Publicar un aviso</Link>}
          </div>
        ) : (
          <ul className="space-y-2">
            {home.announcements.map((announcement) => (
              <li key={announcement.id}>
                <Link href="/dashboard/comunidad" className={`${card} block min-h-11 hover:border-blue-300`}>
                  <span className="block break-words font-semibold text-slate-900">{announcement.title}</span>
                  <span className="block text-sm text-slate-600">{day.format(announcement.publishedAt)} · {announcement.authorName}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8" aria-labelledby="acciones-frecuentes">
        <h2 id="acciones-frecuentes" className={sectionTitle}>Acciones frecuentes</h2>
        <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
          {actions.map((action) => (
            <Link key={action.label} href={action.href} className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 font-semibold text-slate-900 hover:border-blue-300 hover:shadow-sm">
              <span className="rounded-lg bg-blue-50 p-2 text-blue-700">{action.icon}</span>
              <span className="min-w-0 flex-1">{action.label}</span>
              <ChevronRight className="shrink-0 text-slate-400" size={18} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
