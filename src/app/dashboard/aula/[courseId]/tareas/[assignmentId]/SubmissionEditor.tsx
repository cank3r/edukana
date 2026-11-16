"use client";

import type { RefObject } from "react";
import { Paperclip } from "lucide-react";
import { formatFileSize } from "@/lib/upload-client";
import { SUBMISSION_ACCEPT, SUBMISSION_MAX_BYTES, SUBMISSION_MAX_FILES } from "@/lib/uploads";
import type { SubmissionFile } from "@/server/courses/submission-files";

export const primary = "inline-flex min-h-11 max-w-full items-center justify-center rounded-lg " +
  "bg-[var(--blue)] px-[16px] py-2.5 text-center font-semibold whitespace-normal text-white focus-visible:!outline-[var(--navy)] [overflow-wrap:anywhere] disabled:opacity-60";
export const secondary = "inline-flex min-h-11 max-w-full items-center justify-center rounded-lg " +
  "border border-slate-300 bg-white px-[16px] py-2.5 text-center font-semibold whitespace-normal text-slate-800 focus-visible:!outline-[var(--navy)] [overflow-wrap:anywhere] disabled:opacity-60";
const field = "mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-500 bg-white px-[12px] py-2 text-base focus-visible:!outline-[var(--navy)]";
export type SubmissionDraft = { content: string; link: string };

/** Private presentation; SubmitWithFiles owns draft, upload and removal operations. */
export function SubmissionEditor({ id, draft, frozen, currentFiles, leftOut, ready, total, uploading, removingId,
  inputRef, onDraft, onAdd, onRemove, onToggle }: {
  id: string; draft: SubmissionDraft; frozen: boolean; currentFiles: SubmissionFile[]; leftOut: Set<string>;
  ready: SubmissionFile[]; total: number; uploading: boolean; removingId: string | null;
  inputRef: RefObject<HTMLInputElement | null>; onDraft: (key: keyof SubmissionDraft, value: string) => void;
  onAdd: (files: FileList | null) => void; onRemove: (file: SubmissionFile) => void; onToggle: (id: string, keep: boolean) => void;
}) {
  return <div className="min-w-0 space-y-4">
    <div>
      <label htmlFor={`${id}-answer`} className="block text-sm font-semibold text-slate-900">Tu respuesta</label>
      <textarea id={`${id}-answer`} name="content" rows={5} maxLength={30000} value={draft.content}
        onChange={event => onDraft("content", event.currentTarget.value)} readOnly={frozen}
        className={field} placeholder="Escribe aquí tu trabajo." aria-describedby={`${id}-answer-help`} />
      <p id={`${id}-answer-help`} className="mt-1 text-sm text-slate-600">Si tu trabajo está en un archivo o enlace, puedes dejar este campo vacío.</p>
    </div>
    <fieldset className="min-w-0 rounded-lg border border-slate-200 p-[12px]" disabled={frozen}
      aria-busy={removingId !== null || uploading}>
      <legend className="max-w-full px-1 text-sm font-semibold text-slate-900">Archivos (opcional)</legend>
      <p className="text-sm text-slate-600">Hasta {SUBMISSION_MAX_FILES} archivos de {formatFileSize(SUBMISSION_MAX_BYTES)} cada uno.
        Agregarlos aquí no entrega la tarea.</p>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 focus-visible:!outline-[var(--navy)] text-sm font-medium text-slate-700">Formatos permitidos</summary>
        <p className="pb-2 text-sm text-slate-600">PDF, JPG, PNG, WebP, GIF, Word, Excel, PowerPoint o ZIP.</p>
      </details>
      {currentFiles.length > 0 && <>
        <ul className="divide-y divide-slate-100" aria-label="Archivos de la entrega anterior">
          {currentFiles.map(file => <li key={file.id} className="min-w-0 py-2">
            <label className="flex min-h-11 min-w-0 items-start gap-2 text-sm text-slate-900">
              <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 focus-visible:!outline-[var(--navy)]" checked={!leftOut.has(file.id)}
                onChange={event => onToggle(file.id, event.currentTarget.checked)} aria-label={`Incluir ${file.name}`} />
              <span className="min-w-0"><span className="block [overflow-wrap:anywhere] font-medium">{file.name}</span>
                <span className="block text-slate-600">{formatFileSize(file.sizeBytes)} · entrega anterior</span></span>
            </label>
            <a className="inline-flex min-h-11 max-w-full items-center text-sm font-semibold text-blue-700 underline focus-visible:!outline-[var(--navy)]"
              href={file.url} target="_blank" rel="noopener noreferrer" aria-label={`Descargar ${file.name}`}>Descargar</a>
          </li>)}
        </ul>
        <p className="text-sm text-slate-600">Desmarca los archivos que no quieras incluir. Seguirán guardados en la entrega anterior.</p>
      </>}
      {ready.length > 0 && <ul className="divide-y divide-slate-100" aria-label="Archivos listos para entregar">
        {ready.map(file => <li key={file.id} className="min-w-0 py-2">
          <div className="flex min-w-0 items-start gap-2 text-sm text-slate-900">
            <Paperclip size={16} aria-hidden="true" className="mt-1 shrink-0 text-slate-500" />
            <div className="min-w-0"><p className="[overflow-wrap:anywhere] font-medium">{file.name}</p>
              <p className="text-slate-600">{formatFileSize(file.sizeBytes)} · listo para entregar</p></div>
          </div>
          <button type="button" className="min-h-11 max-w-full px-2 text-sm font-semibold text-red-700 underline focus-visible:!outline-[var(--navy)] disabled:opacity-60"
            disabled={frozen} onClick={() => onRemove(file)} aria-label={`Quitar ${file.name}`}>
            {removingId === file.id ? "Quitando…" : "Quitar"}
          </button>
        </li>)}
      </ul>}
      {total < SUBMISSION_MAX_FILES && <label
        className={`${secondary} mt-2 cursor-pointer gap-2 focus-within:ring-2 focus-within:ring-blue-500 ${frozen ? "opacity-60" : ""}`}>
        <Paperclip size={18} aria-hidden="true" className="shrink-0" />
        <span>{uploading ? "Subiendo archivo…" : "Agregar archivos"}</span>
        <input ref={inputRef} type="file" multiple accept={SUBMISSION_ACCEPT} className="sr-only" disabled={frozen}
          onChange={event => onAdd(event.currentTarget.files)} />
      </label>}
    </fieldset>
    <div>
      <label htmlFor={`${id}-link`} className="block text-sm font-semibold text-slate-900">Enlace a tu trabajo (opcional)</label>
      <input id={`${id}-link`} name="link" type="url" inputMode="url" pattern="https://.+" maxLength={2000}
        value={draft.link} onChange={event => onDraft("link", event.currentTarget.value)} readOnly={frozen}
        className={field} placeholder="https://…" autoComplete="off" aria-describedby={`${id}-link-help`} />
      <p id={`${id}-link-help`} className="mt-1 text-sm text-slate-600">Debe empezar con https:// y tu docente debe poder abrirlo.
        Si incluyes un enlace, por ahora no podrás reemplazar esta entrega.</p>
    </div>
  </div>;
}
