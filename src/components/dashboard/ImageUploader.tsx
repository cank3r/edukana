"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ImagePlus } from "lucide-react";
import { avatarAction, courseImageAction, institutionLogoAction, type FileActionState } from "@/server/actions/files";
import { formatFileSize, uploadFile } from "@/lib/upload-client";
import { IMAGE_ACCEPT, IMAGE_MAX_BYTES } from "@/lib/uploads";

const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const secondary = "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60";
const danger = "inline-flex min-h-11 items-center justify-center rounded-lg bg-red-700 px-4 py-2.5 font-semibold text-white disabled:opacity-60";

type Purpose = "course-image" | "avatar" | "logo";

const COPY: Record<Purpose, { thing: string; empty: string; removeImpact: string }> = {
  "course-image": {
    thing: "imagen del curso",
    empty: "Este curso todavía no tiene imagen. Se mostrará en la lista de cursos y en la portada.",
    removeImpact: "El curso volverá a mostrarse sin imagen en la lista y en la portada.",
  },
  avatar: {
    thing: "foto",
    empty: "Todavía no tienes foto. Mientras tanto, el menú muestra tu inicial.",
    removeImpact: "El menú volverá a mostrar tu inicial.",
  },
  logo: {
    thing: "logo",
    empty: "Tu institución todavía no tiene logo.",
    removeImpact: "La institución quedará sin logo.",
  },
};

const ACTIONS = { "course-image": courseImageAction, avatar: avatarAction, logo: institutionLogoAction } as const;

/** Elegir, cambiar o quitar una imagen (curso, foto de perfil o logo). Quitar pide confirmación. */
export function ImageUploader({ purpose, imageUrl, courseId, alt }: { purpose: Purpose; imageUrl: string | null; courseId?: string; alt: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<FileActionState>({ ok: false, message: "" });
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, startSaving] = useTransition();
  const busy = uploading || saving;
  const copy = COPY[purpose];
  const round = purpose === "avatar";

  function save(assetId: string) {
    const data = new FormData();
    data.set("assetId", assetId);
    if (courseId) data.set("courseId", courseId);
    startSaving(async () => {
      const result = await ACTIONS[purpose]({ ok: false, message: "" }, data);
      setState(result);
      if (result.ok) router.refresh();
    });
  }

  async function choose(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setState({ ok: false, message: "" });
    try {
      const assetId = await uploadFile(file, { purpose, courseId });
      save(assetId);
    } catch (error) {
      setState({ ok: false, message: error instanceof Error ? error.message : "No se pudo subir la imagen. Intenta de nuevo." });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={alt}
          width={round ? 96 : 640}
          height={round ? 96 : 360}
          unoptimized
          className={round ? "h-24 w-24 rounded-full border border-slate-200 object-cover" : "aspect-video w-full max-w-md rounded-xl border border-slate-200 bg-slate-50 object-cover"}
        />
      ) : (
        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">{copy.empty}</p>
      )}
      <p className="text-sm text-slate-600">JPG, PNG o WebP de hasta {formatFileSize(IMAGE_MAX_BYTES)}.{purpose !== "avatar" && " Cualquier persona podrá verla, también sin iniciar sesión."}</p>
      <div className="flex flex-wrap gap-2">
        <label className={`${primary} cursor-pointer focus-within:ring-2 focus-within:ring-blue-300 ${busy ? "pointer-events-none opacity-60" : ""}`}>
          <ImagePlus size={18} aria-hidden="true" />
          {uploading ? "Subiendo…" : saving ? "Guardando…" : imageUrl ? `Cambiar ${copy.thing}` : `Subir ${copy.thing}`}
          <input ref={inputRef} type="file" accept={IMAGE_ACCEPT} className="sr-only" disabled={busy} onChange={(event) => void choose(event.currentTarget.files?.[0])} />
        </label>
        {imageUrl && !confirming && <button type="button" className={secondary} disabled={busy} onClick={() => setConfirming(true)}>Quitar {copy.thing}</button>}
      </div>
      {confirming && (
        <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900" role="alertdialog" aria-label={`Confirmar quitar ${copy.thing}`}>
          <p className="font-semibold">¿Quitar {purpose === "logo" ? "el" : "la"} {copy.thing}? {copy.removeImpact} La imagen se borra y no se puede recuperar.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={danger} disabled={busy} onClick={() => { setConfirming(false); save(""); }}>Sí, quitar</button>
            <button type="button" className={secondary} disabled={busy} onClick={() => setConfirming(false)}>Cancelar</button>
          </div>
        </div>
      )}
      {state.message && <p role={state.ok ? "status" : "alert"} className={`rounded-lg p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p>}
    </div>
  );
}
