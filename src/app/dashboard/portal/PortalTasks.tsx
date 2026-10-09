import Link from "next/link";
import { CheckCircle, Clock } from "lucide-react";
import type { listPortalTasksForStudent } from "@/server/assessment/student-portal-tasks";

type Tasks = Awaited<ReturnType<typeof listPortalTasksForStudent>>;

/** Receives only the student-safe view returned by the assessment reader. */
export function PortalTasks({ data }: { data: Tasks }) {
  if (!data) {
    return <p className="text-xs text-slate-500">Las tareas de este curso no están disponibles.</p>;
  }
  const base = `/dashboard/aula/${data.course.id}/tareas`;
  const date = (value: Date | null) => value
    ? new Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone: data.course.institution.timezone }).format(value)
    : "Sin fecha límite";

  return (
    <div className="min-w-0 space-y-2">
      {data.assignments.length === 0 && (
        <p className="text-xs text-slate-500">Tu docente aún no ha publicado tareas en este curso.</p>
      )}
      <ul className="space-y-2">
        {data.assignments.slice(0, 5).map((task) => (
          <li key={task.id} className="min-w-0">
            <Link
              href={`${base}/${task.id}`}
              className="flex min-h-11 min-w-0 flex-col gap-1 rounded-lg bg-slate-50 p-3 text-xs
                hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              <span className="flex min-w-0 items-start gap-2 text-blue-800">
                {task.submittedAt
                  ? <CheckCircle size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-emerald-600" />
                  : <Clock size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-600" />}
                <span className="min-w-0 wrap-anywhere font-semibold">{task.title}</span>
              </span>
              <span className="break-words text-slate-600">
                {task.isExcused
                  ? "Exonerada"
                  : task.score !== null
                    ? `Nota: ${task.score} de ${task.maxScore}`
                    : `${task.submittedAt ? "Entregada" : "Sin entregar"}. ${date(task.dueDate)}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={base}
        className="inline-flex min-h-11 items-center rounded text-sm font-semibold text-blue-700 underline
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
      >
        Ver tareas
      </Link>
    </div>
  );
}
