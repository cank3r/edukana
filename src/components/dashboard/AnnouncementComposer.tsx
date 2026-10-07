"use client";

import Image from "next/image";
import { useActionState, useRef, useState } from "react";
import { Bold, Heading2, ImagePlus, Italic, Link2, List, ListOrdered, MessageSquareQuote, Video } from "lucide-react";
import { createAnnouncement, type ActionState } from "@/app/dashboard/actions";
import { AnnouncementContent } from "@/components/dashboard/AnnouncementContent";

type Option = { id: string; name: string; detail?: string };
type Props = { courses: Option[]; people: Option[]; units: Option[]; canTargetPeople: boolean };
type UploadedAsset = { id: string; url: string; name: string; type: string };
type ReviewSummary = { audience: string; assets: number; mentions: number; link: string | null; pinned: boolean };

const initialState: ActionState = { ok: false, message: "" };
const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const toolbarButton = "rounded-md border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500";
const roleOptions: Option[] = [
  { id: "STUDENT", name: "Estudiantes" },
  { id: "PARENT", name: "Tutores" },
  { id: "TEACHER", name: "Docentes" },
  { id: "COORDINATOR", name: "Coordinación" },
  { id: "ADMIN", name: "Administración" },
];

export function AnnouncementComposer({ courses, people, units, canTargetPeople }: Props) {
  const [state, action, pending] = useActionState(createAnnouncement, initialState);
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState(false);
  const [assets, setAssets] = useState<UploadedAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary | null>(null);
  const [reviewError, setReviewError] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);

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
      setReviewSummary(null);
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
    setReviewSummary(null);
  }

  function prepareReview() {
    const element = form.current;
    if (!element?.reportValidity()) return;
    const data = new FormData(element);
    const audienceParts: string[] = [];
    if (data.get("audienceInstitution") === "true") audienceParts.push("Toda la institución");
    const counts = [
      ["roleIds", "rol", "roles"],
      ["courseTargetIds", "curso", "cursos"],
      ["userTargetIds", "persona", "personas"],
      ["unitTargetIds", "departamento", "departamentos"],
    ] as const;
    for (const [name, singular, plural] of counts) {
      const count = data.getAll(name).length;
      if (count) audienceParts.push(`${count} ${count === 1 ? singular : plural}`);
    }
    if (!audienceParts.length) {
      setReviewError("Selecciona al menos un destinatario antes de revisar.");
      return;
    }
    setReviewError("");
    setReviewSummary({
      audience: audienceParts.join(" · "),
      assets: assets.length,
      mentions: mentionIds.length,
      link: String(data.get("externalUrl") ?? "").trim() || null,
      pinned: data.get("isPinned") === "on",
    });
  }

  return <form action={action} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" onChange={() => setReviewSummary(null)} ref={form}>
    <header className="border-b border-slate-200 bg-slate-50 px-4 py-5 sm:px-6">
      <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Publicación guiada</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600" aria-label="Pasos del compositor">
        <StepBadge number="1" label="Contenido" />
        <span aria-hidden="true" className="text-slate-300">→</span>
        <StepBadge number="2" label="Audiencia" />
        <span aria-hidden="true" className="text-slate-300">→</span>
        <StepBadge number="3" label="Enlaces y archivos" />
      </div>
    </header>

    <div className="space-y-6 p-4 sm:p-6">
      <Section step="1" title="Contenido" description="Escribe el anuncio y revisa cómo lo verá la comunidad.">
        <div><label className="mb-1 block text-sm font-semibold" htmlFor="announcement-title">Título</label><input className={input} id="announcement-title" name="title" placeholder="Ej. Reunión de familias — octubre" required maxLength={140} /></div>
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <label className="text-sm font-semibold" htmlFor="announcement-content">Mensaje</label>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 text-xs font-semibold" aria-label="Modo del comunicado">
              <button className={`rounded-md px-3 py-1.5 ${!preview ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`} onClick={() => setPreview(false)} type="button">Editar</button>
              <button className={`rounded-md px-3 py-1.5 ${preview ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`} onClick={() => setPreview(true)} type="button">Vista previa</button>
            </div>
          </div>
          {!preview && <>
            <div aria-label="Formato del comunicado" className="mb-2 flex flex-wrap gap-1" role="toolbar">
              <ToolButton label="Título" onClick={() => prefixLines("## ")}><Heading2 size={17} /></ToolButton>
              <ToolButton label="Negrita" onClick={() => format("**")}><Bold size={17} /></ToolButton>
              <ToolButton label="Cursiva" onClick={() => format("_")}><Italic size={17} /></ToolButton>
              <ToolButton label="Lista" onClick={() => prefixLines("- ")}><List size={17} /></ToolButton>
              <ToolButton label="Lista numerada" onClick={() => prefixLines("1. ")}><ListOrdered size={17} /></ToolButton>
              <ToolButton label="Cita" onClick={() => prefixLines("> ")}><MessageSquareQuote size={17} /></ToolButton>
              <ToolButton label="Enlace" onClick={() => format("[", "](https://)", "texto del enlace")}><Link2 size={17} /></ToolButton>
            </div>
            <textarea className={`${input} min-h-48 font-mono leading-relaxed`} id="announcement-content" maxLength={20000} minLength={10} name="content" onChange={(event) => setContent(event.target.value)} ref={textarea} required rows={9} value={content} />
            <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-slate-500"><span>Puedes aplicar formato y añadir enlaces web o direcciones de correo; el contenido siempre se muestra de forma segura.</span><span>{content.length.toLocaleString("es")}/20,000</span></div>
          </>}
          {preview && <div aria-label="Vista previa del comunicado" className="min-h-48 rounded-lg border border-slate-200 bg-slate-50 p-4"><AnnouncementContent content={content || "La vista previa aparecerá aquí."} mentionIds={new Set(mentionIds)} /></div>}
        </div>
      </Section>

      <Section step="2" title="Audiencia" description="Combina institución, roles, cursos, personas o departamentos.">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm">
          <input className="mt-0.5 h-4 w-4" name="audienceInstitution" type="checkbox" value="true" />
          <span><strong className="block text-blue-950">Toda la institución actual</strong><span className="text-blue-700">Incluye a todas las personas activas de esta institución.</span></span>
        </label>
        <div className="grid gap-4 lg:grid-cols-2">
          <GuidedPicker label="Roles" name="roleIds" options={roleOptions} placeholder="Buscar rol…" />
          <GuidedPicker label="Cursos destinatarios" name="courseTargetIds" options={courses} placeholder="Buscar curso…" />
          {canTargetPeople ? <GuidedPicker label="Personas específicas" name="userTargetIds" options={people} placeholder="Buscar persona…" /> : <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Las personas y menciones requieren el permiso “Ver personas”. Aún puedes segmentar por institución, rol, curso o unidad.</div>}
          <GuidedPicker label="Departamentos o unidades" name="unitTargetIds" options={units} placeholder="Buscar departamento…" empty="No hay unidades configuradas." />
        </div>
        {canTargetPeople && <div><label className="mb-1 block text-sm font-semibold" htmlFor="announcement-mention">Insertar una mención en el mensaje</label><select className={input} defaultValue="" id="announcement-mention" onChange={(event) => { addMention(event.target.value); event.currentTarget.value = ""; }}><option value="">Seleccionar persona de la audiencia…</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}{person.detail ? ` · ${person.detail}` : ""}</option>)}</select><p className="mt-1 text-xs text-slate-500">Se insertará en el punto donde dejaste el cursor. La persona debe formar parte de la audiencia elegida.</p>{mentionIds.map((id) => <input key={id} name="mentionIds" type="hidden" value={id} />)}</div>}
      </Section>

      <Section step="3" title="Enlaces y archivos" description="Añade contexto visual y accesos relacionados sin hacer públicos los archivos.">
        <div className="grid gap-4 lg:grid-cols-2">
          <div><label className="mb-1 block text-sm font-semibold" htmlFor="announcement-url">Botón o enlace destacado</label><input className={input} id="announcement-url" inputMode="url" maxLength={2048} name="externalUrl" onBlur={(event) => { const value = event.currentTarget.value.trim(); if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) event.currentTarget.value = `mailto:${value}`; }} placeholder="https://sitio.example o correo@institucion.edu" type="text" /><p className="mt-1 text-xs text-slate-500">Aparecerá debajo del mensaje como una acción separada. Puedes usar una página web segura o una dirección de correo.</p></div>
          <GuidedPicker label="Cursos relacionados" name="relatedCourseIds" options={courses} placeholder="Buscar curso relacionado…" />
        </div>

        <fieldset className="rounded-xl border border-slate-200 p-4"><legend className="px-1 text-sm font-bold">Fotos y videos</legend>
          <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center transition hover:border-blue-400 hover:bg-blue-50" onDragOver={(event) => event.preventDefault()} onDrop={async (event) => { event.preventDefault(); await uploadFiles(event.dataTransfer.files); }}>
            <span className="flex items-center gap-2 font-semibold text-slate-800"><ImagePlus size={18} /><Video size={18} />{uploading ? "Cargando archivos…" : "Arrastra archivos o selecciónalos"}</span>
            <span className="mt-1 text-xs text-slate-500">Imágenes hasta 10 MB; videos MP4/WebM hasta 100 MB.</span>
            <input accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" className="sr-only" disabled={uploading} multiple onChange={async (event) => { const input = event.currentTarget; await uploadFiles(input.files ?? []); input.value = ""; }} type="file" />
          </label>
          {uploadError && <p className="mt-2 text-sm text-red-700" role="alert">{uploadError}</p>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{assets.map((asset) => <div className="overflow-hidden rounded-lg border border-slate-200 bg-white" key={asset.id}>{asset.type.startsWith("image/") ? <Image alt={asset.name} className="h-36 w-full object-cover" height={288} src={asset.url} unoptimized width={512} /> : <video aria-label={asset.name} className="h-36 w-full bg-black object-contain" controls preload="metadata" src={asset.url} />}<div className="flex items-center justify-between gap-2 px-2 py-2"><p className="truncate text-xs">{asset.name}</p><button className="text-xs font-semibold text-red-700 hover:underline" onClick={() => void removeAsset(asset.id)} type="button">Retirar</button></div><input name="assetIds" type="hidden" value={asset.id} /></div>)}</div>
        </fieldset>
      </Section>
    </div>

    {reviewSummary && <section className="mx-4 mb-4 rounded-2xl border-2 border-blue-200 bg-blue-50 p-4 sm:mx-6 sm:p-5" aria-labelledby="announcement-review-title">
      <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Revisión final</p>
      <h2 className="mt-1 text-lg font-bold text-blue-950" id="announcement-review-title">Confirma antes de publicar</h2>
      <div className="mt-4 rounded-xl border border-blue-100 bg-white p-4"><AnnouncementContent content={content} mentionIds={new Set(mentionIds)} /></div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="font-semibold text-blue-950">Destinatarios</dt><dd className="text-blue-800">{reviewSummary.audience}</dd></div>
        <div><dt className="font-semibold text-blue-950">Archivos y menciones</dt><dd className="text-blue-800">{reviewSummary.assets} archivos · {reviewSummary.mentions} menciones</dd></div>
        <div><dt className="font-semibold text-blue-950">Enlace destacado</dt><dd className="break-all text-blue-800">{reviewSummary.link ?? "Sin enlace destacado"}</dd></div>
        <div><dt className="font-semibold text-blue-950">Posición</dt><dd className="text-blue-800">{reviewSummary.pinned ? "Fijado en la parte superior" : "Orden normal"}</dd></div>
      </dl>
    </section>}

    <footer className="sticky bottom-0 flex flex-col gap-3 border-t border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <label className="flex items-center gap-2 text-sm font-medium"><input name="isPinned" type="checkbox" /> Fijar anuncio en la parte superior</label>
      <div className="flex flex-col gap-2 sm:items-end">
        {reviewError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{reviewError}</p>}
        {state.message && <p className={`rounded-lg px-3 py-2 text-sm ${state.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`} role="status">{state.message}</p>}
        {reviewSummary ? <div className="flex flex-col-reverse gap-2 sm:flex-row"><button className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50" onClick={() => setReviewSummary(null)} type="button">Volver a editar</button><button className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60" disabled={pending || uploading} type="submit">{pending ? "Publicando…" : "Confirmar publicación"}</button></div> : <button className="w-full rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto" disabled={uploading} onClick={prepareReview} type="button">Revisar anuncio</button>}
      </div>
    </footer>
  </form>;
}

