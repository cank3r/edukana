import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { BarChart3, BookOpen, CalendarDays, CheckCircle2, ChevronRight, Circle, ClipboardCheck, GraduationCap, HelpCircle, Pencil, PlayCircle, Users, Video } from "lucide-react";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { canManageCourse, courseWhereForScope, resolveCourseReadScope, resolveCourseWriteScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import { ScheduleForm } from "@/components/dashboard/AcademicForms";
import { courseListWhere, courseStatusLabel } from "@/server/courses/course";

export const dynamic = "force-dynamic";

const card = "rounded-2xl border border-slate-200 bg-white p-5";
const tool = "rounded-xl border border-slate-200 bg-white px-4 [&>summary]:flex [&>summary]:min-h-11 [&>summary]:cursor-pointer [&>summary]:items-center [&>summary]:gap-2 [&>summary]:py-3 [&>summary]:font-semibold [&>summary]:text-slate-900";
const time = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const day = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const statusStyle = { Publicado: "bg-emerald-400/20 text-emerald-100", Borrador: "bg-amber-400/20 text-amber-100", Archivado: "bg-white/15 text-slate-100" } as const;

export default async function CourseHomePage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const { courseId } = await params;
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("course.view")) notFound();
  const readScope = resolveCourseReadScope(user, capabilities);
  const isStudent = readScope.kind === "student";
  // El estudiante solo entra a cursos publicados y no archivados; quien gestiona ve también los archivados.
  const readWhere = isStudent ? courseListWhere(user.institutionId, readScope) : courseWhereForScope(user.institutionId, readScope);
  if (!readWhere) notFound();

  const course = await db.course.findFirst({
    where: { id: courseId, ...readWhere },
    select: {
      id: true,
      name: true,
      code: true,
      description: true,
      teacherId: true,
      isPublished: true,
      archivedAt: true,
      imageUrl: true,
      completionThreshold: true,
      teacher: { select: { name: true } },
      period: { select: { name: true } },
      scheduleSlots: { orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }] },
      _count: { select: { lessons: true, assignments: true, exams: true, questionBank: true, liveClasses: true } },
    },
  });
  if (!course) notFound();

  const canManage = canManageCourse(resolveCourseWriteScope(user, capabilities), course.teacherId);
  const canViewRoster = !isStudent && capabilities.has("course.roster.view");
  const base = `/dashboard/aula/${course.id}`;
  const status = courseStatusLabel(course);

  const enrollments = isStudent || canViewRoster
    ? await db.enrollment.findMany({
        where: { courseId: course.id, status: { in: ["ACTIVE", "COMPLETED"] }, ...(isStudent ? { studentId: user.id } : {}) },
        orderBy: { student: { name: "asc" } },
        select: { id: true, studentId: true, status: true, progressPercent: true, student: { select: { name: true } }, certificates: { select: { verificationCode: true }, take: 1 } },
      })
    : [];
  const own = isStudent ? enrollments[0] : undefined;
  if (isStudent && !own) notFound();

  // Temario del estudiante: solo capítulos y lecciones publicados, con lo que ya completó.
  const sections = isStudent
    ? await db.courseSection.findMany({
        where: { courseId: course.id, isPublished: true },
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          lessons: {
            where: { isPublished: true },
            orderBy: { order: "asc" },
            select: { id: true, title: true, estimatedMinutes: true, progress: { where: { enrollmentId: own!.id, completed: true }, select: { id: true }, take: 1 } },
          },
        },
      })
    : [];
  const lessons = sections.flatMap((section) => section.lessons);
  const nextLesson = lessons.find((lesson) => lesson.progress.length === 0);
  const completedLessons = lessons.filter((lesson) => lesson.progress.length > 0).length;
  const readOnly = own?.status === "COMPLETED";

  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const activeStudents = enrollments.length;

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8">
      <header className="mb-6 overflow-hidden rounded-3xl p-6 text-white sm:p-8" style={{ background: "linear-gradient(135deg,var(--navy),#173b9c)" }}>
        {course.imageUrl && <Image src={course.imageUrl} alt="" width={1024} height={320} unoptimized priority className="-mx-6 -mt-6 mb-5 aspect-[16/5] w-[calc(100%+3rem)] max-w-none object-cover sm:-mx-8 sm:-mt-8 sm:w-[calc(100%+4rem)]" />}
        <div className="flex flex-wrap items-center gap-2">
          {!isStudent && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyle[status]}`}>{status}</span>}
          {course.code && <span className="rounded bg-white/10 px-2 py-1 font-mono text-xs text-cyan-100">{course.code}</span>}
        </div>
        <h1 className="mt-3 text-2xl font-bold sm:text-3xl">{course.name}</h1>
        {course.description && <p className="mt-2 max-w-3xl whitespace-pre-wrap text-slate-200">{course.description}</p>}
        <p className="mt-4 text-sm text-slate-200">Docente: {course.teacher.name} · {course.period.name}{canViewRoster && ` · ${count(activeStudents, "estudiante", "estudiantes")}`}</p>
      </header>

      {!isStudent && course.archivedAt && (
        <p className="mb-5 rounded-xl border border-slate-300 bg-slate-50 p-4 text-sm text-slate-800"><strong>Este curso está archivado.</strong> Nadie lo ve en sus listas y no se perdió nada.{canManage && <> Puedes restaurarlo desde <Link className="font-semibold text-blue-700 underline" href={`${base}/editar`}>Editar curso</Link>.</>}</p>
      )}
      {canManage && !course.archivedAt && !course.isPublished && (
        <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>Este curso es un borrador.</strong> Tus estudiantes todavía no lo ven. Cuando esté listo, publícalo desde <Link className="font-semibold text-blue-700 underline" href={`${base}/editar`}>Editar curso</Link>.</p>
      )}
      {readOnly && <p className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><strong>Ya completaste este curso.</strong> Puedes consultar todo, pero ya no entregar tareas ni presentar exámenes.</p>}

      {isStudent ? (
        <>
          <section className={`${card} mb-6`} aria-labelledby="mi-avance">
            <h2 id="mi-avance" className="text-lg font-bold text-slate-950">Tu avance</h2>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(own!.progressPercent)} aria-label="Avance en el curso">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round(own!.progressPercent)}%` }} />
            </div>
            <p className="mt-2 text-sm text-slate-600">{lessons.length ? `${completedLessons} de ${count(lessons.length, "lección completada", "lecciones completadas")}` : "Tu docente todavía no publicó lecciones."}</p>
            {nextLesson ? (
              <Link href={`${base}/leccion/${nextLesson.id}`} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white"><PlayCircle size={18} aria-hidden="true" />{completedLessons ? "Continuar estudiando" : "Empezar a estudiar"}</Link>
            ) : lessons.length > 0 ? (
              <p className="mt-3 text-sm font-semibold text-emerald-800">Completaste todas las lecciones. Puedes repasarlas en el temario.</p>
            ) : null}
            {nextLesson && <p className="mt-2 text-sm text-slate-600">Sigue: {nextLesson.title}</p>}
          </section>

          <nav aria-label="Áreas del curso" className="mb-8 grid gap-3 sm:grid-cols-2">
            <AreaCard href={`${base}/tareas`} icon={<ClipboardCheck />} title="Tareas" text="Mira qué tienes pendiente y entrega." />
            <AreaCard href={`${base}/presentar`} icon={<GraduationCap />} title="Exámenes" text="Presenta tus exámenes y revisa los resultados." />
            <AreaCard href={`${base}/mis-notas`} icon={<BarChart3 />} title="Mis notas" text="Consulta cómo vas en el curso." />
            <AreaCard href={`${base}/clases`} icon={<Video />} title="Clases en vivo" text="Entra a la próxima clase." />
          </nav>

          <section aria-labelledby="temario" className="mb-8">
            <h2 id="temario" className="mb-3 text-xl font-bold text-slate-950">Temario</h2>
            {sections.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">Aquí verás los capítulos y lecciones del curso cuando tu docente los publique.</p>
            ) : (
              <ol className="space-y-4">
                {sections.map((section, index) => (
                  <li className={card} key={section.id}>
                    <p className="text-xs font-bold uppercase text-blue-700">Capítulo {index + 1}</p>
                    <h3 className="text-lg font-bold text-slate-950">{section.title}</h3>
                    {section.lessons.length === 0 ? <p className="mt-2 text-sm text-slate-600">Todavía sin lecciones.</p> : (
                      <ul className="mt-2 divide-y divide-slate-100">
                        {section.lessons.map((lesson) => {
                          const done = lesson.progress.length > 0;
                          return (
                            <li key={lesson.id}>
                              <Link href={`${base}/leccion/${lesson.id}`} className="flex min-h-11 items-center gap-3 py-2.5">
                                {done ? <CheckCircle2 size={20} className="shrink-0 text-emerald-600" aria-hidden="true" /> : <Circle size={20} className="shrink-0 text-slate-300" aria-hidden="true" />}
                                <span className="flex-1 font-medium text-slate-900">{lesson.title}<span className="sr-only">{done ? " (completada)" : " (pendiente)"}</span></span>
                                <span className="shrink-0 text-xs text-slate-500">{lesson.estimatedMinutes} min</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      ) : (
        <nav aria-label="Áreas del curso" className="mb-8 grid gap-3 sm:grid-cols-2">
          <AreaCard href={`${base}/contenido`} icon={<BookOpen />} title={canManage ? "Armar el contenido" : "Ver el contenido"} text={`Capítulos y lecciones · ${count(course._count.lessons, "lección", "lecciones")}`} />
          {canViewRoster && <AreaCard href={`${base}/estudiantes`} icon={<Users />} title={canManage ? "Inscribir estudiantes" : "Ver estudiantes"} text={`Quién está en el curso y cómo avanza · ${count(activeStudents, "inscrito", "inscritos")}`} />}
          <AreaCard href={`${base}/tareas`} icon={<ClipboardCheck />} title={canManage ? "Crear y revisar tareas" : "Ver tareas"} text={count(course._count.assignments, "tarea", "tareas")} />
          {canManage && <AreaCard href={`${base}/preguntas`} icon={<HelpCircle />} title="Preparar preguntas" text={`Banco de preguntas para tus exámenes · ${count(course._count.questionBank, "pregunta", "preguntas")}`} />}
          <AreaCard href={`${base}/examenes`} icon={<GraduationCap />} title={canManage ? "Crear y revisar exámenes" : "Ver exámenes"} text={count(course._count.exams, "examen", "exámenes")} />
          {canViewRoster && <AreaCard href={`${base}/calificaciones`} icon={<BarChart3 />} title={canManage ? "Poner calificaciones" : "Ver calificaciones"} text="El libro de notas del curso." />}
          <AreaCard href={`${base}/clases`} icon={<Video />} title={canManage ? "Programar clases en vivo" : "Ver clases en vivo"} text={count(course._count.liveClasses, "clase programada", "clases programadas")} />
          {canManage && <AreaCard href={`${base}/editar`} icon={<Pencil />} title="Editar curso" text="Corregir datos, publicar o archivar." />}
        </nav>
      )}

      <section aria-labelledby="mas-herramientas">
        <h2 id="mas-herramientas" className="mb-3 text-xl font-bold text-slate-950">Más herramientas</h2>
        <div className="space-y-3">
          <Link className={`${tool} flex min-h-11 items-center gap-2 p-4 font-semibold text-slate-900`} href={`${base}/asistencia`}><Users size={18} aria-hidden="true" />{isStudent ? "Mi asistencia" : "Tomar y revisar asistencia"}</Link>

          <details className={tool} id="horario">
            <summary><CalendarDays size={18} aria-hidden="true" />Horario</summary>
            <div className="space-y-4 pb-4">
              {course.scheduleSlots.length ? (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {course.scheduleSlots.map((slot) => (
                    <li className="rounded-xl bg-slate-50 p-4" key={slot.id}>
                      <p className="font-bold text-slate-900">{day[slot.weekday]} {time(slot.startMinutes)}–{time(slot.endMinutes)}</p>
                      <p className="text-sm text-slate-600">{slot.classroom}</p>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-slate-600">Este curso todavía no tiene horario.</p>}
              {canManage && <ScheduleForm courseId={course.id} />}
            </div>
          </details>

          <Link className={`${tool} flex min-h-11 items-center gap-2 p-4 font-semibold text-slate-900`} href={`${base}/certificados`}><GraduationCap size={18} aria-hidden="true" />{isStudent ? "Mi certificado" : "Certificados del curso"}</Link>
        </div>
      </section>
    </div>
  );
}

function AreaCard({ href, icon, title, text }: { href: string; icon: ReactNode; title: string; text: string }) {
  return (
    <Link href={href} className="flex min-h-20 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 transition-shadow hover:border-blue-400 hover:shadow-md">
      <span className="shrink-0 rounded-xl bg-blue-50 p-3 text-blue-700" aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-bold text-slate-950">{title}</span>
        <span className="block text-sm text-slate-600">{text}</span>
      </span>
      <ChevronRight size={20} className="shrink-0 text-slate-400" aria-hidden="true" />
    </Link>
  );
}
