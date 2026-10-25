import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listCourseStudents, listGroupsForEnrollment } from "@/server/courses/enrollment";
import { EnrollPanel, StudentList, WithdrawnList } from "./StudentTools";

export const dynamic = "force-dynamic";

const day = (value: Date) => new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(value);

export default async function CourseStudentsPage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const { courseId } = await params;
  const actor = { id: user.id, institutionId: user.institutionId, role: user.role };
  const data = await listCourseStudents(actor, courseId);
  if (!data) notFound();
  const groups = await listGroupsForEnrollment(actor);

  const { course } = data;
  const behind = data.students.filter((student) => student.fallingBehind).length;
  const seats =
    data.seatsLeft === null ? "Sin límite de cupos" : data.seatsLeft === 0 ? "Curso lleno" : data.seatsLeft === 1 ? "Queda 1 cupo" : `Quedan ${data.seatsLeft} cupos`;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <header>
        <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline" href={`/dashboard/aula/${course.id}`}>← Volver a {course.name}</Link>
        <h1 className="mt-1 text-2xl font-bold" style={{ color: "var(--navy)" }}>Estudiantes</h1>
        <p className="mt-1 text-sm text-slate-600">Mira quién está inscrito, cuánto ha avanzado cada uno y quién necesita atención.</p>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Inscritos activos", value: String(data.activeCount), note: seats },
          { label: "Avance promedio", value: `${data.averageProgress}%`, note: `${data.publishedLessons} ${data.publishedLessons === 1 ? "lección publicada" : "lecciones publicadas"}` },
          { label: "Se están quedando atrás", value: String(behind), note: behind ? "Aparecen marcados en la lista" : "Nadie por ahora" },
          { label: "Retirados", value: String(data.withdrawn.length), note: "Conservan su historial" },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <dt className="text-xs font-medium text-slate-600">{item.label}</dt>
            <dd className="mt-1 text-2xl font-bold text-slate-950">{item.value}</dd>
            <dd className="text-xs text-slate-500">{item.note}</dd>
          </div>
        ))}
      </dl>

      {course.archived ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Este curso está archivado: puedes consultar a sus estudiantes, pero no inscribir a nadie más.</p>
      ) : (
        <EnrollPanel courseId={course.id} seatsLeft={data.seatsLeft} groups={groups} startOpen={data.students.length === 0} />
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="inscritos">
        <h2 id="inscritos" className="text-lg font-bold text-slate-950">Inscritos ({data.students.length})</h2>
        {data.students.length === 0 ? (
          <p className="mt-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            Todavía no hay estudiantes en este curso. Aquí verás a cada uno con su avance. {course.archived ? "" : "Empieza con «Inscribir estudiantes»."}
          </p>
        ) : (
          <StudentList
            courseId={course.id}
            publishedLessons={data.publishedLessons}
            publishedAssignments={data.publishedAssignments}
            students={data.students.map((student) => ({
              enrollmentId: student.enrollmentId,
              name: student.name,
              email: student.email,
              status: student.status,
              progressPercent: student.progressPercent,
              lessonsCompleted: student.lessonsCompleted,
              assignmentsSubmitted: student.assignmentsSubmitted,
              lastActivity: student.lastActivityAt ? day(student.lastActivityAt) : "",
              fallingBehind: student.fallingBehind,
            }))}
          />
        )}
      </section>

      {data.withdrawn.length > 0 && (
        <WithdrawnList
          courseId={course.id}
          canReinstate={!course.archived}
          students={data.withdrawn.map((student) => ({
            enrollmentId: student.enrollmentId,
            name: student.name,
            email: student.email,
            reason: student.withdrawReason ?? "",
            date: student.withdrawnAt ? day(student.withdrawnAt) : "",
          }))}
        />
      )}
    </div>
  );
}
