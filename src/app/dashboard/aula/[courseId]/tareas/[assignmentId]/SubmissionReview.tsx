"use client";

import type { RefObject } from "react";
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

export function SubmissionProgress({ active, completed, busy, deliveryLabel, onNavigate }: {
  active: 1 | 2 | 3; completed: boolean[]; busy: boolean; deliveryLabel: string; onNavigate: (step: 1 | 2 | 3) => void;
}) {
  const labels = ["Prepara tu respuesta", "Revisa tu respuesta", deliveryLabel];
  return <ol aria-label="Pasos para entregar tu tarea" className="grid min-w-0 gap-2 lg:grid-cols-3">
    {labels.map((label, index) => <li key={index} className="min-w-0">
      <button type="button" aria-current={index + 1 === active ? "step" : undefined} disabled={busy}
        onClick={() => onNavigate((index + 1) as 1 | 2 | 3)}
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
export function SubmissionSummary({ snapshot }: { snapshot: SubmissionSnapshot }) {
  return <dl className="min-w-0 space-y-4 text-sm text-slate-800">
    <div><dt className="font-semibold text-slate-950">Tu respuesta</dt>
      <dd className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{snapshot.content || "Sin respuesta escrita."}</dd></div>
    {snapshot.link && <div><dt className="font-semibold text-slate-950">Enlace a tu trabajo</dt>
      <dd className="mt-1 [overflow-wrap:anywhere]">{snapshot.link}</dd></div>}
    <div><dt className="font-semibold text-slate-950">Archivos incluidos ({snapshot.files.length})</dt>
      <dd className="mt-1">{snapshot.files.length === 0 ? "Sin archivos adjuntos." : <ul className="space-y-2">
        {snapshot.files.map(file => <li key={file.id} className="min-w-0">
          <span className="block [overflow-wrap:anywhere]">{file.name}</span>
          <span className="text-slate-600">{formatFileSize(file.sizeBytes)}</span>
        </li>)}
      </ul>}</dd></div>
    {snapshot.excluded.length > 0 && <div><dt className="font-semibold text-slate-950">Quedan en la entrega anterior</dt>
      <dd className="mt-1"><ul>{snapshot.excluded.map(file =>
        <li key={file.id} className="[overflow-wrap:anywhere]">{file.name}</li>)}</ul>
        <p className="mt-1 text-slate-600">No se borran ni se incluyen en esta nueva versión.</p></dd></div>}
  </dl>;
}

export function SubmissionReview({ snapshot, headingRef, message, onContinue, onEdit }: {
  snapshot: SubmissionSnapshot; headingRef: RefObject<HTMLHeadingElement | null>;
  message: string; onContinue: () => void; onEdit: () => void;
}) {
  return <section aria-label="Revisión de la entrega"
    className="min-w-0 space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-[12px]">
    <h3 ref={headingRef} tabIndex={-1} className="text-lg font-bold text-slate-950">Revisa tu respuesta</h3>
    {message && <p role="status" className="font-semibold text-slate-900">{message}</p>}
    <SubmissionSummary snapshot={snapshot} />
    <div className="flex flex-wrap gap-2">
      <button type="button" className={primary} onClick={onContinue}>Continuar a entrega</button>
      <button type="button" className={secondary} onClick={onEdit}>Corregir respuesta</button>
    </div>
  </section>;
}

export function SubmissionConfirmation({ snapshot, headingRef, pending, reviewed, onReview }: {
  snapshot: SubmissionSnapshot; headingRef: RefObject<HTMLHeadingElement | null>;
  pending: boolean; reviewed: boolean; onReview: () => void;
}) {
  return <section aria-label="Confirmación de la entrega" aria-busy={pending}
    className="min-w-0 space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-[12px]">
    <h3 ref={headingRef} tabIndex={-1} className="text-lg font-bold text-slate-950">
      {pending ? "Entregando tu tarea" : "Entrega tu tarea"}
    </h3>
    {pending ? <p role="status" className="font-semibold text-slate-900">Espera la confirmación.</p>
      : !reviewed ? <p role="status" className="font-semibold text-slate-900">Hay cambios. Revísalos antes de entregar.</p>
        : <p className="text-sm text-slate-700">Ya revisaste tu respuesta. Confirma para enviársela a tu docente.</p>}
    {snapshot.resubmitting && <p className="text-sm text-slate-700">
      Esta versión reemplaza la anterior. La anterior queda guardada con sus archivos.
    </p>}
    <div className="flex flex-wrap gap-2">
      {reviewed || pending ? <>
        <button type="submit" className={primary} disabled={pending}>
          {pending ? "Entregando…" : snapshot.resubmitting ? "Actualizar entrega" : "Entregar tarea"}
        </button>
        <button type="button" className={secondary} disabled={pending} onClick={onReview}>Volver a revisión</button>
      </> : <button type="button" className={primary} onClick={onReview}>Revisar cambios</button>}
    </div>
    <SubmissionSummary snapshot={snapshot} />
  </section>;
}

export function SubmissionSent({ snapshot, headingRef, title, href }: {
  snapshot: SubmissionSnapshot; headingRef: RefObject<HTMLHeadingElement | null>; title: string; href?: string;
}) {
  return <section className="min-w-0 space-y-4">
    <h3 ref={headingRef} tabIndex={-1} className="text-lg font-bold text-slate-950">{title}</h3>
    <p className="text-sm text-emerald-950">Esta respuesta ya fue entregada.</p>
    <SubmissionSummary snapshot={snapshot} />
    {href && <a href={href} className={primary}>Ver mi entrega</a>}
  </section>;
}

export function SubmissionSuccess({ message, headingRef, href, snapshot }: {
  message: string; headingRef: RefObject<HTMLHeadingElement | null>; href?: string; snapshot: SubmissionSnapshot;
}) {
  return <section className="min-w-0 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-[12px]" aria-label="Entrega confirmada">
    <CheckCircle2 aria-hidden="true" size={28} className="text-emerald-800" />
    <h3 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-slate-950">¡Lo lograste!</h3>
    <p role="status" className="text-emerald-950">{message}</p>
    <div className="flex flex-wrap gap-2">
      {href && <a href={href} className={primary}>Ver mi entrega</a>}
    </div>
    <h4 className="pt-2 font-semibold text-slate-950">Tu respuesta enviada</h4>
    <SubmissionSummary snapshot={snapshot} />
  </section>;
}
