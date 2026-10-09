import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getStudentProgress } from "@/server/courses/enrollment";

export const dynamic = "force-dynamic";

const day = (value: Date) => new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(value);
const score = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

const ENROLLMENT_STATUS: Record<string, string> = { ACTIVE: "Activo en el curso", DROPPED: "Retirado del curso", COMPLETED: "Terminó el curso", FAILED: "No aprobó" };
const TASK_STATUS: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Sin entregar", className: "bg-slate-100 text-slate-700" },
  SUBMITTED: { label: "Entregada, por calificar", className: "bg-amber-50 text-amber-800" },
  GRADED: { label: "Calificada", className: "bg-emerald-50 text-emerald-700" },
  RETURNED: { label: "Devuelta para corregir", className: "bg-blue-50 text-blue-700" },
};

export default async function StudentProgressPage({ params }: { params: Promise<{ courseId: string; enrollmentId: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const { courseId, enrollmentId } = await params;
  const data = await getStudentProgress({ id: user.id, institutionId: user.institutionId, role: user.role }, courseId, enrollmentId);
  if (!data) notFound();

  const { enrollment, student } = data;
  const submitted = data.assignments.filter((assignment) => assignment.status !== "PENDING").length;
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="mt-1 break-words text-2xl font-bold" style={{ color: "var(--navy)" }}>{student.name}</h1>
        <p className="break-words text-sm text-slate-600">{student.email} · {data.course.name}</p>
        <p className="mt-2 text-sm font-medium text-slate-800">
          {ENROLLMENT_STATUS[enrollment.status] ?? "Inscrito"} · Inscrito el {day(enrollment.enrolledAt)}
          {enrollment.finalGrade !== null && ` · Nota final: ${score(enrollment.finalGrade)}`}
        </p>
        {enrollment.status === "DROPPED" && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            {enrollment.withdrawnAt ? `Retirado el ${day(enrollment.withdrawnAt)}.` : "Retirado."} {enrollment.withdrawReason ? `Motivo: ${enrollment.withdrawReason}. ` : ""}
            Su historial se conserva; puedes reincorporarlo desde la lista de estudiantes.
          </p>
        )}
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="avance">
        <h2 id="avance" className="text-lg font-bold text-slate-950">Avance en el curso</h2>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.progressPercent} aria-label="Avance en el curso">
            <div className={`h-full rounded-full ${data.progressPercent >= 100 ? "bg-emerald-500" : "bg-blue-600"}`} style={{ width: `${data.progressPercent}%` }} />
          </div>
          <span className="text-lg font-bold text-slate-950">{data.progressPercent}%</span>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {data.lessonsCompleted} de {data.lessonsTotal} lecciones completadas · {submitted} de {data.assignments.length} tareas entregadas
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="lecciones">
        <h2 id="lecciones" className="text-lg font-bold text-slate-950">Lecciones</h2>
        {data.lessonsTotal === 0 ? (
          <p className="mt-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">El curso todavía no tiene lecciones publicadas. Cuando publiques alguna, aquí verás cuáles completó.</p>
        ) : (
          data.chapters.filter((chapter) => chapter.lessons.length > 0).map((chapter) => (
            <div key={chapter.id} className="mt-4">
              <h3 className="text-sm font-semibold text-slate-700">{chapter.title}</h3>
              <ul className="mt-1 divide-y divide-slate-100">
                {chapter.lessons.map((lesson) => (
                  <li key={lesson.id} className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                    <span className="min-w-0 break-words font-medium text-slate-950">{lesson.title}</span>
                    {lesson.completed ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Completada{lesson.completedAt ? ` el ${day(lesson.completedAt)}` : ""}</span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">Pendiente</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="tareas">
        <h2 id="tareas" className="text-lg font-bold text-slate-950">Tareas</h2>
        {data.assignments.length === 0 ? (
          <p className="mt-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">El curso todavía no tiene tareas publicadas. Cuando publiques alguna, aquí verás si la entregó y su nota.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {data.assignments.map((assignment) => {
              const status = TASK_STATUS[assignment.status] ?? TASK_STATUS.PENDING;
              return (
                <li key={assignment.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="min-w-0 break-words font-medium text-slate-950">{assignment.title}</span>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {assignment.submittedAt ? `Entregada el ${day(assignment.submittedAt)}` : assignment.dueDate ? `Vence el ${day(assignment.dueDate)}` : "Sin fecha de entrega"}
                    {assignment.score !== null && ` · Nota: ${score(assignment.score)} de ${score(assignment.maxScore)}`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
