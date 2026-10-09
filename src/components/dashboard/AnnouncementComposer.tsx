"use client";

import Image from "next/image";
import { useActionState, useRef, useState } from "react";
import { Bold, Heading2, ImagePlus, Italic, Link2, List, ListOrdered, MessageSquareQuote, Video } from "lucide-react";
import { createAnnouncement, type ActionState } from "@/app/dashboard/actions";
import { AnnouncementContent } from "@/components/dashboard/AnnouncementContent";
import { approximateRecipients, audienceText, hasAudience, simpleAudienceFields, SIMPLE_AUDIENCE_OPTIONS, type AudienceFields, type SimpleAudience } from "@/lib/announcement-compose";

type Option = { id: string; name: string; detail?: string; role?: string };
type Props = { courses: Option[]; people: Option[]; units: Option[]; canTargetPeople: boolean };
type UploadedAsset = { id: string; url: string; name: string; type: string };
type Review = { audience: string; recipients: number | null };

const initialState: ActionState = { ok: false, message: "" };
const input = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:text-sm";
const toolbarButton = "flex h-11 w-11 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500";
const primaryButton = "min-h-11 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton = "min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50";
const roleOptions: Option[] = [
  { id: "STUDENT", name: "Estudiantes" },
  { id: "PARENT", name: "Tutores" },
  { id: "TEACHER", name: "Docentes" },
  { id: "COORDINATOR", name: "Coordinación" },
  { id: "ADMIN", name: "Administración" },
];
const nameMap = (options: Option[]) => new Map(options.map((option) => [option.id, option.name]));

