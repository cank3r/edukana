import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { assignmentForStudent, assignmentRoster, dueLabel, formatDateTime, type RosterState } from "@/server/assessment/assignments";
import { submissionFilesForManager, submissionFilesForStudent } from "@/server/courses/submission-files";
import { GradeForm } from "../AssignmentTools";
import { FileList, SubmitWithFiles } from "./SubmissionFiles";

export const dynamic = "force-dynamic";

const card = "rounded-xl border border-slate-200 bg-white p-5";
const badge = "rounded-full px-2 py-1 text-xs font-semibold";
const STATE_STYLE: Record<RosterState, string> = {
  "Sin entregar": "bg-slate-100 text-slate-700",
  Entregada: "bg-blue-50 text-blue-700",
  Tarde: "bg-amber-50 text-amber-800",
  Calificada: "bg-emerald-50 text-emerald-700",
};

function Work({ content, links }: { content: string; links: string[] }) {
  return (
    <>
      {content && <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm text-slate-900">{content}</p>}
      {links.map((link) => (
        <a key={link} href={link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 max-w-full items-center break-all text-sm font-semibold text-blue-700 underline">{link}</a>
      ))}
    </>
  );
}

export default async function AssignmentPage({ params, searchParams }: { params: Promise<{ courseId: string; assignmentId: string }>; searchParams: Promise<{ entrega?: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const { courseId, assignmentId } = await params;
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("course.view")) notFound();
  const now = new Date();
  const list = `/dashboard/aula/${courseId}/tareas`;

  if (user.role === "STUDENT") {
    const data = await assignmentForStudent({ id: user.id, institutionId: user.institutionId }, assignmentId, now);
    if (!data || data.course.id !== courseId) notFound();
    const zone = data.course.institution.timezone;
    const { assignment, submission } = data;
    const files = await submissionFilesForStudent({ id: user.id, institutionId: user.institutionId }, assignment.id);
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
        <header>
          <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>{assignment.title}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {dueLabel(assignment.dueDate, now, zone)}
            {assignment.dueDate ? ` (${formatDateTime(assignment.dueDate, zone)})` : ""} · Vale {assignment.maxScore} puntos
            {assignment.dueDate ? (assignment.allowLate ? " · Acepta entregas tarde" : " · No acepta entregas tarde") : ""}
          </p>
        </header>

        <section className={card} aria-labelledby="instrucciones">
          <h2 id="instrucciones" className="text-lg font-bold text-slate-950">Instrucciones</h2>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-800">{assignment.instructions || "Tu docente no escribió instrucciones para esta tarea."}</p>
        </section>

        {submission?.graded && (
          <section className={card} aria-labelledby="mi-nota">
            <h2 id="mi-nota" className="text-lg font-bold text-slate-950">Tu nota</h2>
            <p className="mt-2 text-3xl font-bold text-slate-950">{submission.score ?? "—"} <span className="text-base font-medium text-slate-600">de {assignment.maxScore}</span></p>
            <h3 className="mt-3 text-sm font-semibold text-slate-900">Comentario de tu docente</h3>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{submission.feedback || "Tu docente no dejó comentario."}</p>
          </section>
        )}

        <section className={card} aria-labelledby="mi-entrega">
          <h2 id="mi-entrega" className="text-lg font-bold text-slate-950">Tu entrega</h2>
          {submission ? (
            <p className="mt-1 text-sm text-slate-600">
              Entregada el {formatDateTime(submission.submittedAt, zone)}{submission.late ? " (tarde)" : ""}
              {submission.previousVersions > 0 ? ` La has cambiado ${submission.previousVersions} ${submission.previousVersions === 1 ? "vez" : "veces"}.` : ""}
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-600">Aún no has entregado esta tarea.</p>
          )}
          {data.canSubmit ? (
            <SubmitWithFiles assignmentId={assignment.id} content={submission?.content ?? ""} link={submission?.link ?? ""} resubmitting={Boolean(submission)} currentFiles={files.current} pendingFiles={files.pending} />
          ) : (
            <>
              {submission && <Work content={submission.content} links={submission.link ? [submission.link] : []} />}
              <FileList files={files.current} title="Archivos entregados" />
              <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{data.cannotSubmitReason}</p>
            </>
          )}
        </section>
      </div>
    );
  }

  const data = await assignmentRoster({ id: user.id, institutionId: user.institutionId, role: user.role, capabilities }, assignmentId);
  if (!data || data.course.id !== courseId) notFound();
  const zone = data.course.institution.timezone;
  const { assignment, students, waiting } = data;
  const selectedId = (await searchParams).entrega ?? "";
  const selected = students.find((student) => student.submission?.id === selectedId) ?? null;
  const here = `${list}/${assignment.id}`;
  const open = (submissionId: string) => `${here}?entrega=${encodeURIComponent(submissionId)}#entrega`;
  const nextId = waiting.find((id) => id !== selected?.submission?.id) ?? null;
  const selectedFiles = selected?.submission ? await submissionFilesForManager({ id: user.id, institutionId: user.institutionId, role: user.role, capabilities }, selected.submission.id) : [];
  const delivered = students.filter((student) => student.submission).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>{assignment.title}</h1>
          <span className={`${badge} ${assignment.isPublished ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>{assignment.isPublished ? "Publicada" : "Borrador"}</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {dueLabel(assignment.dueDate, now, zone)}
          {assignment.dueDate ? ` (${formatDateTime(assignment.dueDate, zone)})` : ""} · Puntaje máximo: {assignment.maxScore}
        </p>
        <p className="mt-1 text-sm font-medium text-slate-800">
          {delivered} de {students.length} {students.length === 1 ? "estudiante entregó" : "estudiantes entregaron"} · {waiting.length} por calificar
        </p>
        {!assignment.isPublished && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Esta tarea está en borrador: los estudiantes no la ven. Publícala desde la lista de tareas.</p>}
        {!selected && nextId && <Link className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white" href={open(nextId)}>Siguiente por calificar</Link>}
      </header>

      {selected?.submission && (
        <section id="entrega" className={`${card} scroll-mt-4`} aria-labelledby="entrega-titulo">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 id="entrega-titulo" className="text-lg font-bold text-slate-950">Entrega de {selected.name}</h2>
            <span className={`${badge} ${STATE_STYLE[selected.state]}`}>{selected.state}</span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Entregada el {formatDateTime(selected.submission.submittedAt, zone)}{selected.late ? " (después de la fecha límite)" : ""}
            {selected.submission.previousVersions > 0 ? ` El estudiante la cambió ${selected.submission.previousVersions} ${selected.submission.previousVersions === 1 ? "vez" : "veces"}; esta es la versión más reciente.` : ""}
          </p>
          <Work content={selected.submission.content} links={selected.submission.links} />
          <FileList files={selectedFiles} title="Archivos entregados" />
          <GradeForm
            key={selected.submission.id}
            submissionId={selected.submission.id}
            maxScore={assignment.maxScore}
            score={selected.submission.score}
            feedback={selected.submission.feedback}
            graded={selected.submission.graded}
            nextHref={nextId ? open(nextId) : null}
          />
        </section>
      )}

      <section className={card} aria-labelledby="estudiantes">
        <h2 id="estudiantes" className="text-lg font-bold text-slate-950">Estudiantes</h2>
        {students.length === 0 ? (
          <p className="mt-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Este curso aún no tiene estudiantes inscritos. Cuando los inscribas, aquí verás quién entregó.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {students.map((student) => (
              <li key={student.studentId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-950">{student.name}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    <span className={`${badge} ${STATE_STYLE[student.state]}`}>{student.state}</span>
                    {student.submission?.graded ? ` Nota: ${student.submission.score ?? "—"} de ${assignment.maxScore}` : ""}
                  </p>
                </div>
                {student.submission && (
                  <Link className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800" href={open(student.submission.id)}>
                    {student.submission.graded ? "Ver o corregir" : "Calificar"}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
