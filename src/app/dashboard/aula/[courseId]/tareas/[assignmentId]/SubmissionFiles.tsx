"use client";

import { useActionState, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Paperclip } from "lucide-react";
import { submitWithFilesAction, type FileActionState } from "@/server/actions/files";
import { formatFileSize, uploadFile } from "@/lib/upload-client";
import { SUBMISSION_MAX_FILES } from "@/lib/uploads";
import type { SubmissionFile } from "@/server/courses/submission-files";

import { SubmissionEditor, primary, secondary, type SubmissionDraft } from "./SubmissionEditor";
import { SubmissionProgress, SubmissionConfirmation,
  SubmissionSummary, SubmissionSuccess, snapshotKey, type SubmissionSnapshot } from "./SubmissionReview";

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

/** One draft, one confirmation; persisted submissions start at the finished state. */
export function SubmitWithFiles({ assignmentId, content, link, resubmitting, currentFiles, pendingFiles,
  guideContext, canSubmit = true, savedSummary, readOnlyContent, assignmentHref, tasksHref }: {
  assignmentId: string; content: string; link: string; resubmitting: boolean;
  currentFiles: SubmissionFile[]; pendingFiles: SubmissionFile[];
  guideContext?: { title: string; instructions: string }; canSubmit?: boolean;
  savedSummary?: ReactNode; readOnlyContent?: ReactNode; assignmentHref?: string; tasksHref?: string;
}) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null), inputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLHeadingElement>(null);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null), resultRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null), reviewButtonRef = useRef<HTMLButtonElement>(null);
  const readOnlyRef = useRef<HTMLDivElement>(null);
  const workingRef = useRef<"upload" | "remove" | "submit" | null>(null);
  const allowedRef = useRef(canSubmit), reviewRef = useRef<SubmissionSnapshot | null>(null);
  const [draft, setDraft] = useState<SubmissionDraft>({ content, link });
  const [review, setReview] = useState<SubmissionSnapshot | null>(null);
  const [stage, setStage] = useState<1 | 2>(1);
  const [checkpoint, setCheckpoint] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<SubmissionSnapshot | null>(() => resubmitting
    ? { content, link, files: currentFiles, excluded: [], resubmitting: true } : null);
  const [editing, setEditing] = useState(!resubmitting);
  const [localError, setLocalError] = useState(""), [showResult, setShowResult] = useState(false);
  const [uploading, setUploading] = useState(false), [removingId, setRemovingId] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<SubmissionFile[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set()), [leftOut, setLeftOut] = useState<Set<string>>(new Set());
  type Focus = "editor" | "review" | "result" | "error" | "reviewButton" | "readOnly";
  const [focusRequest, setFocusRequest] = useState<{ target: Focus } | null>(null);
  const focus = (target: Focus) => setFocusRequest({ target });
  useLayoutEffect(() => {
    const refs = { editor: editorRef, review: reviewHeadingRef,
      result: resultRef, error: errorRef, reviewButton: reviewButtonRef, readOnly: readOnlyRef };
    if (focusRequest) refs[focusRequest.target].current?.focus();
  }, [focusRequest]);
  useLayoutEffect(() => {
    if (allowedRef.current && !canSubmit && workingRef.current !== "submit") readOnlyRef.current?.focus();
    allowedRef.current = canSubmit;
  }, [canSubmit]);
  const [state, action, pending] = useActionState(async (previous: FileActionState, data: FormData) => {
    const snapshot = reviewRef.current;
    try {
      let result: FileActionState;
      if (!snapshot || !allowedRef.current) result = { ok: false, message: "Esta tarea ya no permite cambios." };
      else {
        try { result = await submitWithFilesAction(previous, data); }
        catch { result = { ok: false, message: "No recibimos una confirmación del servidor." }; }
      }
      setShowResult(true);
      setStage(2);
      if (result.ok && snapshot) {
        setConfirmed({ ...snapshot, excluded: [] }); setEditing(false); focus("result");
      } else {
        focus("error");
      }
      return result;
    } finally { workingRef.current = null; }
  }, empty);
  const ready = [...pendingFiles, ...uploaded.filter(file => !pendingFiles.some(other => other.id === file.id))]
    .filter(file => !removed.has(file.id) && !currentFiles.some(other => other.id === file.id));
  const kept = currentFiles.filter(file => !leftOut.has(file.id));
  const total = kept.length + ready.length, busy = pending || uploading || removingId !== null;
  const uncertain = showResult && !state.ok;
  const finished = !!confirmed && !editing;
  const canEdit = canSubmit && editing && stage === 1;
  const makeSnapshot = (): SubmissionSnapshot => ({ content: draft.content.trim(), link: draft.link.trim(),
    files: [...kept, ...ready], excluded: currentFiles.filter(file => leftOut.has(file.id)), resubmitting: resubmitting || !!confirmed });
  const liveKey = snapshotKey(makeSnapshot());
  const prepared = pending || checkpoint === liveKey;
  // Invalidate before painting if refreshed files changed; equivalent props preserve progress.
  if (checkpoint && checkpoint !== liveKey && !pending && editing) setCheckpoint(null);
  const changed = draft.content !== content || draft.link !== link || uploaded.length > 0 || pendingFiles.length > 0 || leftOut.size > 0;
  function error(message: string) { setLocalError(message); focus("error"); }
  function edit(destination: "editor" | "reviewButton" = "editor") {
    if (busy || workingRef.current || !canSubmit || finished) return;
    setStage(1); setLocalError(""); focus(destination);
  }
  function startEditing() {
    if (!canSubmit || busy || workingRef.current || !confirmed) return;
    setDraft({ content: confirmed.content, link: confirmed.link });
    // Uploads/discards already happened on the server; cancelling edits must not undo their bookkeeping.
    setLeftOut(new Set()); setCheckpoint(null);
    setShowResult(false); setLocalError(""); setEditing(true); setStage(1); focus("editor");
  }
  function ask() {
    if (!canSubmit || finished || busy || workingRef.current) return;
    if (!draft.content.trim() && !draft.link.trim() && total === 0) {
      setStage(1); error("Escribe tu respuesta, pega un enlace o adjunta un archivo antes de entregar."); return;
    }
    if (!formRef.current?.reportValidity()) return;
    const snapshot = makeSnapshot();
    const key = snapshotKey(snapshot);
    setCheckpoint(key); setShowResult(false);
    setLocalError(""); setReview(snapshot); reviewRef.current = snapshot;
    setStage(2); focus("review");
  }
  function navigate(step: 1 | 2) {
    if (busy || workingRef.current || finished || !canSubmit) return;
    if (step === 1) { edit(); return; }
    ask();
  }
  async function addFiles(list: globalThis.FileList | null) {
    if (!canEdit || busy || workingRef.current) return;
    const files = Array.from(list ?? []);
    if (!files.length) return;
    if (total + files.length > SUBMISSION_MAX_FILES) {
      error(`Puedes entregar hasta ${SUBMISSION_MAX_FILES} archivos. Quita alguno antes de agregar más.`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    workingRef.current = "upload"; setUploading(true); setLocalError("");
    let name = "";
    try {
      for (const file of files) {
        name = file.name;
        if (!allowedRef.current) throw new Error("Esta tarea ya no permite agregar archivos.");
        const assetId = await uploadFile(file, { purpose: "submission", assignmentId });
        const added = { id: assetId, name: file.name, sizeBytes: file.size, url: `/api/assets/${assetId}` };
        setUploaded(current => [...current, added]); setCheckpoint(null);
      }
    } catch (cause) {
      error(`No se pudo agregar «${name}». ${cause instanceof Error ? cause.message : "Intenta de nuevo."} Los archivos que ves listos se conservan.`);
    } finally {
      workingRef.current = null; setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }
  async function removeReady(file: SubmissionFile) {
    if (!canEdit || busy || workingRef.current) return;
    workingRef.current = "remove"; setRemovingId(file.id); setLocalError("");
    try {
      const response = await fetch(`/api/uploads/${file.id}`, { method: "DELETE" }).catch(() => null);
      if (!response || (!response.ok && response.status !== 404)) {
        error(`No se pudo quitar «${file.name}». Intenta de nuevo.`); return;
      }
      setRemoved(current => new Set(current).add(file.id)); setCheckpoint(null); focus("editor");
    } finally { workingRef.current = null; setRemovingId(null); }
  }
  function toggleKept(fileId: string, keep: boolean) {
    if (!canEdit || busy || workingRef.current) return;
    if (leftOut.has(fileId) === keep) setCheckpoint(null);
    setLeftOut(current => { const next = new Set(current); if (keep) next.delete(fileId); else next.add(fileId); return next; });
  }
  const editorHidden = !canEdit;
  const card = "min-w-0 rounded-xl border border-slate-200 bg-white p-[16px]";
  return <div className="min-w-0 space-y-4" onKeyDown={event => {
    if (event.key !== "Escape" || busy || workingRef.current) return;
    if (!finished && stage === 2 && canSubmit) { event.preventDefault(); edit("reviewButton"); }
  }}>
    {!finished && (canSubmit || pending || uncertain) && <SubmissionProgress active={stage}
      prepared={prepared} busy={busy || !canSubmit} onNavigate={navigate} />}
    {!finished && guideContext && stage === 1 && <section className={card} aria-labelledby={`${id}-instructions`}>
      <h2 id={`${id}-instructions`} className="text-lg font-bold text-slate-950">Lo que pide tu docente</h2>
      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800 [overflow-wrap:anywhere]">
        {guideContext.instructions || "Tu docente no escribió instrucciones para esta tarea."}
      </p>
    </section>}
    <section className={card} aria-label="Entrega de la tarea">
      {!finished && !showResult && !pending && savedSummary && <div className="mb-4 text-sm text-slate-700">
        {resubmitting && <p className="font-semibold text-slate-950">{canSubmit ? "Entrega anterior" : "Tu entrega guardada"}</p>}
        {savedSummary}
      </div>}
      {!canSubmit && !finished && !pending && <div ref={readOnlyRef} tabIndex={-1}>{readOnlyContent}
        {changed && <details className="mt-3">
          <summary className="min-h-11 cursor-pointer py-3 font-semibold focus-visible:!outline-[var(--navy)]">Borrador conservado en esta pantalla</summary>
          <SubmissionSummary snapshot={makeSnapshot()} />
        </details>}
      </div>}
      {finished && <SubmissionSuccess message={state.ok ? state.message : "Tu docente ya puede ver tu respuesta."}
        headingRef={resultRef} tasksHref={tasksHref} snapshot={confirmed} savedSummary={resubmitting ? savedSummary : undefined}
        restriction={!canSubmit ? readOnlyContent : undefined} onEdit={canSubmit ? startEditing : undefined} />}
      {uncertain && !finished && stage === 2 && <div ref={errorRef} tabIndex={-1} role="alert"
        className="min-w-0 space-y-3 rounded-lg bg-red-50 p-[12px] text-red-900 [overflow-wrap:anywhere]">
        <h3 className="text-lg font-bold">No pudimos confirmar la entrega</h3>
        <p className="text-sm">{state.message}</p>
        <p className="text-sm">Tu respuesta y tus archivos se conservan aquí. Puedes corregirlos y volver a intentarlo.
          Si la conexión falló, comprueba primero si la entrega se guardó.</p>
        {resubmitting && <p className="text-sm">Puede aparecer tu entrega anterior aunque este intento no se haya guardado.</p>}
        <div className="flex flex-wrap gap-2">
          {assignmentHref && <a href={assignmentHref} target="_blank" rel="noopener noreferrer"
            className={secondary}>Comprobar mi entrega<span className="sr-only"> en otra pestaña</span></a>}
          {canSubmit && <button type="button" className={primary} onClick={() => edit()}>Volver a mi respuesta</button>}
        </div>
      </div>}
      <form ref={formRef} action={action} className="min-w-0 space-y-4" onSubmit={event => {
        if (!canSubmit || finished || busy || workingRef.current || uncertain) { event.preventDefault(); return; }
        if (stage !== 2 || !review || !prepared) { event.preventDefault(); ask(); return; }
        workingRef.current = "submit"; setShowResult(false); focus("review");
      }}>
        <input type="hidden" name="assignmentId" value={assignmentId} />
        {(stage === 1 ? [...kept, ...ready] : review?.files ?? []).map(file =>
          <input key={file.id} type="hidden" name="assetIds" value={file.id} />)}
        <div hidden={editorHidden} className="min-w-0 space-y-4">
          <h3 ref={editorRef} tabIndex={-1} className="text-lg font-bold text-slate-950">{confirmed ? "Edita tu entrega" : "Prepara tu respuesta"}</h3>
          {confirmed && <p className="text-sm text-slate-700">Tu entrega anterior sigue guardada. Solo cambiará cuando confirmes «Actualizar entrega».</p>}
          <p className="text-sm text-slate-700">Sigue las indicaciones de tu docente. Puedes escribir, adjuntar archivos o agregar un enlace.
            Antes de enviar, podrás revisar todo.</p>
          <SubmissionEditor id={id} draft={draft} frozen={!canEdit || busy} currentFiles={currentFiles} leftOut={leftOut}
            ready={ready} total={total} uploading={uploading} removingId={removingId} inputRef={inputRef}
            onAdd={files => void addFiles(files)} onRemove={file => void removeReady(file)} onToggle={toggleKept}
            onDraft={(key, value) => {
              if (canEdit && !busy && !workingRef.current && draft[key] !== value) {
                setDraft(current => ({ ...current, [key]: value })); setCheckpoint(null);
              }
            }} />
          <button ref={reviewButtonRef} type="button" className={primary} onClick={() => ask()} disabled={busy}>Revisar respuesta</button>
          {confirmed && <button type="button" className={secondary} disabled={busy} onClick={() => {
            setEditing(false); setShowResult(false); setLocalError(""); focus("result");
          }}>Cancelar edición</button>}
        </div>
        {review && !finished && stage === 2 && !uncertain && (canSubmit || pending) && <SubmissionConfirmation
          snapshot={review} headingRef={reviewHeadingRef} pending={pending} reviewed={prepared}
          onEdit={() => edit()} onReview={() => ask()} />}
        {uploading && <p role="status" className="text-sm text-slate-800">Subiendo archivos… Espera antes de entregar.</p>}
        {removingId && <p role="status" className="text-sm text-slate-800">Quitando archivo. Espera antes de entregar.</p>}
        {localError && !(uncertain && stage === 2) && <div ref={errorRef} tabIndex={-1} role="alert"
          className="min-w-0 space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-900 [overflow-wrap:anywhere]">
          <p>{localError}</p>
        </div>}
      </form>
    </section>
  </div>;
}
