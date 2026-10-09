"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import {
  deleteAssignmentAction,
  gradeSubmissionAction,
  saveAssignmentAction,
  setAssignmentPublishedAction,
  submitAssignmentAction,
  type AssignmentActionState,
} from "@/server/actions/assignments";

const primary = "inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const secondary = "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60";
const danger = "inline-flex min-h-11 items-center justify-center rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const field = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-blue-500";
const label = "block text-sm font-medium text-slate-900";
const empty: AssignmentActionState = { ok: false, message: "" };

const NOTICE_EVENT = "edukana:tareas-mensaje";

/** Mensaje de una acción. Cuando otra acción de la pantalla muestra el suyo, este desaparece. */
function Notice({ state }: { state: AssignmentActionState }) {
  const id = useId();
  const [replaced, setReplaced] = useState<AssignmentActionState | null>(null);
  useEffect(() => {
    if (!state.message) return;
    window.dispatchEvent(new CustomEvent<string>(NOTICE_EVENT, { detail: id }));
    const hide = (event: Event) => { if ((event as CustomEvent<string>).detail !== id) setReplaced(state); };
    window.addEventListener(NOTICE_EVENT, hide);
    return () => window.removeEventListener(NOTICE_EVENT, hide);
  }, [state, id]);
  if (!state.message || replaced === state) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`mt-3 rounded-lg p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
      {state.message}
    </p>
  );
}

export type CategoryOption = { id: string; label: string };
export type EditableAssignment = { id: string; title: string; instructions: string; dueLocal: string; maxScore: number; allowLate: boolean };

function AssignmentFields({ courseId, assignment, categories, pending, onCancel }: { courseId: string; assignment?: EditableAssignment; categories: CategoryOption[]; pending: boolean; onCancel: () => void }) {
  const suggested = categories.find((category) => /asignaci|tarea/i.test(category.label))?.id ?? "";
  return (
    <>
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="assignmentId" value={assignment?.id ?? ""} />
      <label className={label}>
        Título
        <input name="title" defaultValue={assignment?.title} required minLength={3} maxLength={140} className={field} placeholder="Ejemplo: Ensayo sobre el ciclo del agua" autoComplete="off" />
      </label>
      <label className={label}>
        Instrucciones
        <textarea name="instructions" defaultValue={assignment?.instructions} required minLength={10} maxLength={30000} rows={5} className={field} placeholder="Explica qué deben hacer y cómo deben entregarlo." />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Fecha y hora límite
          <input name="dueLocal" type="datetime-local" defaultValue={assignment?.dueLocal} className={field} />
          <span className="mt-1 block text-xs font-normal text-slate-500">Hora local de tu institución. Déjala vacía si no hay fecha límite.</span>
        </label>
        <label className={label}>
          Puntaje máximo
          <input name="maxScore" type="number" inputMode="decimal" min="0.01" max="10000" step="any" defaultValue={assignment?.maxScore ?? 100} required className={field} />
        </label>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-900">
        <input name="allowLate" type="checkbox" defaultChecked={assignment?.allowLate ?? true} className="h-5 w-5" />
        Aceptar entregas tarde
      </label>
      {!assignment && categories.length > 0 && (
        <label className={label}>
          ¿Cuenta para la nota del curso?
          <select name="categoryId" defaultValue={suggested} className={field}>
            <option value="">No cuenta para la nota</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
          </select>
        </label>
      )}
      {!assignment && (
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-900">
          <input name="publish" type="checkbox" className="h-5 w-5" />
          Publicar ahora: los estudiantes del curso la verán de inmediato
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button className={primary} type="submit" disabled={pending}>{pending ? "Guardando…" : assignment ? "Guardar cambios" : "Guardar tarea"}</button>
        <button className={secondary} type="button" disabled={pending} onClick={onCancel}>Cancelar</button>
      </div>
    </>
  );
}

/** Botón «Crear tarea» que abre el formulario en la misma pantalla. */
export function CreateAssignment({ courseId, categories }: { courseId: string; categories: CategoryOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (previous: AssignmentActionState, data: FormData) => {
    const result = await saveAssignmentAction(previous, data);
    if (result.ok) setOpen(false);
    return result;
  }, empty);
  return (
    <div>
      {!open && <button type="button" className={primary} onClick={() => setOpen(true)}>Crear tarea</button>}
      {open && (
        <form action={action} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-bold text-slate-950">Nueva tarea</h2>
          <AssignmentFields courseId={courseId} categories={categories} pending={pending} onCancel={() => setOpen(false)} />
        </form>
      )}
      <Notice state={state} />
    </div>
  );
}

export type ManagedAssignment = EditableAssignment & {
  isPublished: boolean;
  submissionCount: number;
  gradedCount: number;
  countsForGrade: boolean;
  deleteBlocked: boolean;
};

const count = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;

/** Editar, Publicar/Ocultar y Borrar de una tarea, cada uno con su confirmación. */
export function AssignmentActions({ courseId, assignment }: { courseId: string; assignment: ManagedAssignment }) {
  const [panel, setPanel] = useState<"none" | "edit" | "publish" | "delete">("none");
  const close = () => setPanel("none");
  const [editState, editAction, editPending] = useActionState(async (previous: AssignmentActionState, data: FormData) => {
    const result = await saveAssignmentAction(previous, data);
    if (result.ok) close();
    return result;
  }, empty);
  const [publishState, publishAction, publishPending] = useActionState(async (previous: AssignmentActionState, data: FormData) => {
    const result = await setAssignmentPublishedAction(previous, data);
    if (result.ok) close();
    return result;
  }, empty);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteAssignmentAction, empty);
  const hasSubmissions = assignment.submissionCount > 0;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondary} onClick={() => setPanel(panel === "edit" ? "none" : "edit")}>Editar</button>
        <button type="button" className={secondary} onClick={() => setPanel(panel === "publish" ? "none" : "publish")}>{assignment.isPublished ? "Ocultar" : "Publicar"}</button>
        <button type="button" className={secondary} onClick={() => setPanel(panel === "delete" ? "none" : "delete")}>Borrar</button>
      </div>

      {panel === "edit" && (
        <form action={editAction} className="mt-3 space-y-3 rounded-lg bg-slate-50 p-4">
          <AssignmentFields courseId={courseId} assignment={assignment} categories={[]} pending={editPending} onCancel={close} />
        </form>
      )}
      <Notice state={editState} />

      {panel === "publish" && (
        <form action={publishAction} className="mt-3 rounded-lg bg-amber-50 p-4 text-sm text-amber-900" role="alertdialog" aria-label={assignment.isPublished ? "Confirmar ocultar tarea" : "Confirmar publicar tarea"}>
          <input type="hidden" name="assignmentId" value={assignment.id} />
          <input type="hidden" name="published" value={assignment.isPublished ? "false" : "true"} />
          <p className="font-semibold">
            {assignment.isPublished
              ? `Los estudiantes dejarán de ver «${assignment.title}» y no podrán entregar. ${hasSubmissions ? `Se conservan ${count(assignment.submissionCount, "entrega", "entregas")} y sus notas.` : "No se borra nada."}`
              : `Todos los estudiantes inscritos en el curso verán «${assignment.title}» y podrán entregar.`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={primary} type="submit" disabled={publishPending}>{publishPending ? "Guardando…" : assignment.isPublished ? "Sí, ocultar" : "Sí, publicar"}</button>
            <button className={secondary} type="button" onClick={close}>Cancelar</button>
          </div>
        </form>
      )}
      <Notice state={publishState} />

      {panel === "delete" && assignment.deleteBlocked && (
        <div className="mt-3 rounded-lg bg-amber-50 p-4 text-sm text-amber-900" role="alertdialog" aria-label="Esta tarea no se puede borrar">
          <p className="font-semibold">Esta tarea no se puede borrar: tiene entregas o notas cuyo historial debe conservarse.</p>
          <p className="mt-1">{assignment.isPublished ? "Puedes ocultarla: los estudiantes dejan de verla y las entregas y las notas se conservan." : "Ya está oculta: los estudiantes no la ven y las entregas y las notas se conservan."}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {assignment.isPublished && <button className={primary} type="button" onClick={() => setPanel("publish")}>Ocultar en su lugar</button>}
            <button className={secondary} type="button" onClick={close}>Cerrar</button>
          </div>
        </div>
      )}
      {panel === "delete" && !assignment.deleteBlocked && (
        <form action={deleteAction} className="mt-3 rounded-lg bg-red-50 p-4 text-sm text-red-900" role="alertdialog" aria-label="Confirmar borrar tarea">
          <input type="hidden" name="assignmentId" value={assignment.id} />
          <p className="font-semibold">
            Se borrará «{assignment.title}». No tiene entregas ni notas guardadas. No se puede deshacer.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={danger} type="submit" disabled={deletePending}>{deletePending ? "Borrando…" : "Sí, borrar tarea"}</button>
            <button className={secondary} type="button" onClick={close}>Cancelar</button>
          </div>
        </form>
      )}
      <Notice state={deleteState} />
    </div>
  );
}

/** Nota y comentario de una entrega. Al cambiar una nota ya puesta pide el motivo. */
export function GradeForm({ submissionId, maxScore, score, feedback, graded, nextHref }: { submissionId: string; maxScore: number; score: number | null; feedback: string; graded: boolean; nextHref: string | null }) {
  const [state, action, pending] = useActionState(gradeSubmissionAction, empty);
  return (
    <form action={action} className="mt-4 space-y-3 rounded-lg bg-slate-50 p-4">
      <input type="hidden" name="submissionId" value={submissionId} />
      <label className={label}>
        Nota (de 0 a {maxScore})
        <input name="score" type="number" inputMode="decimal" min="0" max={maxScore} step="any" required defaultValue={score ?? ""} className={field} />
      </label>
      <label className={label}>
        Comentario para el estudiante (opcional)
        <textarea name="feedback" rows={3} maxLength={5000} defaultValue={feedback} className={field} placeholder="Qué hizo bien y qué puede mejorar." />
      </label>
      {graded && (
        <label className={label}>
          Motivo del cambio
          <input name="reason" maxLength={500} className={field} placeholder="Ejemplo: error al sumar los puntos" autoComplete="off" />
          <span className="mt-1 block text-xs font-normal text-slate-500">Esta entrega ya tiene nota. Si la cambias, escribe por qué: queda guardado en el historial.</span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button className={primary} type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar nota"}</button>
        {nextHref && <Link className={secondary} href={nextHref}>Siguiente por calificar</Link>}
      </div>
      <Notice state={state} />
    </form>
  );
}

/** «Entregar tarea» con texto, enlace o ambos, y confirmación antes de enviar. */
export function SubmitForm({ assignmentId, content, link, resubmitting }: { assignmentId: string; content: string; link: string; resubmitting: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [localError, setLocalError] = useState("");
  const [state, action, pending] = useActionState(async (previous: AssignmentActionState, data: FormData) => {
    const result = await submitAssignmentAction(previous, data);
    setConfirming(false);
    return result;
  }, empty);

  function ask() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    if (!String(data.get("content") ?? "").trim() && !String(data.get("link") ?? "").trim()) {
      setLocalError("Escribe tu respuesta o pega un enlace antes de entregar.");
      return;
    }
    if (!form.reportValidity()) return;
    setLocalError("");
    setConfirming(true);
  }

  return (
    <form ref={formRef} action={action} className="mt-4 space-y-3">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <label className={label}>
        Tu respuesta
        <textarea name="content" rows={6} maxLength={30000} defaultValue={content} readOnly={confirming} className={field} placeholder="Escribe aquí tu trabajo." />
      </label>
      <label className={label}>
        Enlace a tu trabajo (opcional)
        <input name="link" type="url" inputMode="url" pattern="https://.+" maxLength={2000} defaultValue={link} readOnly={confirming} className={field} placeholder="https://…" autoComplete="off" />
        <span className="mt-1 block text-xs font-normal text-slate-500">Por ejemplo un documento compartido. Debe empezar con https:// y tu docente debe poder abrirlo. Si envías un enlace, por ahora no podrás reemplazar esta entrega.</span>
      </label>
      {localError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{localError}</p>}
      {!confirming && <button type="button" className={primary} onClick={ask} disabled={pending}>{resubmitting ? "Volver a entregar" : "Entregar tarea"}</button>}
      {confirming && (
        <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900" role="alertdialog" aria-label="Confirmar entrega">
          <p className="font-semibold">
            Tu docente verá esta entrega. {resubmitting ? "Reemplaza a la que enviaste antes; la anterior queda guardada como versión previa." : "Las entregas solo de texto pueden cambiarse mientras no estén calificadas y la tarea siga abierta."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={primary} type="submit" disabled={pending}>{pending ? "Entregando…" : "Sí, entregar"}</button>
            <button className={secondary} type="button" disabled={pending} onClick={() => setConfirming(false)}>Seguir editando</button>
          </div>
        </div>
      )}
      <Notice state={state} />
    </form>
  );
}
