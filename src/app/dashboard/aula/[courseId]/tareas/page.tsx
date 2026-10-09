import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import {
  dateToLocalInput,
  dueLabel,
  gradeCategoryOptions,
  listAssignmentsForManager,
  listAssignmentsForStudent,
  type StudentGroup,
} from "@/server/assessment/assignments";
import { AssignmentActions, CreateAssignment } from "./AssignmentTools";

export const dynamic = "force-dynamic";

const badge = "rounded-full px-2 py-1 text-xs font-semibold";
const GROUPS: { name: StudentGroup; empty: string }[] = [
  { name: "Pendientes", empty: "No tienes tareas pendientes. ¡Vas al día!" },
  { name: "Entregadas", empty: "Aquí verás las tareas que entregaste y esperan nota." },
  { name: "Calificadas", empty: "Aquí verás tus tareas con nota." },
];

export default async function AssignmentsPage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const { courseId } = await params;
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("course.view")) notFound();
  const now = new Date();
  const base = `/dashboard/aula/${courseId}`;

  if (user.role === "STUDENT") {
    const data = await listAssignmentsForStudent({ id: user.id, institutionId: user.institutionId }, courseId, now);
    if (!data) notFound();
    const zone = data.course.institution.timezone;
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
        <header>
          <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Mis tareas</h1>
          <p className="mt-1 text-sm text-slate-600">Abre una tarea para leer las instrucciones y entregarla.</p>
        </header>
        {data.assignments.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Tu docente aún no ha publicado tareas en este curso. Cuando publique una, aparecerá aquí con su fecha límite.</p>
        )}
        {data.assignments.length > 0 && GROUPS.map((group) => {
          const items = data.assignments.filter((assignment) => assignment.group === group.name);
          return (
            <section key={group.name} aria-labelledby={`grupo-${group.name}`}>
              <h2 id={`grupo-${group.name}`} className="text-lg font-bold text-slate-950">{group.name} ({items.length})</h2>
              {items.length === 0 ? (
                <p className="mt-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">{group.empty}</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {items.map((assignment) => (
                    <li key={assignment.id}>
                      <Link href={`${base}/tareas/${assignment.id}`} className="block min-h-11 rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-400">
                        <span className="block font-semibold text-slate-950">{assignment.title}</span>
                        <span className="mt-1 block text-sm text-slate-600">
                          {group.name === "Calificadas"
                            ? `Nota: ${assignment.score ?? "—"} de ${assignment.maxScore}`
                            : group.name === "Entregadas"
                              ? `Entregada. ${dueLabel(assignment.dueDate, now, zone)}`
                              : dueLabel(assignment.dueDate, now, zone)}
                        </span>
                        {group.name === "Pendientes" && !assignment.canSubmit && <span className={`${badge} mt-2 inline-block bg-red-50 text-red-700`}>Ya no acepta entregas</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    );
  }

  const actor = { id: user.id, institutionId: user.institutionId, role: user.role, capabilities };
  const data = await listAssignmentsForManager(actor, courseId);
  if (!data) notFound();
  const zone = data.course.institution.timezone;
  const categories = await gradeCategoryOptions(actor, courseId);
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Tareas</h1>
        <p className="mt-1 text-sm text-slate-600">Crea tareas, publícalas y califica lo que entregan tus estudiantes.</p>
      </header>
      <CreateAssignment courseId={courseId} categories={categories} />
      {data.assignments.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          Este curso aún no tiene tareas. Una tarea es un trabajo que los estudiantes entregan aquí, con fecha límite y nota. Usa «Crear tarea» para empezar.
        </p>
      ) : (
        <ul className="space-y-3">
          {data.assignments.map((assignment) => (
            <li key={assignment.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Link href={`${base}/tareas/${assignment.id}`} className="inline-flex min-h-11 min-w-0 items-center text-lg font-bold text-blue-700 underline">{assignment.title}</Link>
                <span className={`${badge} ${assignment.isPublished ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>{assignment.isPublished ? "Publicada" : "Borrador"}</span>
              </div>
              <p className="text-sm text-slate-600">{dueLabel(assignment.dueDate, now, zone)} · Puntaje máximo: {assignment.maxScore}</p>
              <p className="mt-1 text-sm font-medium text-slate-800">
                {assignment.submissionCount} {assignment.submissionCount === 1 ? "entrega" : "entregas"} · {assignment.toGradeCount} por calificar
              </p>
              <AssignmentActions
                courseId={courseId}
                assignment={{
                  id: assignment.id,
                  title: assignment.title,
                  instructions: assignment.instructions ?? "",
                  dueLocal: dateToLocalInput(assignment.dueDate, zone),
                  maxScore: assignment.maxScore,
                  allowLate: assignment.allowLate,
                  isPublished: assignment.isPublished,
                  submissionCount: assignment.submissionCount,
                  gradedCount: assignment.gradedCount,
                  countsForGrade: assignment.countsForGrade,
                  deleteBlocked: assignment.deleteBlocked,
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
