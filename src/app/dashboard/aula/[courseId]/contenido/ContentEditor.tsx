"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { contentItemAction, saveChapterAction, saveLessonAction, type ContentActionState } from "@/server/actions/course-content";

const primaryButton = "min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const secondaryButton = "min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60";
const smallButton = "min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-40";
const dangerButton = "min-h-11 rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const fieldClass = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-blue-500";
const empty: ContentActionState = { ok: false, message: "" };

const LESSON_TYPE_OPTIONS = [
  { value: "TEXT", label: "Texto" },
  { value: "VIDEO", label: "Video" },
  { value: "DOCUMENT", label: "Documento" },
  { value: "ACTIVITY", label: "Actividad" },
];
const typeLabel = (type: string) => LESSON_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? "Texto";

type LessonFile = { id: string; name: string; canRemove: boolean };
type LessonView = { id: string; title: string; summary: string; content: string; videoUrl: string; type: string; estimatedMinutes: number; isPublished: boolean; files: LessonFile[] };
type ChapterView = { id: string; title: string; description: string; isPublished: boolean; lessons: LessonView[] };
type ServerAction = (state: ContentActionState, formData: FormData) => Promise<ContentActionState>;

function Notice({ state }: { state: ContentActionState }) {
  if (!state.message) return null;
  return <p role={state.ok ? "status" : "alert"} className={`mt-3 rounded-lg p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p>;
}

function StatusBadge({ published }: { published: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${published ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
      {published ? "Publicado" : "Borrador"}
    </span>
  );
}

/** Envía un formulario a una acción del servidor sin vaciar los campos si algo falla. */
function useContentAction(action: ServerAction, onDone?: () => void) {
  const [state, setState] = useState<ContentActionState>(empty);
  const [pending, startTransition] = useTransition();
  function send(formData: FormData) {
    startTransition(async () => {
      const result = await action(empty, formData);
      setState(result);
      if (result.ok) onDone?.();
    });
  }
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    send(new FormData(event.currentTarget));
  }
  return { state, pending, send, onSubmit };
}

function ChapterForm({ courseId, chapter, onClose }: { courseId?: string; chapter?: ChapterView; onClose: () => void }) {
  const { state, pending, onSubmit } = useContentAction(saveChapterAction, onClose);
  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3 rounded-lg bg-slate-50 p-4 text-left">
      {chapter ? <input type="hidden" name="chapterId" value={chapter.id} /> : <input type="hidden" name="courseId" value={courseId} />}
      <label className="block text-sm font-medium text-slate-900">
        Título del capítulo
        <input name="title" defaultValue={chapter?.title} required minLength={3} maxLength={120} autoFocus placeholder="Por ejemplo: Unidad 1. Introducción" className={fieldClass} />
      </label>
      <label className="block text-sm font-medium text-slate-900">
        Descripción (opcional)
        <textarea name="description" defaultValue={chapter?.description} maxLength={500} rows={2} placeholder="De qué trata este capítulo" className={fieldClass} />
      </label>
      {!chapter && <p className="text-sm text-slate-600">Se guarda como borrador: los estudiantes no lo ven hasta que lo publiques.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButton} disabled={pending}>{pending ? "Guardando…" : chapter ? "Guardar cambios" : "Guardar capítulo"}</button>
        <button type="button" className={secondaryButton} disabled={pending} onClick={onClose}>Cancelar</button>
      </div>
      <Notice state={state} />
    </form>
  );
}

export function AddChapter({ courseId, label, primary = false }: { courseId: string; label: string; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className={`${primary ? primaryButton : secondaryButton} mt-4`} onClick={() => setOpen(true)}>{label}</button>;
  return <ChapterForm courseId={courseId} onClose={() => setOpen(false)} />;
}

function LessonForm({ chapterId, lesson, onClose }: { chapterId?: string; lesson?: LessonView; onClose: () => void }) {
  const { state, pending, onSubmit } = useContentAction(saveLessonAction, onClose);
  const [type, setType] = useState(lesson?.type ?? "TEXT");
  // Formato anterior: una lección de video guardaba solo el enlace en el contenido. Al editarla,
  // ese enlace pasa al campo del video y el contenido queda libre para el texto.
  const legacyLink = lesson?.type === "VIDEO" && !lesson.videoUrl && /^https?:\/\/\S+$/.test(lesson.content.trim()) ? lesson.content.trim() : "";
  const isVideo = type === "VIDEO";
  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3 rounded-lg bg-slate-50 p-4">
      {lesson ? <input type="hidden" name="lessonId" value={lesson.id} /> : <input type="hidden" name="chapterId" value={chapterId} />}
      <label className="block text-sm font-medium text-slate-900">
        Título de la lección
        <input name="title" defaultValue={lesson?.title} required minLength={3} maxLength={140} autoFocus className={fieldClass} />
      </label>
      <label className="block text-sm font-medium text-slate-900">
        Resumen (opcional)
        <input name="summary" defaultValue={lesson?.summary} maxLength={500} placeholder="Una frase sobre lo que se aprende" className={fieldClass} />
      </label>
      <label className="block text-sm font-medium text-slate-900">
        Tipo de lección
        <select name="type" value={type} onChange={(event) => setType(event.target.value)} className={fieldClass}>
          {LESSON_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium text-slate-900">
        {isVideo ? "Enlace del video" : "Video (opcional)"}
        <input
          name="videoUrl"
          type="text"
          inputMode="url"
          autoComplete="off"
          required={isVideo}
          maxLength={2000}
          defaultValue={lesson?.videoUrl || legacyLink}
          placeholder="https://www.youtube.com/watch?v=…"
          className={fieldClass}
        />
        <span className="mt-1 block text-sm font-normal text-slate-600">
          Copia el enlace desde YouTube, Vimeo, Google Drive o de un archivo .mp4 y pégalo aquí. Se mostrará arriba del texto.
        </span>
      </label>
      <label className="block text-sm font-medium text-slate-900">
        {isVideo ? "Texto debajo del video (opcional)" : "Contenido"}
        <textarea name="content" rows={isVideo ? 4 : 8} maxLength={50000} defaultValue={legacyLink ? "" : lesson?.content} placeholder={type === "ACTIVITY" ? "Explica qué debe hacer el estudiante" : "Escribe aquí la lección"} className={fieldClass} />
        {type === "DOCUMENT" && <span className="mt-1 block text-sm font-normal text-slate-600">Después de guardar podrás adjuntar el archivo desde «Archivos» en la lección.</span>}
      </label>
      <label className="block text-sm font-medium text-slate-900">
        Minutos estimados
        <input name="estimatedMinutes" type="number" inputMode="numeric" min={1} max={600} step={1} required defaultValue={lesson?.estimatedMinutes ?? 10} className={`${fieldClass} max-w-32`} />
      </label>
      {!lesson && <p className="text-sm text-slate-600">Se guarda como borrador: los estudiantes no la ven hasta que la publiques.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButton} disabled={pending}>{pending ? "Guardando…" : lesson ? "Guardar cambios" : "Guardar lección"}</button>
        <button type="button" className={secondaryButton} disabled={pending} onClick={onClose}>Cancelar</button>
      </div>
      <Notice state={state} />
    </form>
  );
}

/**
 * «Editar» siempre a la vista; Subir, Bajar, Publicar/Ocultar y Borrar (con confirmación que dice
 * el impacto) agrupados en «Más» para que en el celular no ocupen dos líneas por elemento.
 */
function ItemActions({ kind, id, name, isFirst, isLast, isPublished, onEdit, deleteImpact }: { kind: "chapter" | "lesson"; id: string; name: string; isFirst: boolean; isLast: boolean; isPublished: boolean; onEdit: () => void; deleteImpact: string }) {
  const [confirming, setConfirming] = useState(false);
  const { state, pending, send } = useContentAction(contentItemAction, () => setConfirming(false));
  const what = kind === "chapter" ? "capítulo" : "lección";
  function run(op: string) {
    const data = new FormData();
    data.set("kind", kind);
    data.set("id", id);
    data.set("op", op);
    send(data);
  }
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-start gap-2">
        <button type="button" className={smallButton} disabled={pending} onClick={onEdit} aria-label={`Editar ${what} ${name}`}>Editar</button>
        <details className="group">
          <summary
            className={`${smallButton} inline-flex cursor-pointer list-none items-center gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 [&::-webkit-details-marker]:hidden`}
            aria-label={`Más acciones ${kind === "chapter" ? "del capítulo" : "de la lección"} ${name}`}
          >
            Más <span aria-hidden="true" className="transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={smallButton} disabled={pending || isFirst} onClick={() => run("up")} aria-label={`Subir ${what} ${name}`}>Subir</button>
            <button type="button" className={smallButton} disabled={pending || isLast} onClick={() => run("down")} aria-label={`Bajar ${what} ${name}`}>Bajar</button>
            <button type="button" className={smallButton} disabled={pending} onClick={() => run(isPublished ? "hide" : "publish")} aria-label={`${isPublished ? "Ocultar" : "Publicar"} ${what} ${name}`}>{isPublished ? "Ocultar" : "Publicar"}</button>
            <button type="button" className={`${smallButton} text-red-700`} disabled={pending || confirming} onClick={() => setConfirming(true)} aria-label={`Borrar ${what} ${name}`}>Borrar</button>
          </div>
        </details>
      </div>
      {confirming && (
        <div className="mt-3 rounded-lg bg-red-50 p-4 text-sm text-red-900" role="alertdialog" aria-label={`Confirmar borrar ${what}`}>
          <p className="font-semibold">¿Borrar {kind === "chapter" ? "el capítulo" : "la lección"} «{name}»?</p>
          <p className="mt-1">{deleteImpact} No se puede deshacer.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={dangerButton} disabled={pending} onClick={() => run("delete")}>{pending ? "Borrando…" : `Sí, borrar ${what}`}</button>
            <button type="button" className={secondaryButton} disabled={pending} onClick={() => setConfirming(false)}>Cancelar</button>
          </div>
        </div>
      )}
      <Notice state={state} />
    </div>
  );
}

/** Archivos de la lección: usa la misma carga privada de `/api/assets` que ya tenía el curso. */
function LessonFiles({ courseId, lessonId, files }: { courseId: string; lessonId: string; files: LessonFile[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<ContentActionState>(empty);
  const [busy, setBusy] = useState(false);

  async function upload() {
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setMessage({ ok: false, message: "Elige primero un archivo." });
      return;
    }
    setBusy(true);
    setMessage(empty);
    let assetId: string | undefined;
    try {
      const kind = file.type.startsWith("video/") ? "VIDEO" : "DOCUMENT";
      const prepared = await fetch("/api/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, type: file.type, size: file.size, kind, courseId, lessonId }) });
      const intent = (await prepared.json()) as { error?: string; assetId?: string; uploadUrl?: string };
      if (!prepared.ok || !intent.assetId || !intent.uploadUrl) throw new Error(intent.error ?? "No se pudo preparar la subida.");
      assetId = intent.assetId;
      const body = new FormData();
      body.append("cacheControl", "3600");
      body.append("", file);
      const uploaded = await fetch(intent.uploadUrl, { method: "PUT", headers: { "x-upsert": "false" }, body });
      if (!uploaded.ok) throw new Error("El archivo no se pudo subir. Revisa tu conexión e intenta de nuevo.");
      const confirmed = await fetch(`/api/assets/${assetId}`, { method: "PATCH" });
      if (!confirmed.ok) throw new Error(((await confirmed.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudo confirmar la subida.");
      if (inputRef.current) inputRef.current.value = "";
      setMessage({ ok: true, message: "Archivo adjuntado." });
      router.refresh();
    } catch (error) {
      if (assetId) await fetch(`/api/assets/${assetId}`, { method: "DELETE" }).catch(() => undefined);
      setMessage({ ok: false, message: error instanceof Error ? error.message : "No se pudo subir el archivo. Intenta de nuevo." });
    } finally {
      setBusy(false);
    }
  }

  async function remove(file: LessonFile) {
    if (!window.confirm(`¿Quitar el archivo «${file.name}»? Los estudiantes ya no podrán abrirlo. No se puede deshacer.`)) return;
    setBusy(true);
    setMessage(empty);
    try {
      const response = await fetch(`/api/assets/${file.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      setMessage({ ok: true, message: "Archivo quitado." });
      router.refresh();
    } catch {
      setMessage({ ok: false, message: "No se pudo quitar el archivo. Intenta de nuevo." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mt-3 rounded-lg border border-slate-200 bg-white">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold text-slate-800">Archivos ({files.length})</summary>
      <div className="border-t border-slate-200 p-3">
        {files.length > 0 && (
          <ul className="mb-3 divide-y divide-slate-100">
            {files.map((file) => (
              <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                <a className="inline-flex min-h-11 min-w-0 items-center break-all text-sm font-medium text-blue-700 underline" href={`/api/assets/${file.id}`}>{file.name}</a>
                {file.canRemove && <button type="button" className={`${smallButton} text-red-700`} disabled={busy} onClick={() => remove(file)} aria-label={`Quitar archivo ${file.name}`}>Quitar</button>}
              </li>
            ))}
          </ul>
        )}
        <label className="block text-sm font-medium text-slate-900">
          Adjuntar un archivo
          <input ref={inputRef} type="file" accept=".pdf,.docx,.pptx,.txt,video/mp4,video/webm" disabled={busy} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm" />
        </label>
        <p className="mt-1 text-sm text-slate-600">PDF, Word, PowerPoint o texto hasta 20 MB; video MP4 o WebM hasta 100 MB.</p>
        <button type="button" className={`${secondaryButton} mt-2`} disabled={busy} onClick={upload}>{busy ? "Subiendo…" : "Subir archivo"}</button>
        <Notice state={message} />
      </div>
    </details>
  );
}

function LessonRow({ courseId, lesson, number, isFirst, isLast, chapterPublished }: { courseId: string; lesson: LessonView; number: string; isFirst: boolean; isLast: boolean; chapterPublished: boolean }) {
  const [editing, setEditing] = useState(false);
  return (
    <li className="rounded-lg bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words font-semibold text-slate-950">{number} {lesson.title}</p>
          <p className="text-sm text-slate-600">{typeLabel(lesson.type)}{lesson.videoUrl && lesson.type !== "VIDEO" ? " con video" : ""} · {lesson.estimatedMinutes} min</p>
          {lesson.summary && <p className="mt-1 break-words text-sm text-slate-700">{lesson.summary}</p>}
        </div>
        <StatusBadge published={lesson.isPublished} />
      </div>
      {lesson.isPublished && !chapterPublished && <p className="mt-2 text-sm text-amber-800">Los estudiantes aún no la ven porque el capítulo está en borrador.</p>}
      {editing ? (
        <LessonForm lesson={lesson} onClose={() => setEditing(false)} />
      ) : (
        <ItemActions
          kind="lesson"
          id={lesson.id}
          name={lesson.title}
          isFirst={isFirst}
          isLast={isLast}
          isPublished={lesson.isPublished}
          onEdit={() => setEditing(true)}
          deleteImpact={`Se borra también el avance que los estudiantes registraron en ella${lesson.files.length ? ` y sus ${lesson.files.length === 1 ? "archivo adjunto deja" : "archivos adjuntos dejan"} de verse en el curso` : ""}.`}
        />
      )}
      <LessonFiles courseId={courseId} lessonId={lesson.id} files={lesson.files} />
    </li>
  );
}

export function ChapterCard({ courseId, chapter, number, isFirst, isLast }: { courseId: string; chapter: ChapterView; number: number; isFirst: boolean; isLast: boolean }) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const count = chapter.lessons.length;
  const deleteImpact = count === 0
    ? "Este capítulo no tiene lecciones."
    : `Contiene ${count} ${count === 1 ? "lección, que se borra" : "lecciones, que se borran"} con él junto con el avance que los estudiantes registraron en ${count === 1 ? "ella" : "ellas"}.`;
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-blue-700">Capítulo {number}</p>
          <h2 className="break-words text-lg font-bold text-slate-950">{chapter.title}</h2>
          {chapter.description && <p className="mt-1 break-words text-sm text-slate-600">{chapter.description}</p>}
        </div>
        <StatusBadge published={chapter.isPublished} />
      </div>
      {editing ? (
        <ChapterForm chapter={chapter} onClose={() => setEditing(false)} />
      ) : (
        <ItemActions kind="chapter" id={chapter.id} name={chapter.title} isFirst={isFirst} isLast={isLast} isPublished={chapter.isPublished} onEdit={() => setEditing(true)} deleteImpact={deleteImpact} />
      )}

      {count === 0 ? (
        <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Este capítulo aún no tiene lecciones.</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {chapter.lessons.map((lesson, index) => (
            <LessonRow key={lesson.id} courseId={courseId} lesson={lesson} number={`${number}.${index + 1}`} isFirst={index === 0} isLast={index === count - 1} chapterPublished={chapter.isPublished} />
          ))}
        </ol>
      )}
      {adding ? <LessonForm chapterId={chapter.id} onClose={() => setAdding(false)} /> : <button type="button" className={`${secondaryButton} mt-4`} onClick={() => setAdding(true)}>Agregar lección</button>}
    </li>
  );
}
