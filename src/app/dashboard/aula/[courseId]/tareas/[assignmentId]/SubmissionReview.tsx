"use client";

import { useId, type ReactNode, type RefObject } from "react";
import { CheckCircle2 } from "lucide-react";
import { formatFileSize } from "@/lib/upload-client";
import type { SubmissionFile } from "@/server/courses/submission-files";
import { primary, secondary, type SubmissionDraft } from "./SubmissionEditor";

export type SubmissionSnapshot = SubmissionDraft & { files: SubmissionFile[]; excluded: SubmissionFile[]; resubmitting: boolean };

/** Signed URLs may refresh without changing the work that was reviewed. */
export function snapshotKey(snapshot: SubmissionSnapshot) {
  const files = (items: SubmissionFile[]) => items.map(({ id, name, sizeBytes }) => [id, name, sizeBytes]);
  return JSON.stringify([snapshot.content, snapshot.link, files(snapshot.files), files(snapshot.excluded), snapshot.resubmitting]);
}

export function SubmissionProgress({ active, prepared, busy, onNavigate }: {
  active: 1 | 2; prepared: boolean; busy: boolean; onNavigate: (step: 1 | 2) => void;
}) {
  const labels = ["Prepara tu respuesta", "Revisa y entrega"];
  const completed = [prepared, false];
  return <ol aria-label="Pasos para entregar tu tarea" className="grid min-w-0 gap-2 sm:grid-cols-2">
    {labels.map((label, index) => <li key={index} className="min-w-0">
      <button type="button" aria-current={index + 1 === active ? "step" : undefined} disabled={busy}
        onClick={() => onNavigate((index + 1) as 1 | 2)}
        className={`flex min-h-11 w-full min-w-0 items-start gap-2 rounded-lg border p-[12px] text-left text-sm
          focus-visible:!outline-[var(--navy)] disabled:cursor-wait ${index + 1 === active ? "ring-2 ring-blue-700 ring-offset-2" : ""}
          ${completed[index] ? "border-emerald-700 bg-emerald-50 text-emerald-950"
            : index + 1 === active ? "border-blue-700 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-700"}`}>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white font-bold">{index + 1}</span>
        <span className="min-w-0 [overflow-wrap:anywhere]"><span className="font-semibold">{label}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium">
            {completed[index] && <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <CheckCircle2 aria-hidden="true" size={16} className="shrink-0" />Completado
            </span>}
            {index + 1 === active && <span className="inline-block whitespace-nowrap">Ahora</span>}
          </span>
        </span>
      </button>
    </li>)}
  </ol>;
}

/** Frozen payload, rendered as text. Never a second form or an independent send operation. */
export function SubmissionSummary({ snapshot, delivered = false }: { snapshot: SubmissionSnapshot; delivered?: boolean }) {
  return <dl className="min-w-0 space-y-4 text-sm text-slate-800">
    <div><dt className="font-semibold text-slate-950">Tu respuesta</dt>
      <dd className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{snapshot.content || "Sin respuesta escrita."}</dd></div>
    {snapshot.link && <div><dt className="font-semibold text-slate-950">Enlace a tu trabajo</dt>
      <dd className="mt-1 [overflow-wrap:anywhere]">{delivered
        ? <a href={snapshot.link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline">{snapshot.link}</a>
        : snapshot.link}</dd></div>}
    <div><dt className="font-semibold text-slate-950">Archivos incluidos ({snapshot.files.length})</dt>
      <dd className="mt-1">{snapshot.files.length === 0 ? "Sin archivos adjuntos." : <ul className="space-y-2">
        {snapshot.files.map(file => <li key={file.id} className="min-w-0">
          <span className="block [overflow-wrap:anywhere]">{file.name}</span>
          <span className="text-slate-600">{formatFileSize(file.sizeBytes)}</span>
          {delivered && <a href={file.url} target="_blank" rel="noopener noreferrer" aria-label={`Descargar ${file.name}`}
            className="ml-2 inline-flex min-h-11 items-center font-semibold text-blue-700 underline">Descargar</a>}
        </li>)}
      </ul>}</dd></div>
    {snapshot.excluded.length > 0 && <div><dt className="font-semibold text-slate-950">Quedan en la entrega anterior</dt>
      <dd className="mt-1"><ul>{snapshot.excluded.map(file =>
        <li key={file.id} className="[overflow-wrap:anywhere]">{file.name}</li>)}</ul>
        <p className="mt-1 text-slate-600">No se borran ni se incluyen en esta nueva versión.</p></dd></div>}
  </dl>;
}

export function SubmissionConfirmation({ snapshot, headingRef, pending, reviewed, onEdit, onReview }: {
  snapshot: SubmissionSnapshot; headingRef: RefObject<HTMLHeadingElement | null>;
  pending: boolean; reviewed: boolean; onEdit: () => void; onReview: () => void;
}) {
  return <section aria-label="Confirmación de la entrega" aria-busy={pending}
    className="min-w-0 space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-[12px]">
    <h3 ref={headingRef} tabIndex={-1} className="text-lg font-bold text-slate-950">
      {pending ? "Entregando tu tarea" : "Revisa y entrega"}
    </h3>
    {pending ? <p role="status" className="font-semibold text-slate-900">Espera la confirmación.</p>
      : !reviewed ? <p role="status" className="font-semibold text-slate-900">Hay cambios. Revísalos antes de entregar.</p>
        : <p className="text-sm text-slate-700">Comprueba tu respuesta y confirma para enviársela a tu docente.</p>}
    {snapshot.resubmitting && <p className="text-sm text-slate-700">
      Esta versión reemplaza la anterior. La anterior queda guardada con sus archivos.
    </p>}
    <SubmissionSummary snapshot={snapshot} />
    <div className="flex flex-wrap gap-2">
      {reviewed || pending ? <>
        <button key="send" type="submit" className={primary} disabled={pending}>
          {pending ? "Entregando…" : snapshot.resubmitting ? "Actualizar entrega" : "Entregar tarea"}
        </button>
        <button type="button" className={secondary} disabled={pending} onClick={onEdit}>Corregir respuesta</button>
      </> : <button key="review-changes" type="button" className={primary} onClick={onReview}>Revisar cambios</button>}
    </div>
  </section>;
}

export function SubmissionSuccess({ message, headingRef, tasksHref, snapshot, savedSummary, restriction, onEdit }: {
  message: string; headingRef: RefObject<HTMLHeadingElement | null>; tasksHref?: string; snapshot: SubmissionSnapshot;
  savedSummary?: ReactNode; restriction?: ReactNode; onEdit?: () => void;
}) {
  const summaryId = useId();
  return <section className="min-w-0 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-[12px]" aria-label="Entrega confirmada">
    <CheckCircle2 aria-hidden="true" size={28} className="text-emerald-800" />
    <h3 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-slate-950">Tarea entregada</h3>
    <p role="status" className="text-emerald-950">{message}</p>
    {savedSummary}
    <div className="flex flex-wrap gap-2">
      {tasksHref && <a href={tasksHref} className={primary}>Volver a mis tareas</a>}
      {onEdit ? <button type="button" className={secondary} onClick={onEdit}>Editar entrega</button>
        : <a href={`#${summaryId}`} className={secondary}>Revisar entrega</a>}
    </div>
    {restriction}
    <h4 id={summaryId} tabIndex={-1} className="pt-2 font-semibold text-slate-950">Tu respuesta enviada</h4>
    <SubmissionSummary snapshot={snapshot} delivered />
  </section>;
}
