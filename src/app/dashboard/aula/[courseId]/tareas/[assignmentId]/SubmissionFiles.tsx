"use client";

import { useActionState, useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import { submitWithFilesAction, type FileActionState } from "@/server/actions/files";
import { formatFileSize, uploadFile } from "@/lib/upload-client";
import { SUBMISSION_ACCEPT, SUBMISSION_MAX_BYTES, SUBMISSION_MAX_FILES } from "@/lib/uploads";
import type { SubmissionFile } from "@/server/courses/submission-files";

const primary = "inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const secondary = "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60";
const field = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-blue-500";
const label = "block text-sm font-medium text-slate-900";
const empty: FileActionState = { ok: false, message: "" };

/** Lista de archivos para abrir o descargar (docente y estudiante). */
export function FileList({ files, title }: { files: SubmissionFile[]; title: string }) {
  if (files.length === 0) return null;
  return (
    <div className="mt-3">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200">
        {files.map((file) => (
          <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1">
            <span className="flex min-w-0 items-center gap-2 text-sm text-slate-900"><Paperclip size={16} aria-hidden="true" className="shrink-0 text-slate-500" /><span className="break-all">{file.name}</span><span className="shrink-0 text-slate-500">{formatFileSize(file.sizeBytes)}</span></span>
            <a className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline" href={file.url} target="_blank" rel="noopener noreferrer" aria-label={`Descargar ${file.name}`}>Descargar</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Entregar con texto, enlace y hasta cinco archivos. Los archivos se suben al elegirlos y quedan
 * «listos»; se ligan a la entrega al confirmar. Al volver a entregar, se puede dejar fuera un
 * archivo de la entrega anterior: no se borra, queda guardado en la versión previa.
 */
export function SubmitWithFiles({ assignmentId, content, link, resubmitting, currentFiles, pendingFiles }: {
  assignmentId: string;
  content: string;
  link: string;
  resubmitting: boolean;
  currentFiles: SubmissionFile[];
  pendingFiles: SubmissionFile[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [localError, setLocalError] = useState("");
  const [uploading, setUploading] = useState(false);
  /** Subidos en esta visita (antes de que la página se actualice). */
  const [uploaded, setUploaded] = useState<SubmissionFile[]>([]);
  /** Quitados de la lista en esta visita. */
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  /** Archivos de la entrega vigente que el estudiante deja fuera de la nueva versión. */
  const [leftOut, setLeftOut] = useState<Set<string>>(new Set());
  const [state, action, pending] = useActionState(async (previous: FileActionState, data: FormData) => {
    const result = await submitWithFilesAction(previous, data);
    setConfirming(false);
    if (result.ok) {
      setUploaded([]);
      setRemoved(new Set());
      setLeftOut(new Set());
    }
    return result;
  }, empty);

  const ready = [...pendingFiles, ...uploaded.filter((file) => !pendingFiles.some((other) => other.id === file.id))].filter((file) => !removed.has(file.id));
  const kept = currentFiles.filter((file) => !leftOut.has(file.id));
  const total = kept.length + ready.length;
  const busy = pending || uploading;

  async function addFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setLocalError("");
    if (total + files.length > SUBMISSION_MAX_FILES) {
      setLocalError(`Puedes entregar hasta ${SUBMISSION_MAX_FILES} archivos. Quita alguno antes de agregar más.`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setUploading(true);
    try {
      for (const file of files) {
        const id = await uploadFile(file, { purpose: "submission", assignmentId });
        setUploaded((current) => [...current, { id, name: file.name, sizeBytes: file.size, url: `/api/assets/${id}` }]);
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "No se pudo subir el archivo. Intenta de nuevo.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeReady(file: SubmissionFile) {
    setLocalError("");
    const response = await fetch(`/api/uploads/${file.id}`, { method: "DELETE" }).catch(() => null);
    if (!response || (!response.ok && response.status !== 404)) {
      setLocalError(`No se pudo quitar «${file.name}». Intenta de nuevo.`);
      return;
    }
    setRemoved((current) => new Set(current).add(file.id));
  }

  function toggleKept(id: string, keep: boolean) {
    setLeftOut((current) => {
      const next = new Set(current);
      if (keep) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function ask() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    if (!String(data.get("content") ?? "").trim() && !String(data.get("link") ?? "").trim() && total === 0) {
      setLocalError("Escribe tu respuesta, pega un enlace o adjunta un archivo antes de entregar.");
      return;
    }
    if (!form.reportValidity()) return;
    setLocalError("");
    setConfirming(true);
  }

  return (
    <form ref={formRef} action={action} className="mt-4 space-y-3">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      {[...kept, ...ready].map((file) => <input key={file.id} type="hidden" name="assetIds" value={file.id} />)}
      <label className={label}>
        Tu respuesta
        <textarea name="content" rows={6} maxLength={30000} defaultValue={content} readOnly={confirming} className={field} placeholder="Escribe aquí tu trabajo." />
      </label>
      <label className={label}>
        Enlace a tu trabajo (opcional)
        <input name="link" type="url" inputMode="url" pattern="https://.+" maxLength={2000} defaultValue={link} readOnly={confirming} className={field} placeholder="https://…" autoComplete="off" />
        <span className="mt-1 block text-xs font-normal text-slate-500">Por ejemplo un documento compartido. Debe empezar con https:// y tu docente debe poder abrirlo. Si envías un enlace, por ahora no podrás reemplazar esta entrega.</span>
      </label>

      <fieldset className="rounded-lg border border-slate-200 p-3" disabled={confirming}>
        <legend className="px-1 text-sm font-medium text-slate-900">Archivos (opcional)</legend>
        <p className="text-xs text-slate-500">Hasta {SUBMISSION_MAX_FILES} archivos: PDF, imágenes, Word, Excel, PowerPoint o ZIP, de hasta {formatFileSize(SUBMISSION_MAX_BYTES)} cada uno. Solo tú y tu docente pueden abrirlos.</p>
        {currentFiles.length > 0 && (
          <ul className="mt-2 divide-y divide-slate-100">
            {currentFiles.map((file) => (
              <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                <label className="flex min-h-11 min-w-0 items-center gap-2 text-sm text-slate-900">
                  <input type="checkbox" className="h-5 w-5 shrink-0" checked={!leftOut.has(file.id)} onChange={(event) => toggleKept(file.id, event.currentTarget.checked)} />
                  <span className="break-all">{file.name}</span>
                  <span className="shrink-0 text-slate-500">{formatFileSize(file.sizeBytes)}</span>
                </label>
                <a className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline" href={file.url} target="_blank" rel="noopener noreferrer" aria-label={`Descargar ${file.name}`}>Descargar</a>
              </li>
            ))}
          </ul>
        )}
        {currentFiles.length > 0 && <p className="mt-1 text-xs text-slate-500">Desmarca un archivo para dejarlo fuera de la nueva entrega. No se borra: queda guardado en tu entrega anterior.</p>}
        {ready.length > 0 && (
          <ul className="mt-2 divide-y divide-slate-100" aria-label="Archivos listos para entregar">
            {ready.map((file) => (
              <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                <span className="flex min-w-0 items-center gap-2 text-sm text-slate-900"><Paperclip size={16} aria-hidden="true" className="shrink-0 text-slate-500" /><span className="break-all">{file.name}</span><span className="shrink-0 text-slate-500">{formatFileSize(file.sizeBytes)} · listo para entregar</span></span>
                <button type="button" className="min-h-11 px-2 text-sm font-semibold text-red-700 underline disabled:opacity-60" disabled={busy || confirming} onClick={() => void removeReady(file)} aria-label={`Quitar ${file.name}`}>Quitar</button>
              </li>
            ))}
          </ul>
        )}
        {total < SUBMISSION_MAX_FILES && (
          <label className={`${secondary} mt-3 cursor-pointer gap-2 focus-within:ring-2 focus-within:ring-blue-300 ${busy || confirming ? "pointer-events-none opacity-60" : ""}`}>
            <Paperclip size={18} aria-hidden="true" />
            {uploading ? "Subiendo archivo…" : "Agregar archivos"}
            <input ref={inputRef} type="file" multiple accept={SUBMISSION_ACCEPT} className="sr-only" disabled={busy || confirming} onChange={(event) => void addFiles(event.currentTarget.files)} />
          </label>
        )}
      </fieldset>

      {localError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{localError}</p>}
      {!confirming && <button type="button" className={primary} onClick={ask} disabled={busy}>{resubmitting ? "Volver a entregar" : "Entregar tarea"}</button>}
      {confirming && (
        <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900" role="alertdialog" aria-label="Confirmar entrega">
          <p className="font-semibold">
            Tu docente verá esta entrega{total > 0 ? ` con ${total} ${total === 1 ? "archivo" : "archivos"}` : ""}. {resubmitting ? "Reemplaza a la que enviaste antes; la anterior queda guardada como versión previa, con sus archivos." : "Puedes cambiarla mientras no esté calificada y la tarea siga abierta, salvo que envíes un enlace."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={primary} type="submit" disabled={pending}>{pending ? "Entregando…" : "Sí, entregar"}</button>
            <button className={secondary} type="button" disabled={pending} onClick={() => setConfirming(false)}>Seguir editando</button>
          </div>
        </div>
      )}
      {state.message && <p role={state.ok ? "status" : "alert"} className={`mt-3 rounded-lg p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p>}
    </form>
  );
}
