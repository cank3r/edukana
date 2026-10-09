import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { canManageCourse, courseWhereForScope, resolveCourseReadScope, resolveCourseWriteScope } from "@/lib/course-scope";
import { courseListWhere } from "@/server/courses/course";
import { calculateWeightedGrade } from "@/lib/lms";
import { spanishLabel } from "@/lib/ux";
import CourseTabs from "@/components/dashboard/CourseTabs";
import { AssetUpload, AssignmentForm, AttendanceForm, CertificateForm, EnrollmentCompletionForm, EnrollmentForm, ExamAttemptForm, ExamForm, ExamReviewForm, GradebookForm, LessonForm, ProgressForm, PublishForm, QuestionForm, ReviewForm, ScheduleForm, SectionForm, SubmissionForm } from "@/components/dashboard/AcademicForms";
import { Award, BarChart3, BookOpen, CalendarDays, CheckCircle2, ClipboardCheck, FileText, GraduationCap, PlayCircle, ShieldCheck, Upload, Users } from "lucide-react";

const card = "rounded-2xl border border-slate-200 bg-white p-5";
const details = "rounded-xl border border-slate-200 bg-white p-4 [&>summary]:cursor-pointer [&>summary]:font-semibold [&>summary]:text-blue-700";
const date = (value: Date | null) => value ? new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(value) : "Sin fecha";
const dateOnly = (value: Date) => new Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone: "UTC" }).format(value);
const time = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const day = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default async function CourseDetailPage({ params }: { params: Promise<{ courseId: string }> }) {
  const session = await auth();
  const user = session!.user;
  const { courseId } = await params;
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("course.view")) notFound();
  const readScope = resolveCourseReadScope(user, capabilities);
  const isStudent = readScope.kind === "student";
  const scopedReadWhere = courseWhereForScope(user.institutionId, readScope);
  const readWhere = isStudent ? courseListWhere(user.institutionId, readScope) : scopedReadWhere;
  if (!readWhere) notFound();
  const accessibleCourse = await db.course.findFirst({
    where: { id: courseId, ...readWhere },
    select: { teacherId: true, archivedAt: true },
  });
  if (!accessibleCourse) notFound();
  const writeScope = resolveCourseWriteScope(user, capabilities);
  const canManage = canManageCourse(writeScope, accessibleCourse.teacherId) && !accessibleCourse.archivedAt;
  const canEditCourse = canManage && capabilities.has("course.edit");
  const canChangeCourseState = writeScope.kind === "all" && capabilities.has("course.archive");
  const canEnroll = canManage && capabilities.has("enrollment.manage");
  const canViewRoster = capabilities.has("course.roster.view");
  const course = await db.course.findFirst({
    where: { id: courseId, ...readWhere },
    include: {
      teacher: { select: { name: true } },
      period: { select: { name: true, startDate: true, endDate: true } },
      sections: {
        where: canManage ? {} : { isPublished: true },
        orderBy: { order: "asc" },
        include: {
          lessons: {
            where: canManage ? {} : { isPublished: true },
            orderBy: { order: "asc" },
            include: { assets: true, progress: { where: { enrollment: { studentId: user.id } } } },
          },
        },
      },
      enrollments: {
        where: isStudent
          ? { studentId: user.id, status: { in: ["ACTIVE", "COMPLETED"] as const } }
          : { status: { in: ["ACTIVE", "COMPLETED"] as const } },
        orderBy: { student: { name: "asc" } },
        include: { student: { select: { id: true, name: true, email: true } }, certificates: true },
      },
      attendanceSessions: {
        orderBy: { date: "desc" },
        take: 30,
        include: { records: { where: isStudent ? { enrollment: { studentId: user.id } } : {}, include: { enrollment: { include: { student: { select: { name: true } } } } } } },
      },
      gradingPeriods: {
        where: canManage ? {} : { isPublished: true },
        orderBy: { startDate: "asc" },
        include: {
          categories: {
            include: {
              items: {
                where: canManage ? {} : { isPublished: true },
                include: { entries: { where: isStudent ? { enrollment: { studentId: user.id } } : {} } },
                orderBy: { dueDate: "asc" },
              },
            },
          },
        },
      },
      assignments: {
        where: canManage ? {} : { isPublished: true },
        orderBy: { dueDate: "asc" },
        include: {
          submissions: { where: isStudent ? { studentId: user.id } : {}, include: { student: { select: { name: true } }, assets: true } },
            },
      },
      questionBank: { where: canManage ? {} : { id: "__restricted__" }, orderBy: { createdAt: "asc" } },
      exams: {
        where: canManage ? {} : { isPublished: true },
        orderBy: { createdAt: "desc" },
        include: {
          questions: { orderBy: { order: "asc" }, include: { bankItem: { select: { id: true, prompt: true, type: true, options: true } } } },
          attempts: { where: isStudent ? { studentId: user.id } : {}, include: { student: { select: { name: true } }, answers: { include: { bankItem: { select: { prompt: true, type: true } } } } } },
        },
      },
      scheduleSlots: { orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }] },
      assets: true,
    },
  });
  if (!course) notFound();
  const enrollmentCandidates = canEnroll ? await db.user.findMany({
    where: { institutionId: user.institutionId, role: "STUDENT", status: "ACTIVE", enrollments: { none: { courseId: course.id } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 500,
  }) : [];
  const ownEnrollment = isStudent ? course.enrollments.find((e) => e.studentId === user.id) : null;
  const isReadOnlyStudent = ownEnrollment?.status === "COMPLETED";
  const categories = course.gradingPeriods.flatMap((period) => period.categories.map((category) => ({ id: category.id, name: `${period.name} · ${category.name}` })));
  const attendanceSummary = course.enrollments.map((enrollment) => { const records = course.attendanceSessions.flatMap((s) => s.records).filter((r) => r.enrollmentId === enrollment.id); const attended = records.filter((r) => r.status === "PRESENT" || r.status === "LATE").length; return { name: enrollment.student.name, attended, total: records.length, percent: records.length ? Math.round(attended / records.length * 100) : 0 }; });
  const grades = course.enrollments.map((enrollment) => ({
    enrollment,
    periods: course.gradingPeriods.map((period) => ({
      period,
      grade: calculateWeightedGrade(period.categories.map((category) => ({
        weight: category.weight,
        dropLowest: category.dropLowest,
        scores: category.items.map((item) => {
          const entry = item.entries.find((candidate) => candidate.enrollmentId === enrollment.id);
          return { score: entry?.score ?? null, maxScore: item.maxScore, itemWeight: item.weight, excused: entry?.isExcused };
        }),
      }))),
    })),
  }));

  return <div className="mx-auto max-w-7xl p-4 sm:p-8">
    <header className="mb-6 rounded-3xl p-6 text-white sm:p-8" style={{ background: "linear-gradient(135deg,var(--navy),#173b9c)" }}><span className="rounded bg-white/10 px-2 py-1 text-xs font-mono text-cyan-200">{course.code ?? "CURSO"}</span><h1 className="mt-3 text-3xl font-bold">{course.name}</h1><p className="mt-2 max-w-3xl text-slate-300">{course.description}</p><div className="mt-5 flex flex-wrap gap-4 text-sm text-slate-300"><span>{course.teacher.name}</span><span>{course.period.name}</span>{canViewRoster && <span>{course.enrollments.length} estudiantes</span>}{ownEnrollment && <span>{ownEnrollment.progressPercent}% completado</span>}</div></header>

    {(canEditCourse || canChangeCourseState) && (
      <div className="mb-5 flex justify-end">
        <Link href={`/dashboard/aula/${course.id}/editar`} className="inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white">
          {accessibleCourse.archivedAt ? "Revisar curso archivado" : "Editar curso"}
        </Link>
      </div>
    )}

    {accessibleCourse.archivedAt && (
      <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900" role="status">
        <strong>Vista de consulta.</strong> Este curso está archivado. Puedes revisar su historial, pero no cambiar contenido, matrículas, asistencia ni evaluaciones.
      </div>
    )}

    {isReadOnlyStudent && <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><strong>Curso completado.</strong> Esta es una vista de consulta; ya no puedes enviar tareas, iniciar exámenes ni cambiar el progreso.</div>}

    <CourseTabs showRoster={canViewRoster} />

    <div className="space-y-8">
      <section id="resumen"><Title icon={<BookOpen />} title="Resumen del curso" subtitle="Empieza por la información que necesitas y entra directamente al área de trabajo." /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><SummaryLink href="#contenido" label="Lecciones" value={course.sections.reduce((total, section) => total + section.lessons.length, 0)} />{canViewRoster && <SummaryLink href="#estudiantes" label="Estudiantes" value={course.enrollments.length} />}<SummaryLink href="#tareas-examenes" label="Tareas" value={course.assignments.length} /><SummaryLink href="#calificaciones" label="Períodos de notas" value={course.gradingPeriods.length} /></div></section>
      <section id="contenido"><Title icon={<BookOpen />} title="Ruta de aprendizaje" subtitle="Curso > secciones > lecciones ordenadas con texto, video, documentos y actividades." />{course.sections.length ? <div className="space-y-4">{course.sections.map((section, sectionIndex) => <article className={card} key={section.id}><div className="flex items-start justify-between"><div><span className="text-xs font-bold uppercase text-blue-600">Sección {sectionIndex + 1}</span><h3 className="text-xl font-bold">{section.title}</h3><p className="text-sm text-slate-500">{section.description}</p></div>{canManage && <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{section.isPublished ? "Publicada" : "Borrador"}</span>}</div><div className="mt-4 space-y-3">{section.lessons.map((lesson, lessonIndex) => <div className="rounded-xl bg-slate-50 p-4" key={lesson.id}><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3">{lesson.type === "VIDEO" ? <PlayCircle className="text-cyan-600" /> : <FileText className="text-blue-600" />}<div><p className="font-semibold">{lessonIndex + 1}. {lesson.title}</p><p className="text-xs text-slate-500">{lesson.estimatedMinutes} min · {spanishLabel(lesson.type)}</p></div></div>{isStudent && !isReadOnlyStudent && <div className="flex items-center gap-2">{lesson.progress?.[0]?.completed && <CheckCircle2 className="text-emerald-600" size={18} />}<ProgressForm lessonId={lesson.id} /></div>}</div>{lesson.content && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{lesson.content}</p>}{lesson.assets.map((asset) => asset.kind === "VIDEO" ? <video className="mt-3 aspect-video w-full rounded-xl bg-black" controls preload="metadata" key={asset.id}><source src={`/api/assets/${asset.id}`} type={asset.mimeType} />Tu navegador no admite video.</video> : <a className="mt-3 block text-sm font-medium text-blue-700 underline" href={`/api/assets/${asset.id}`} key={asset.id}>Descargar {asset.originalName}</a>)}{canManage && <details className={`${details} mt-3`}><summary><Upload size={15} className="mr-2 inline" />Adjuntar documento o video</summary><div className="mt-3 grid gap-4 md:grid-cols-2"><AssetUpload courseId={course.id} lessonId={lesson.id} kind="DOCUMENT" /><AssetUpload courseId={course.id} lessonId={lesson.id} kind="VIDEO" /></div></details>}</div>)}{canManage && <details className={details}><summary>Agregar lección</summary><div className="mt-4"><LessonForm sectionId={section.id} /></div></details>}</div></article>)}</div> : <Empty text="Todavía no hay una ruta de aprendizaje." />}{canManage && <details className={`${details} mt-4`}><summary>Nueva sección</summary><div className="mt-4"><SectionForm courseId={course.id} /></div></details>}</section>

      {canViewRoster && <section id="estudiantes"><Title icon={<Users />} title="Estudiantes" subtitle="Consulta la lista del curso y abre cada perfil disponible para dar seguimiento." />{course.enrollments.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{course.enrollments.map((enrollment) => <article className={card} key={enrollment.id}><h3 className="font-semibold">{enrollment.student.name}</h3><p className="text-sm text-slate-600">{enrollment.student.email}</p><p className="mt-2 text-xs text-slate-500">{spanishLabel(enrollment.status)} · {enrollment.progressPercent}% completado</p>{canManage && <Link className="mt-3 inline-flex text-sm font-semibold text-blue-700 underline" href={`/dashboard/gestion/estudiantes/${enrollment.student.id}`}>Ver perfil del estudiante</Link>}</article>)}</div> : <Empty text="Este curso todavía no tiene estudiantes." />}{canEnroll && <details className={`${details} mt-4`}><summary>Matricular estudiante</summary><div className="mt-4"><EnrollmentForm courseId={course.id} students={enrollmentCandidates} /></div></details>}</section>}

      <section id="tareas-examenes"><Title icon={<ClipboardCheck />} title="Tareas y exámenes" subtitle="Crea, entrega y revisa actividades de evaluación desde un mismo espacio." /></section>

      <section id="asignaciones"><Title icon={<ClipboardCheck />} title="Asignaciones y entregas" subtitle="Instrucciones, fechas, entrega del estudiante, revisión docente y puntuación." />{course.assignments.length ? <div className="space-y-4">{course.assignments.map((assignment) => <article className={card} key={assignment.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">{assignment.title}</h3><p className="text-xs text-slate-500">Entrega: {date(assignment.dueDate)} · {assignment.maxScore} puntos</p></div>{canManage && <div className="flex items-center gap-2"><span className="text-xs">{assignment.isPublished ? "Publicada" : "Borrador"}</span><PublishForm entity="assignment" id={assignment.id} published={assignment.isPublished} /></div>}</div><p className="mt-3 whitespace-pre-wrap text-sm">{assignment.instructions ?? assignment.description}</p>{isStudent && <div className="mt-4 space-y-3">{isReadOnlyStudent ? <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">Curso completado: la entrega está disponible solo para consulta.</p> : <SubmissionForm assignmentId={assignment.id} />}{assignment.submissions[0] && <><p className="text-sm">Estado: <strong>{spanishLabel(assignment.submissions[0].status)}</strong>{assignment.submissions[0].score != null && ` · ${assignment.submissions[0].score}/${assignment.maxScore}`}</p>{!isReadOnlyStudent && <AssetUpload courseId={course.id} assignmentId={assignment.id} submissionId={assignment.submissions[0].id} kind="DOCUMENT" />}</>}</div>}{canManage && <div className="mt-4 space-y-3">{assignment.submissions.map((submission) => <div className="rounded-xl border p-3" key={submission.id}><p className="font-semibold">{submission.student.name}</p><p className="my-2 whitespace-pre-wrap text-sm">{submission.content}</p>{submission.assets.map((asset) => <a href={`/api/assets/${asset.id}`} className="text-sm text-blue-700 underline" key={asset.id}>{asset.originalName}</a>)}<ReviewForm submissionId={submission.id} maxScore={assignment.maxScore} /></div>)}{!assignment.submissions.length && <p className="text-sm text-slate-500">Sin entregas.</p>}</div>}</article>)}</div> : <Empty text="No hay asignaciones." />}{canManage && <details className={`${details} mt-4`}><summary>Nueva asignación</summary><div className="mt-4"><AssignmentForm courseId={course.id} categories={categories} /></div></details>}</section>

      <section id="examenes"><Title icon={<GraduationCap />} title="Exámenes y banco de preguntas" subtitle="Selección múltiple, verdadero/falso y respuesta corta con intentos y revisión." />{canManage && <div className="mb-4 grid gap-4 lg:grid-cols-2"><details className={details}><summary>Agregar pregunta al banco ({course.questionBank.length})</summary><div className="mt-4"><QuestionForm courseId={course.id} /></div></details><details className={details}><summary>Crear examen desde el banco</summary><div className="mt-4"><ExamForm courseId={course.id} categories={categories} /></div></details></div>}<div className="space-y-4">{course.exams.map((exam) => <article className={card} key={exam.id}><h3 className="font-bold">{exam.title}</h3><p className="text-sm text-slate-500">{exam.questions.length} preguntas · {exam.maxAttempts} intento(s) · {exam.durationMinutes ?? "Sin límite"} min</p>{exam.instructions && <p className="mt-2 text-sm">{exam.instructions}</p>}{isStudent && <div className="mt-4">{isReadOnlyStudent ? <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">Curso completado: los exámenes están disponibles solo para consulta.</p> : <ExamAttemptForm examId={exam.id} questions={exam.questions.map((q) => ({ id: q.bankItem.id, prompt: q.bankItem.prompt, type: q.bankItem.type, options: q.bankItem.options, points: q.points }))} />}{exam.attempts.map((attempt) => <p className="mt-2 text-sm" key={attempt.id}>Intento {attempt.attemptNumber}: {spanishLabel(attempt.status)} · {attempt.score ?? "Pendiente"}/{attempt.maxScore}</p>)}</div>}{canManage && <div className="mt-3 space-y-2">{exam.attempts.map((attempt) => <div className="rounded-lg bg-slate-50 p-3 text-sm" key={attempt.id}><p className="font-medium">{attempt.student.name}: {spanishLabel(attempt.status)} · {attempt.score ?? 0}/{attempt.maxScore ?? "—"}</p>{attempt.status === "SUBMITTED" && <div className="mt-3"><ExamReviewForm attemptId={attempt.id} answers={attempt.answers.filter((answer) => answer.bankItem.type === "SHORT_ANSWER").map((answer) => ({ id: answer.id, prompt: answer.bankItem.prompt, response: answer.response, points: exam.questions.find((question) => question.bankItemId === answer.bankItemId)?.points ?? 0, score: answer.score, feedback: answer.feedback }))} /></div>}</div>)}</div>}</article>)}</div></section>

      <section id="calificaciones"><Title icon={<BarChart3 />} title="Libro de calificaciones" subtitle="Categorías ponderadas, períodos, publicar/retirar y vista del estudiante." />{!course.gradingPeriods.length && canManage && <GradebookForm courseId={course.id} startDate={course.period.startDate.toISOString().slice(0, 10)} endDate={course.period.endDate.toISOString().slice(0, 10)} />}{course.gradingPeriods.map((period) => <article className={`${card} mb-4`} key={period.id}><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-bold">{period.name}</h3><p className="text-xs text-slate-500">{period.categories.map((c) => `${c.name} ${c.weight}%`).join(" · ")}</p></div>{canManage && <div className="flex items-center gap-2"><span className="text-xs">{period.isPublished ? "Visible" : "Oculto"}</span><PublishForm entity="period" id={period.id} published={period.isPublished} /></div>}</div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="bg-slate-50 text-left"><th className="p-2">Estudiante</th>{period.categories.map((c) => <th className="p-2" key={c.id}>{c.name}</th>)}<th className="p-2">Resultado</th></tr></thead><tbody>{grades.filter(({ enrollment }) => canManage || enrollment.studentId === user.id).map(({ enrollment, periods }) => { const result = periods.find((p) => p.period.id === period.id)?.grade; return <tr className="border-t" key={enrollment.id}><td className="p-2 font-medium">{enrollment.student.name}</td>{period.categories.map((category) => <td className="p-2" key={category.id}>{category.items.map((item) => { const entry = item.entries.find((e) => e.enrollmentId === enrollment.id); return <span className="mr-2 inline-block" key={item.id}>{item.title}: {entry?.score ?? "—"}/{item.maxScore}</span>; })}</td>)}<td className="p-2 font-bold">{result == null ? "Pendiente" : `${result}%`}</td></tr>; })}</tbody></table></div></article>)}</section>

      <section id="asistencia"><Title icon={<Users />} title="Asistencia" subtitle="Captura y reporte por curso, fecha y estudiante." />{canManage && <details className={details}><summary>Tomar asistencia</summary><div className="mt-4"><AttendanceForm courseId={course.id} students={course.enrollments.map((e) => ({ enrollmentId: e.id, name: e.student.name }))} /></div></details>}<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{attendanceSummary.filter((s) => canManage || s.name === ownEnrollment?.student.name).map((summary) => <div className={card} key={summary.name}><p className="font-semibold">{summary.name}</p><p className="text-2xl font-bold text-blue-700">{summary.percent}%</p><p className="text-xs text-slate-500">{summary.attended} de {summary.total} sesiones</p></div>)}</div>{canManage && course.attendanceSessions.length > 0 && <div className="mt-4 overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[560px] text-sm"><thead><tr><th className="p-3 text-left">Fecha</th><th className="p-3 text-left">Sesión</th><th className="p-3 text-left">Registros</th></tr></thead><tbody>{course.attendanceSessions.map((s) => <tr className="border-t" key={s.id}><td className="p-3">{dateOnly(s.date)}</td><td className="p-3">{s.title}</td><td className="p-3">{s.records.map((r) => `${r.enrollment.student.name}: ${spanishLabel(r.status)}`).join(" · ")}</td></tr>)}</tbody></table></div>}</section>

      <section id="horario"><Title icon={<CalendarDays />} title="Horario institucional" subtitle="Presentación por docente, aula y hora con prevención de conflictos." /><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{course.scheduleSlots.map((slot) => <article className={card} key={slot.id}><p className="font-bold">{day[slot.weekday]} {time(slot.startMinutes)}–{time(slot.endMinutes)}</p><p className="text-sm text-slate-500">{slot.classroom} · {course.teacher.name}</p></article>)}</div>{canManage && <details className={`${details} mt-4`}><summary>Agregar bloque sin conflictos</summary><div className="mt-4"><ScheduleForm courseId={course.id} /></div></details>}</section>

      <section id="certificados"><Title icon={<Award />} title="Certificados verificables" subtitle="Se emiten al completar el curso y pueden validarse públicamente por código." /><div className="grid gap-3 md:grid-cols-2">{course.enrollments.filter((e) => canManage || e.studentId === user.id).map((enrollment) => <article className={card} key={enrollment.id}><p className="font-semibold">{enrollment.student.name}</p><p className="text-sm text-slate-500">Progreso: {enrollment.progressPercent}% · {spanishLabel(enrollment.status)}</p>{canManage && (enrollment.status === "COMPLETED" || enrollment.progressPercent >= course.completionThreshold) && <div className="mt-2"><EnrollmentCompletionForm enrollmentId={enrollment.id} completed={enrollment.status === "COMPLETED"} /></div>}{enrollment.certificates[0] ? <Link className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-blue-700 underline" href={`/certificados/${enrollment.certificates[0].verificationCode}`}><ShieldCheck size={16} />{enrollment.certificates[0].verificationCode}</Link> : canManage ? <div className="mt-2"><CertificateForm enrollmentId={enrollment.id} /></div> : <p className="mt-2 text-xs text-slate-500">Disponible al completar el curso.</p>}</article>)}</div></section>
    </div>
  </div>;
}

function Title({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) { return <div className="mb-4 flex items-start gap-3"><span className="rounded-xl bg-blue-50 p-2 text-blue-700">{icon}</span><div><h2 className="text-xl font-bold">{title}</h2><p className="text-sm text-slate-500">{subtitle}</p></div></div>; }
function Empty({ text }: { text: string }) { return <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">{text}</div>; }


function SummaryLink({ href, label, value }: { href: string; label: string; value: number }) { return <a className="rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-400 hover:shadow-sm" href={href}><span className="block text-2xl font-bold text-blue-700">{value}</span><span className="text-sm font-medium text-slate-700">{label}</span></a>; }
