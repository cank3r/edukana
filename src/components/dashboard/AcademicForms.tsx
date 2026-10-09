"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { ActionState } from "@/app/dashboard/actions";
import { createAssignment, createCourse, createExam, createGradebook, createLesson, createQuestion, createSection, enrollStudent, issueCertificate, markLessonComplete, reviewExamAttempt, reviewSubmission, saveAttendance, saveScheduleSlot, setEnrollmentCompletion, submitAssignment, togglePublication } from "@/app/dashboard/academico/actions";

const initial: ActionState = { ok: false, message: "" };
const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500";
const button = "rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
type ServerAction = (state: ActionState, data: FormData) => Promise<ActionState>;

function Form({ action, children, submitLabel, pendingLabel = "Procesando…", className = "space-y-3" }: { action: ServerAction; children: ReactNode; submitLabel: string; pendingLabel?: string; className?: string }) {
  const [state, formAction, pending] = useActionState(action, initial);
  return <form action={formAction} className={className}>{children}<button type="submit" disabled={pending} className={button}>{pending ? pendingLabel : submitLabel}</button>{state.message && <p role="status" aria-live="polite" className={`rounded-lg p-2 text-sm ${state.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{state.message}</p>}</form>;
}
function Field({ label, name, type = "text", required, defaultValue, min, max, step }: { label: string; name: string; type?: string; required?: boolean; defaultValue?: string | number; min?: string; max?: string; step?: string }) {
  return <label className="block text-sm font-medium">{label}<input className={`${input} mt-1`} name={name} type={type} required={required} defaultValue={defaultValue} min={min} max={max} step={step} /></label>;
}
function Hidden({ name, value }: { name: string; value: string }) { return <input type="hidden" name={name} value={value} />; }

export function CourseForm({ periods }: { periods: Array<{ id: string; name: string }> }) {
  return <Form action={createCourse} submitLabel="Crear curso"><label className="block text-sm font-medium">Período activo<select className={`${input} mt-1`} name="periodId" required defaultValue=""><option value="" disabled>Seleccionar período</option>{periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}</select></label><Field label="Nombre del curso" name="name" required /><Field label="Código" name="code" required /><label className="block text-sm font-medium">Descripción<textarea className={`${input} mt-1`} name="description" rows={3} maxLength={2000} /></label></Form>;
}

export function EnrollmentForm({ courseId, students }: { courseId: string; students: Array<{ id: string; name: string }> }) {
  return students.length ? <Form action={enrollStudent} submitLabel="Matricular estudiante"><Hidden name="courseId" value={courseId} /><label className="block text-sm font-medium">Estudiante<select className={`${input} mt-1`} name="studentId" required defaultValue=""><option value="" disabled>Seleccionar estudiante</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label></Form> : <p className="text-sm text-slate-500">No hay estudiantes activos pendientes de matrícula.</p>;
}

export function SectionForm({ courseId }: { courseId: string }) {
  return <Form action={createSection} submitLabel="Crear sección"><Hidden name="courseId" value={courseId} /><Field label="Título de la sección" name="title" required /><Field label="Descripción" name="description" /><label className="flex gap-2 text-sm"><input type="checkbox" name="isPublished" defaultChecked /> Publicada</label></Form>;
}

export function LessonForm({ sectionId }: { sectionId: string }) {
  return <Form action={createLesson} submitLabel="Crear lección"><Hidden name="sectionId" value={sectionId} /><Field label="Título de la lección" name="title" required /><Field label="Resumen" name="summary" /><label className="block text-sm font-medium">Tipo<select className={`${input} mt-1`} name="type"><option value="TEXT">Texto</option><option value="VIDEO">Video</option><option value="DOCUMENT">Documento</option><option value="ACTIVITY">Actividad</option></select></label><label className="block text-sm font-medium">Contenido<textarea className={`${input} mt-1`} name="content" rows={4} /></label><Field label="Duración estimada (min)" name="estimatedMinutes" type="number" defaultValue={10} min="1" max="600" /><label className="flex gap-2 text-sm"><input type="checkbox" name="isPublished" defaultChecked /> Publicada</label></Form>;
}

export function AttendanceForm({ courseId, students }: { courseId: string; students: Array<{ enrollmentId: string; name: string }> }) {
  return <Form action={saveAttendance} submitLabel="Registrar asistencia"><Hidden name="courseId" value={courseId} /><div className="grid gap-3 sm:grid-cols-2"><Field label="Fecha" name="date" type="date" required /><Field label="Sesión" name="title" defaultValue="Clase regular" /></div><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead><tr className="text-left text-slate-500"><th className="p-2">Estudiante</th><th className="p-2">Estado</th><th className="p-2">Nota</th></tr></thead><tbody>{students.map((student) => <tr className="border-t" key={student.enrollmentId}><td className="p-2 font-medium">{student.name}</td><td className="p-2"><select aria-label={`Asistencia de ${student.name}`} className={input} name={`status_${student.enrollmentId}`} defaultValue="PRESENT"><option value="PRESENT">Presente</option><option value="ABSENT">Ausente</option><option value="LATE">Tarde</option><option value="EXCUSED">Justificado</option></select></td><td className="p-2"><input aria-label={`Nota de asistencia de ${student.name}`} className={input} name={`notes_${student.enrollmentId}`} /></td></tr>)}</tbody></table></div></Form>;
}

export function GradebookForm({ courseId, startDate, endDate }: { courseId: string; startDate: string; endDate: string }) {
  return <Form action={createGradebook} submitLabel="Crear libro de calificaciones" className="grid gap-3 sm:grid-cols-2"><Hidden name="courseId" value={courseId} /><Field label="Período de notas" name="name" defaultValue="Primer período" required /><Field label="Inicio" name="startDate" type="date" defaultValue={startDate} required /><Field label="Fin" name="endDate" type="date" defaultValue={endDate} required /><Field label="Peso asignaciones (%)" name="taskWeight" type="number" defaultValue={40} min="0" max="100" required /><Field label="Peso exámenes (%)" name="examWeight" type="number" defaultValue={60} min="0" max="100" required /></Form>;
}

export function AssignmentForm({ courseId, categories }: { courseId: string; categories: Array<{ id: string; name: string }> }) {
  return <Form action={createAssignment} submitLabel="Crear tarea"><Hidden name="courseId" value={courseId} /><Field label="Título" name="title" required /><label className="block text-sm font-medium">Categoría<select className={`${input} mt-1`} name="categoryId"><option value="">Sin calificación ponderada</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="block text-sm font-medium">Instrucciones<textarea className={`${input} mt-1`} name="instructions" rows={5} required minLength={10} /></label><div className="grid gap-3 sm:grid-cols-2"><Field label="Entrega" name="dueDate" type="datetime-local" /><Field label="Puntuación máxima" name="maxScore" type="number" defaultValue={100} min="1" max="10000" required /></div><label className="flex gap-2 text-sm"><input type="checkbox" name="isPublished" defaultChecked /> Publicar ahora</label></Form>;
}

export function SubmissionForm({ assignmentId }: { assignmentId: string }) {
  return <Form action={submitAssignment} submitLabel="Entregar tarea"><Hidden name="assignmentId" value={assignmentId} /><label className="block text-sm font-medium">Tu entrega<textarea className={`${input} mt-1`} name="content" rows={5} required minLength={3} /></label></Form>;
}

export function ReviewForm({ submissionId, maxScore }: { submissionId: string; maxScore: number }) {
  return <Form action={reviewSubmission} submitLabel="Calificar entrega" className="grid gap-2 sm:grid-cols-[8rem_1fr_auto]"><Hidden name="submissionId" value={submissionId} /><Field label={`Nota / ${maxScore}`} name="score" type="number" min="0" max={String(maxScore)} step="0.01" required /><Field label="Retroalimentación" name="feedback" /></Form>;
}

export function QuestionForm({ courseId }: { courseId: string }) {
  return <Form action={createQuestion} submitLabel="Agregar pregunta"><Hidden name="courseId" value={courseId} /><label className="block text-sm font-medium">Tipo<select className={`${input} mt-1`} name="type"><option value="MULTIPLE_CHOICE">Selección múltiple</option><option value="TRUE_FALSE">Verdadero / falso</option><option value="SHORT_ANSWER">Respuesta corta (revisión manual)</option></select></label><label className="block text-sm font-medium">Pregunta<textarea className={`${input} mt-1`} name="prompt" rows={3} required /></label><label className="block text-sm font-medium">Opciones (una por línea)<textarea className={`${input} mt-1`} name="options" rows={4} placeholder={"A\nB\nC"} /></label><Field label="Respuesta correcta exacta" name="answerKey" required /><Field label="Puntos" name="points" type="number" defaultValue={1} min="0.1" max="1000" step="0.1" required /></Form>;
}

export function ExamForm({ courseId, categories }: { courseId: string; categories: Array<{ id: string; name: string }> }) {
  return <Form action={createExam} submitLabel="Crear examen"><Hidden name="courseId" value={courseId} /><Field label="Título" name="title" required /><label className="block text-sm font-medium">Categoría<select className={`${input} mt-1`} name="categoryId"><option value="">Sin libro de notas</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="block text-sm font-medium">Instrucciones<textarea className={`${input} mt-1`} name="instructions" rows={3} /></label><div className="grid gap-3 sm:grid-cols-2"><Field label="Intentos" name="maxAttempts" type="number" defaultValue={1} min="1" max="10" /><Field label="Duración (min)" name="durationMinutes" type="number" defaultValue={60} min="1" max="600" /></div><label className="flex gap-2 text-sm"><input type="checkbox" name="isPublished" defaultChecked /> Publicar ahora</label></Form>;
}

/** La antigua entrega queda como entrada al recorrido que inicia y controla el tiempo. */
export function ExamAttemptForm({ courseId }: { courseId: string }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Consulta las fechas, los intentos disponibles y tus resultados. El tiempo empieza al iniciar el examen.</p>
      <Link
        href={`/dashboard/aula/${encodeURIComponent(courseId)}/presentar`}
        className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        Ver mis exámenes
      </Link>
    </div>
  );
}


type ExamReviewAnswer = { id: string; prompt: string; response: string | null; points: number; score: number | null; feedback: string | null };
export function ExamReviewForm({ attemptId, answers }: { attemptId: string; answers: ExamReviewAnswer[] }) {
  return <Form action={reviewExamAttempt} submitLabel="Calificar examen"><Hidden name="attemptId" value={attemptId} />{answers.map((answer) => <fieldset className="rounded-xl border p-3" key={answer.id}><legend className="px-2 font-semibold">{answer.prompt}</legend><p className="mb-2 whitespace-pre-wrap text-sm text-slate-700">{answer.response || "Sin respuesta"}</p><div className="grid gap-2 sm:grid-cols-2"><Field label={`Puntuación / ${answer.points}`} name={`score_${answer.id}`} type="number" min="0" max={String(answer.points)} step="0.01" defaultValue={answer.score ?? undefined} required /><Field label="Retroalimentación" name={`feedback_${answer.id}`} defaultValue={answer.feedback ?? ""} /></div></fieldset>)}</Form>;
}

export function ScheduleForm({ courseId }: { courseId: string }) {
  return <Form action={saveScheduleSlot} submitLabel="Agregar bloque al horario"><Hidden name="courseId" value={courseId} /><div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium">Día<select className={`${input} mt-1`} name="weekday">{["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((day, i) => <option key={day} value={i + 1}>{day}</option>)}</select></label><Field label="Aula" name="classroom" required /><Field label="Inicio (minutos desde 00:00)" name="startMinutes" type="number" defaultValue={480} min="0" max="1439" /><Field label="Fin (minutos desde 00:00)" name="endMinutes" type="number" defaultValue={540} min="1" max="1440" /></div></Form>;
}

export function PublishForm({ entity, id, published }: { entity: "period" | "assignment"; id: string; published: boolean }) {
  return <Form action={togglePublication} submitLabel={published ? "Retirar publicación" : "Publicar"} className="inline-flex items-center gap-2"><Hidden name="entity" value={entity} /><Hidden name="id" value={id} /><Hidden name="publish" value={String(!published)} /></Form>;
}

export function ProgressForm({ lessonId }: { lessonId: string }) { return <Form action={markLessonComplete} submitLabel="Marcar como completada" className="inline-flex items-center gap-2"><Hidden name="lessonId" value={lessonId} /></Form>; }
export function EnrollmentCompletionForm({ enrollmentId, completed }: { enrollmentId: string; completed: boolean }) { return <Form action={setEnrollmentCompletion} submitLabel={completed ? "Reabrir curso" : "Finalizar curso"} className="inline-flex items-center gap-2"><Hidden name="enrollmentId" value={enrollmentId} /><Hidden name="action" value={completed ? "REOPEN" : "COMPLETE"} /></Form>; }
export function CertificateForm({ enrollmentId }: { enrollmentId: string }) { return <Form action={issueCertificate} submitLabel="Emitir certificado" className="inline-flex items-center gap-2"><Hidden name="enrollmentId" value={enrollmentId} /></Form>; }

export function AssetUpload({ courseId, lessonId, assignmentId, submissionId, kind }: { courseId: string; lessonId?: string; assignmentId?: string; submissionId?: string; kind: "DOCUMENT" | "VIDEO" }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  return <form className="space-y-2" onSubmit={async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = new FormData(form).get("file");
    if (!(file instanceof File)) return;
    setPending(true); setMessage("");
    let assetId: string | undefined;
    try {
      const prepared = await fetch("/api/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, type: file.type, size: file.size, kind, courseId, lessonId, assignmentId, submissionId }) });
      const intent = await prepared.json() as { error?: string; assetId?: string; uploadUrl?: string; retrievalUrl?: string };
      if (!prepared.ok || !intent.assetId || !intent.uploadUrl) throw new Error(intent.error ?? "No se pudo autorizar la carga");
      assetId = intent.assetId;
      const body = new FormData(); body.append("cacheControl", "3600"); body.append("", file);
      const uploaded = await fetch(intent.uploadUrl, { method: "PUT", headers: { "x-upsert": "false" }, body });
      if (!uploaded.ok) throw new Error("Supabase rechazó el archivo");
      const confirmed = await fetch(`/api/assets/${intent.assetId}`, { method: "PATCH" });
      const result = await confirmed.json() as { error?: string; retrievalUrl?: string };
      if (!confirmed.ok) throw new Error(result.error ?? "No se pudo confirmar la carga");
      setMessage(`Carga completa: ${result.retrievalUrl}`); form.reset();
    } catch (error) { if (assetId) await fetch(`/api/assets/${assetId}`, { method: "DELETE" }).catch(() => undefined); setMessage(error instanceof Error ? error.message : "Error de carga"); }
    finally { setPending(false); }
  }}><label className="block text-sm font-medium" htmlFor={`file-${kind}-${lessonId ?? assignmentId ?? courseId}`}>{kind === "VIDEO" ? "Seleccionar video" : "Seleccionar documento"}</label><p className="text-xs text-slate-600">{kind === "VIDEO" ? "MP4 o WebM, máximo 100 MB." : "PDF, Word, PowerPoint o texto, máximo 20 MB."}</p><input id={`file-${kind}-${lessonId ?? assignmentId ?? courseId}`} className={input} type="file" name="file" accept={kind === "VIDEO" ? "video/mp4,video/webm" : ".pdf,.docx,.pptx,.txt"} required /><button type="submit" className={button} disabled={pending}>{pending ? "Subiendo…" : kind === "VIDEO" ? "Subir video" : "Subir documento"}</button>{message && <p role="status" aria-live="polite" className="text-xs text-slate-700">{message}</p>}</form>;
}