function Section({ step, title, description, children }: { step: string; title: string; description: string; children: React.ReactNode }) {
  return <section className="space-y-4 rounded-2xl border border-slate-200 p-4 sm:p-5" aria-labelledby={`announcement-step-${step}`}><header className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">{step}</span><div><h2 className="font-bold text-slate-950" id={`announcement-step-${step}`}>{title}</h2><p className="text-sm text-slate-500">{description}</p></div></header>{children}</section>;
}

function StepBadge({ number, label }: { number: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1"><span className="text-blue-700">{number}</span>{label}</span>;
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
    {selectedOptions.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5" aria-label={`${label} seleccionados`}>{selectedOptions.map((option) => <button className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100" key={option.id} onClick={() => toggle(option.id)} type="button">{option.name} <span aria-hidden="true">×</span><span className="sr-only">, retirar</span></button>)}</div>}
    <label className="sr-only" htmlFor={`announcement-${name}-search`}>Buscar en {label}</label><input className={`${input} mb-2`} id={`announcement-${name}-search`} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} type="search" value={query} />
    {options.length ? <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">{visible.map((option) => <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white" key={option.id}><input checked={selected.includes(option.id)} className="mt-0.5 h-4 w-4" onChange={() => toggle(option.id)} type="checkbox" /><span><span className="block font-medium text-slate-800">{option.name}</span>{option.detail && <span className="block text-xs text-slate-500">{option.detail}</span>}</span></label>)}{visible.length === 0 && <p className="p-2 text-sm text-slate-500">Sin coincidencias.</p>}</div> : <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">{empty}</p>}
    {options.length > 40 && !query && <p className="mt-1 text-xs text-slate-400">Mostrando 40 opciones. Usa la búsqueda para encontrar más.</p>}
    {selected.map((id) => <input key={id} name={name} type="hidden" value={id} />)}
  </fieldset>;
}
