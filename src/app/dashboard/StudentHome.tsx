import Link from "next/link";
import { AlertCircle, BookOpen, ChevronRight, ClipboardList, FileText, PlayCircle, Video } from "lucide-react";
import { formatAverage } from "@/lib/grade-format";
import { getStudentHome, type HomeActor, type HomeLiveClass, type StudentCourse } from "@/server/student-home";

type Props = { user: HomeActor; userName?: string | null };

const sectionTitle = "mb-3 text-lg font-bold text-slate-900";
const card = "rounded-xl border border-slate-200 bg-white p-4";

/** Inicio del estudiante: por dónde iba, sus clases, lo pendiente y sus cursos. */
export async function StudentHome({ user, userName }: Props) {
  const home = await getStudentHome(user);
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
          <p className="font-semibold text-slate-900">{home.notEnrolled ? "Todavía no estás inscrito en ningún curso" : "No tienes cursos en marcha"}</p>
          <p className="mt-1 text-sm text-slate-700">
            {home.notEnrolled
              ? "Tu institución debe inscribirte. Cuando lo haga, tus cursos, clases y tareas aparecerán aquí."
              : "Cuando tu institución te inscriba en un curso nuevo, aparecerá aquí."}
          </p>
          {!home.notEnrolled && (
            <Link href="/dashboard/aula" className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:border-blue-400">Ver mis cursos terminados</Link>
          )}
        </div>
      ) : (
        <>
          {home.continueLesson && (
            <section className="mb-8" aria-labelledby="continua">
              <h2 id="continua" className={sectionTitle}>Continúa donde ibas</h2>
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm text-slate-700">{home.continueLesson.courseName}</p>
                <p className="mt-1 break-words text-lg font-semibold text-slate-950">{home.continueLesson.lessonTitle}</p>
                <Link href={home.continueLesson.href} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-3 text-base font-semibold text-white hover:bg-blue-800 sm:w-auto sm:inline-flex">
                  <PlayCircle size={20} aria-hidden="true" />
                  Continuar
                </Link>
              </div>
            </section>
          )}

          <section className="mb-8" aria-labelledby="proximos-dias">
            <h2 id="proximos-dias" className={sectionTitle}>Hoy y próximos días</h2>
            <LiveClassList classes={home.liveClasses} empty="No tienes clases en vivo en los próximos 7 días." />
          </section>

          <section className="mb-8" aria-labelledby="pendientes">
            <h2 id="pendientes" className={sectionTitle}>Pendientes</h2>
            {home.pending.length === 0 ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="font-semibold text-emerald-900">Todo al día</p>
                <p className="text-sm text-emerald-800">No tienes tareas ni exámenes pendientes.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {home.pending.map((item) => (
                  <li key={`${item.kind}-${item.id}`}>
                    <Link href={item.href} className={`flex min-h-14 items-center gap-3 rounded-xl border bg-white p-4 hover:shadow-sm ${item.overdue ? "border-red-300 hover:border-red-400" : "border-slate-200 hover:border-blue-300"}`}>
                      <span className={`shrink-0 rounded-lg p-2 ${item.overdue ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>
                        {item.overdue ? <AlertCircle size={20} aria-hidden="true" /> : item.kind === "exam" ? <ClipboardList size={20} aria-hidden="true" /> : <FileText size={20} aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block break-words font-semibold text-slate-900">{item.title}</span>
                        <span className="block text-sm text-slate-600">{item.kind === "exam" ? "Examen" : "Tarea"} · {item.courseName}</span>
                        <span className={`block text-sm ${item.overdue ? "font-semibold text-red-700" : "text-slate-700"}`}>
                          {item.kind === "exam" ? examText(item.dueText, item.retry) : item.dueText ?? "Sin fecha límite"}
                        </span>
                      </span>
                      <ChevronRight className="shrink-0 text-slate-400" size={18} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mb-8" aria-labelledby="mis-cursos">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="mis-cursos" className="text-lg font-bold text-slate-900">Mis cursos</h2>
              <Link href="/dashboard/aula" className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline">Ver todos</Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {home.courses.map((course) => <CourseCard key={course.courseId} course={course} />)}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function examText(dueText: string | null, retry: boolean) {
  const lead = retry ? "Puedes volver a intentarlo" : "Sin presentar";
  return dueText ? `${lead} · ${dueText}` : lead;
}

/** Tarjeta de curso con barra de avance; también la usa «Mis cursos». */
export function CourseCard({ course }: { course: StudentCourse }) {
  return (
    <Link href={`/dashboard/aula/${course.courseId}`} className={`${card} block min-h-11 hover:border-blue-300 hover:shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 break-words font-semibold text-slate-900">{course.name}</p>
        {course.completed && <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">Completado</span>}
      </div>
      <p className="mt-1 text-sm text-slate-600">{course.teacherName}</p>
      {/* Un curso completado dice «Completado» (arriba) y su nota final, no un avance de lecciones. */}
      {!course.completed && (
        <>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={course.progressPercent} aria-label={`Avance en ${course.name}`}>
            <div className="h-full rounded-full bg-blue-700" style={{ width: `${course.progressPercent}%` }} />
          </div>
          <p className="mt-1 text-sm text-slate-700">{course.progressPercent}% completado</p>
        </>
      )}
      {course.finalGrade !== null && <p className="mt-2 text-sm text-slate-900">Nota final: <strong>{formatAverage(course.finalGrade)}</strong></p>}
    </Link>
  );
}

/**
 * Próximas clases en vivo. Para el estudiante el botón solo se activa desde 15 minutos antes hasta que termina;
 * quien da la clase (`host`) puede entrar cuando quiera, igual que en la pantalla de clases del curso.
 */
export function LiveClassList({ classes, empty, host = false }: { classes: HomeLiveClass[]; empty: string; host?: boolean }) {
  if (classes.length === 0) return <p className={`${card} text-sm text-slate-700`}>{empty}</p>;
  return (
    <ul className="space-y-3">
      {classes.map((item) => (
        <li key={item.id} className={card}>
          <div className="flex items-start gap-3">
            <span className="shrink-0 rounded-lg bg-blue-50 p-2 text-blue-700"><Video size={20} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="break-words font-semibold text-slate-900">{item.title}</p>
              <p className="text-sm text-slate-600">{item.courseName}</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{item.when} · {Math.round((item.endsAt.getTime() - item.startsAt.getTime()) / 60_000)} min</p>
            </div>
          </div>
          {(item.canJoin || host) && item.joinUrl ? (
            <a href={item.joinUrl} target="_blank" rel="noopener noreferrer" className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-3 text-base font-semibold text-white hover:bg-emerald-800 sm:w-auto sm:inline-flex">
              Entrar a clase
              <span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
          ) : (
            <p className="mt-3 text-sm text-slate-700">
              {item.joinUrl ? "Podrás entrar 15 minutos antes de la hora." : "El enlace de esta clase no está disponible. Avisa a tu docente."}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