export function AnnouncementComposer({ courses, people, units, canTargetPeople }: Props) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [choice, setChoice] = useState<SimpleAudience>("institution");
  const [courseId, setCourseId] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [pinned, setPinned] = useState(false);
  const [assets, setAssets] = useState<UploadedAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [formKey, setFormKey] = useState(0);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (previous: ActionState, data: FormData) => {
    const result = await createAnnouncement(previous, data);
    if (result.ok) {
      setTitle("");
      setContent("");
      setChoice("institution");
      setCourseId("");
      setExternalUrl("");
      setPinned(false);
      setAssets([]);
      setMentionIds([]);
      setReview(null);
      setFormKey((current) => current + 1);
    }
    return result;
  }, initialState);
  const simpleFields = simpleAudienceFields(choice, courseId);

  function format(prefix: string, suffix = prefix, placeholder = "texto") {
    const element = textarea.current;
    if (!element) return;
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const selected = content.slice(start, end) || placeholder;
    const next = `${content.slice(0, start)}${prefix}${selected}${suffix}${content.slice(end)}`;
    setContent(next);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  }

  function prefixLines(prefix: string) {
    const element = textarea.current;
    if (!element) return;
    const start = content.lastIndexOf("\n", element.selectionStart - 1) + 1;
    const endBreak = content.indexOf("\n", element.selectionEnd);
    const end = endBreak === -1 ? content.length : endBreak;
    const selected = content.slice(start, end) || "Elemento";
    setContent(`${content.slice(0, start)}${selected.split("\n").map((line) => `${prefix}${line}`).join("\n")}${content.slice(end)}`);
  }

  function addMention(userId: string) {
    const person = people.find((item) => item.id === userId);
    if (!person || mentionIds.includes(userId)) return;
    setMentionIds((current) => [...current, userId]);
    const token = `@[${person.name}](user:${person.id})`;
    const element = textarea.current;
    const at = element?.selectionStart ?? content.length;
    setContent(`${content.slice(0, at)}${token}${content.slice(at)}`);
  }

  async function upload(file: File) {
    setUploading(true);
    setUploadError("");
    let assetId = "";
    try {
      const prepared = await fetch("/api/announcement-assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
      });
      const intent = await prepared.json();
      if (!prepared.ok || !intent.assetId || !intent.uploadUrl) throw new Error(intent.error ?? "No se pudo preparar la carga.");
      assetId = intent.assetId;
      const uploaded = await fetch(intent.uploadUrl, { method: "PUT", headers: { "content-type": file.type, "x-upsert": "false" }, body: file });
      if (!uploaded.ok) throw new Error("No se pudo transferir el archivo.");
      const confirmed = await fetch(`/api/assets/${assetId}`, { method: "PATCH" });
      const confirmation = await confirmed.json();
      if (!confirmed.ok) throw new Error(confirmation.error ?? "No se pudo confirmar la carga.");
      setAssets((current) => [...current, { id: assetId, url: confirmation.retrievalUrl, name: file.name, type: file.type }]);
      setReview(null);
    } catch (error) {
      if (assetId) await fetch(`/api/assets/${assetId}`, { method: "DELETE" }).catch(() => undefined);
      setUploadError(error instanceof Error ? error.message : "No se pudo cargar el archivo.");
    } finally {
      setUploading(false);
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) await upload(file);
  }

  async function removeAsset(assetId: string) {
    const response = await fetch(`/api/assets/${assetId}`, { method: "DELETE" });
    if (!response.ok) {
      setUploadError("No se pudo retirar el archivo. Intenta nuevamente.");
      return;
    }
    setAssets((current) => current.filter((asset) => asset.id !== assetId));
    setReview(null);
  }

  function prepareReview() {
    const element = form.current;
    if (!element?.reportValidity()) return;
    const data = new FormData(element);
    const list = (name: string) => [...new Set(data.getAll(name).map(String).filter(Boolean))];
    const fields: AudienceFields = {
      audienceInstitution: data.get("audienceInstitution") === "true",
      roleIds: list("roleIds"),
      courseTargetIds: list("courseTargetIds"),
      userTargetIds: list("userTargetIds"),
      unitTargetIds: list("unitTargetIds"),
    };
    if (!hasAudience(fields)) {
      setReviewError(choice === "course" ? "Elige el curso que recibirá el aviso." : "Elige al menos un grupo, curso o persona que reciba el aviso.");
      return;
    }
    setReviewError("");
    setReview({
      audience: audienceText(fields, { courses: nameMap(courses), people: nameMap(people), units: nameMap(units) }),
      recipients: approximateRecipients(fields, people),
    });
  }

  const extras = [
    assets.length ? `${assets.length} ${assets.length === 1 ? "archivo adjunto" : "archivos adjuntos"}` : "",
    externalUrl.trim() ? `Enlace: ${externalUrl.trim()}` : "",
    mentionIds.length ? `${mentionIds.length} ${mentionIds.length === 1 ? "persona mencionada" : "personas mencionadas"}` : "",
    pinned ? "Quedará fijado arriba de la lista" : "",
  ].filter(Boolean);

  return <form action={action} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" ref={form}>
    <div className={review ? "hidden" : "space-y-6 p-4 sm:p-6"} key={formKey}>
      {state.ok && <p className="rounded-lg bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-800" role="status">Aviso publicado. Ya aparece en la lista de abajo.</p>}
      <div>
        <label className="mb-1 block text-sm font-semibold" htmlFor="announcement-title">Título</label>
        <input className={input} id="announcement-title" maxLength={140} minLength={4} name="title" onChange={(event) => setTitle(event.target.value)} placeholder="Ej. Reunión de familias el viernes" required value={title} />
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold" htmlFor="announcement-content">Mensaje</label>
        <textarea className={`${input} min-h-40 leading-relaxed`} id="announcement-content" maxLength={20000} minLength={10} name="content" onChange={(event) => setContent(event.target.value)} placeholder="Escribe aquí lo que quieres comunicar." ref={textarea} required rows={6} value={content} />
        <div aria-label="Dar formato al texto (opcional)" className="mt-2 flex flex-wrap gap-1" role="toolbar">
          <ToolButton label="Subtítulo" onClick={() => prefixLines("## ")}><Heading2 size={17} /></ToolButton>
          <ToolButton label="Negrita" onClick={() => format("**")}><Bold size={17} /></ToolButton>
          <ToolButton label="Cursiva" onClick={() => format("_")}><Italic size={17} /></ToolButton>
          <ToolButton label="Lista" onClick={() => prefixLines("- ")}><List size={17} /></ToolButton>
          <ToolButton label="Lista numerada" onClick={() => prefixLines("1. ")}><ListOrdered size={17} /></ToolButton>
          <ToolButton label="Cita" onClick={() => prefixLines("> ")}><MessageSquareQuote size={17} /></ToolButton>
          <ToolButton label="Enlace dentro del texto" onClick={() => format("[", "](https://)", "texto del enlace")}><Link2 size={17} /></ToolButton>
        </div>
        <p className="mt-1 text-xs text-slate-500">Mínimo 10 letras. Verás cómo queda antes de publicar.</p>
      </div>

      <div aria-labelledby="announcement-audience-title" role="radiogroup">
        <p className="mb-2 text-sm font-semibold" id="announcement-audience-title">¿Quién lo recibe?</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {SIMPLE_AUDIENCE_OPTIONS.map((option) => <label className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 text-sm ${choice === option.id ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"}`} key={option.id}>
            <input checked={choice === option.id} className="h-5 w-5 shrink-0" name="audienceChoice" onChange={() => { setChoice(option.id); setReviewError(""); }} type="radio" value={option.id} />
            <span><span className="block font-semibold text-slate-900">{option.label}</span><span className="block text-xs text-slate-500">{option.hint}</span></span>
          </label>)}
        </div>

        {choice === "course" && <div className="mt-3">
          <label className="mb-1 block text-sm font-semibold" htmlFor="announcement-course">¿Cuál curso?</label>
          {courses.length ? <select className={input} id="announcement-course" onChange={(event) => { setCourseId(event.target.value); setReviewError(""); }} value={courseId}>
            <option value="">Elige un curso…</option>
            {courses.map((course) => <option key={course.id} value={course.id}>{course.name}{course.detail ? ` · ${course.detail}` : ""}</option>)}
          </select> : <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Todavía no hay cursos. Elige otra opción o crea primero un curso.</p>}
        </div>}

        {choice === "detailed" && <div className="mt-3 space-y-3">
          <p className="text-sm text-slate-600">Marca todo lo que necesites. El aviso llega a quien esté en cualquiera de estos grupos.</p>
          <div className="grid gap-4 lg:grid-cols-2">
            <GuidedPicker label="Grupos de personas" name="roleIds" options={roleOptions} placeholder="Buscar grupo…" />
            <GuidedPicker label="Cursos que lo reciben" name="courseTargetIds" options={courses} placeholder="Buscar curso…" empty="Todavía no hay cursos." />
            {canTargetPeople ? <GuidedPicker label="Personas específicas" name="userTargetIds" options={people} placeholder="Buscar persona…" /> : <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Para elegir o mencionar personas una por una necesitas el permiso «Ver personas». Puedes elegir grupos, cursos o departamentos.</div>}
            <GuidedPicker label="Departamentos" name="unitTargetIds" options={units} placeholder="Buscar departamento…" empty="Todavía no hay departamentos creados." />
          </div>
        </div>}

        {simpleFields && <>
          {simpleFields.audienceInstitution && <input name="audienceInstitution" type="hidden" value="true" />}
          {simpleFields.roleIds.map((role) => <input key={role} name="roleIds" type="hidden" value={role} />)}
          {simpleFields.courseTargetIds.map((id) => <input key={id} name="courseTargetIds" type="hidden" value={id} />)}
        </>}
      </div>

      <details className="rounded-xl border border-slate-200">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold text-slate-700">Opciones avanzadas</summary>
        <div className="space-y-5 border-t border-slate-200 p-4">
          <p className="text-sm text-slate-500">Nada de esto es obligatorio: enlace, fotos o videos, cursos relacionados, menciones y fijar el aviso.</p>
          <div>
            <label className="mb-1 block text-sm font-semibold" htmlFor="announcement-url">Botón o enlace destacado</label>
            <input className={input} id="announcement-url" inputMode="url" maxLength={2048} name="externalUrl" onBlur={() => { const value = externalUrl.trim(); if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) setExternalUrl(`mailto:${value}`); }} onChange={(event) => setExternalUrl(event.target.value)} placeholder="https://sitio.example o correo@institucion.edu" type="text" value={externalUrl} />
            <p className="mt-1 text-xs text-slate-500">Aparece debajo del mensaje como un botón. Puede ser una página web o un correo.</p>
          </div>

          <fieldset className="rounded-xl border border-slate-200 p-4"><legend className="px-1 text-sm font-bold">Fotos y videos</legend>
            <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center transition hover:border-blue-400 hover:bg-blue-50" onDragOver={(event) => event.preventDefault()} onDrop={async (event) => { event.preventDefault(); await uploadFiles(event.dataTransfer.files); }}>
              <span className="flex flex-wrap items-center justify-center gap-2 font-semibold text-slate-800"><ImagePlus size={18} /><Video size={18} />{uploading ? "Subiendo archivos…" : "Toca para elegir archivos o arrástralos aquí"}</span>
              <span className="mt-1 text-xs text-slate-500">Imágenes hasta 10 MB; videos MP4/WebM hasta 100 MB.</span>
              <input accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" className="sr-only" disabled={uploading} multiple onChange={async (event) => { const input = event.currentTarget; await uploadFiles(input.files ?? []); input.value = ""; }} type="file" />
            </label>
            {uploadError && <p className="mt-2 text-sm text-red-700" role="alert">{uploadError}</p>}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">{assets.map((asset) => <div className="overflow-hidden rounded-lg border border-slate-200 bg-white" key={asset.id}>{asset.type.startsWith("image/") ? <Image alt={asset.name} className="h-36 w-full object-cover" height={288} src={asset.url} unoptimized width={512} /> : <video aria-label={asset.name} className="h-36 w-full bg-black object-contain" controls preload="metadata" src={asset.url} />}<div className="flex items-center justify-between gap-2 px-2"><p className="truncate text-xs">{asset.name}</p><button className="min-h-11 px-2 text-sm font-semibold text-red-700 hover:underline" onClick={() => void removeAsset(asset.id)} type="button">Retirar</button></div><input name="assetIds" type="hidden" value={asset.id} /></div>)}</div>
          </fieldset>

          <GuidedPicker label="Cursos relacionados" name="relatedCourseIds" options={courses} placeholder="Buscar curso relacionado…" empty="Todavía no hay cursos." />

          {canTargetPeople && <div>
            <label className="mb-1 block text-sm font-semibold" htmlFor="announcement-mention">Insertar una mención en el mensaje</label>
            <select className={input} defaultValue="" id="announcement-mention" onChange={(event) => { addMention(event.target.value); event.currentTarget.value = ""; }}><option value="">Elegir persona…</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}{person.detail ? ` · ${person.detail}` : ""}</option>)}</select>
            <p className="mt-1 text-xs text-slate-500">Su nombre se inserta donde dejaste el cursor. La persona debe estar entre quienes reciben el aviso.</p>
          </div>}

          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium"><input checked={pinned} className="h-5 w-5" name="isPinned" onChange={(event) => setPinned(event.target.checked)} type="checkbox" /> Fijar este aviso arriba de la lista</label>
        </div>
      </details>
      {mentionIds.map((id) => <input key={id} name="mentionIds" type="hidden" value={id} />)}

      <div className="flex flex-col gap-2">
        {reviewError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{reviewError}</p>}
        <button className={`${primaryButton} w-full sm:w-auto sm:self-end`} disabled={uploading} onClick={prepareReview} type="button">{uploading ? "Subiendo archivos…" : "Revisar y publicar"}</button>
      </div>
    </div>

    {review && <section aria-labelledby="announcement-review-title" className="space-y-4 p-4 sm:p-6">
      <h2 className="text-lg font-bold text-slate-950" id="announcement-review-title">Revisa antes de publicar</h2>
      <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <p>Vas a publicar este aviso para: <strong>{review.audience}</strong>.</p>
        {review.recipients !== null && <p className="mt-1">Son aproximadamente {review.recipients.toLocaleString("es")} {review.recipients === 1 ? "persona" : "personas"}.</p>}
        <p className="mt-1 text-blue-800">Lo verán en cuanto lo publiques. Después podrás corregirlo o borrarlo.</p>
      </div>
      <div className="rounded-xl border border-slate-200 p-4">
        <p className="mb-2 break-words text-lg font-bold text-slate-950">{title}</p>
        <AnnouncementContent content={content} mentionIds={new Set(mentionIds)} />
      </div>
      {extras.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">{extras.map((extra) => <li className="break-all" key={extra}>{extra}</li>)}</ul>}
      {state.message && !state.ok && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{state.message}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button className={secondaryButton} disabled={pending} onClick={() => setReview(null)} type="button">Seguir editando</button>
        <button className={primaryButton} disabled={pending || uploading} type="submit">{pending ? "Publicando…" : "Publicar aviso"}</button>
      </div>
    </section>}
  </form>;
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button aria-label={label} className={toolbarButton} onClick={onClick} title={label} type="button">{children}</button>;
}

function GuidedPicker({ label, name, options, placeholder, empty = "No hay opciones disponibles." }: { label: string; name: string; options: Option[]; placeholder: string; empty?: string }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const normalized = query.trim().toLocaleLowerCase("es");
  const visible = options.filter((option) => !normalized || `${option.name} ${option.detail ?? ""}`.toLocaleLowerCase("es").includes(normalized)).slice(0, 40);
  const selectedOptions = selected.map((id) => options.find((option) => option.id === id)).filter((option): option is Option => Boolean(option));

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  return <fieldset className="rounded-xl border border-slate-200 p-3"><legend className="px-1 text-sm font-semibold">{label}</legend>
    {selectedOptions.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5" aria-label={`${label} seleccionados`}>{selectedOptions.map((option) => <button className="min-h-11 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100" key={option.id} onClick={() => toggle(option.id)} type="button">{option.name} <span aria-hidden="true">×</span><span className="sr-only">, retirar</span></button>)}</div>}
    <label className="sr-only" htmlFor={`announcement-${name}-search`}>Buscar en {label}</label><input className={`${input} mb-2`} id={`announcement-${name}-search`} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} type="search" value={query} />
    {options.length ? <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">{visible.map((option) => <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-white" key={option.id}><input checked={selected.includes(option.id)} className="h-5 w-5 shrink-0" onChange={() => toggle(option.id)} type="checkbox" /><span><span className="block font-medium text-slate-800">{option.name}</span>{option.detail && <span className="block text-xs text-slate-500">{option.detail}</span>}</span></label>)}{visible.length === 0 && <p className="p-2 text-sm text-slate-500">Sin coincidencias.</p>}</div> : <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">{empty}</p>}
    {options.length > 40 && !query && <p className="mt-1 text-xs text-slate-400">Mostrando 40 opciones. Usa la búsqueda para encontrar más.</p>}
    {selected.map((id) => <input key={id} name={name} type="hidden" value={id} />)}
  </fieldset>;
}
