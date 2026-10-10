"use client";

import { useActionState, useId, useState } from "react";
import { IMAGE_ACCEPT, validateUploadRequest } from "@/lib/uploads";
import { saveOperatorBrandAction, prepareOperatorLogoAction, confirmOperatorLogoAction } from "@/server/actions/platform-branding";

const field = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base";
export type BrandingValues = { name: string; logoUrl: string | null; brandColor: string | null; domain: string | null; hideEdukanaBrand: boolean };
export function BrandingForm({ institutionId, values }: { institutionId: string; values: BrandingValues }) {
  const fieldId = useId();
  const [state, action, pending] = useActionState(saveOperatorBrandAction, { ok: false, message: "" });
  const [assetId, setAssetId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  async function upload(file: File | undefined) {
    if (!file) return;
    const invalid = validateUploadRequest("logo", file);
    if (invalid) { setUploadMessage(invalid); return; }
    setUploading(true); setAssetId(""); setUploadMessage("");
    try {
      const prepared = await prepareOperatorLogoAction(institutionId, { name: file.name, type: file.type, size: file.size });
      if (!prepared.ok) throw new Error(prepared.message);
      const response = await fetch(prepared.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!response.ok) throw new Error("No se pudo subir el logo. Intenta de nuevo.");
      const confirmed = await confirmOperatorLogoAction(institutionId, prepared.assetId);
      if (!confirmed.ok) throw new Error(confirmed.message);
      setAssetId(confirmed.assetId); setUploadMessage("Logo listo. Guarda la marca para publicarlo.");
    } catch (error) { setUploadMessage(error instanceof Error ? error.message : "No se pudo subir el logo."); }
    finally { setUploading(false); }
  }
  return <form action={action} className="space-y-4">
    <input type="hidden" name="institutionId" value={institutionId} />
    <input type="hidden" name="assetId" value={assetId} />
    {values.logoUrl && <div>
      {/* eslint-disable-next-line @next/next/no-img-element -- institution storage image */}
      <img src={values.logoUrl} alt="Logo actual" className="h-20 w-20 object-contain" />
      <label className="flex min-h-11 items-center gap-2"><input name="removeLogo" type="checkbox" />Quitar logo</label>
    </div>}
    <div>
      <label htmlFor={`${fieldId}-logo`} className="block text-sm font-medium">Logo</label>
      <input id={`${fieldId}-logo`} aria-describedby={`${fieldId}-logo-help`} type="file" accept={IMAGE_ACCEPT} disabled={pending || uploading} className={`${field} py-2`}
        onChange={(event) => void upload(event.target.files?.[0])} />
      <p id={`${fieldId}-logo-help`} className="mt-1 text-sm text-slate-600">JPG, PNG o WebP, hasta 5 MB. Se publica al guardar la marca.</p>
    </div>
    {uploadMessage && <p role="status" className="text-sm text-slate-700">{uploadMessage}</p>}
    <div>
      <label htmlFor={`${fieldId}-color`} className="block text-sm font-medium">Color principal</label>
      <input id={`${fieldId}-color`} aria-describedby={`${fieldId}-color-help`} name="brandColor" defaultValue={values.brandColor ?? ""} placeholder="#2457F5" maxLength={7} className={field} />
      <p id={`${fieldId}-color-help`} className="mt-1 text-sm text-slate-600">Ajustamos los colores claros para que las letras se lean bien. Vacío usa el azul de Edukana.</p>
    </div>
    <details className="rounded-lg border border-slate-200 p-3">
      <summary className="min-h-11 cursor-pointer font-medium">Opciones avanzadas</summary>
      <div>
        <label htmlFor={`${fieldId}-domain`} className="block text-sm font-medium">Dominio de entrada</label>
        <input id={`${fieldId}-domain`} aria-describedby={`${fieldId}-domain-help`} name="domain" defaultValue={values.domain ?? ""} placeholder="aula.colegio.edu.do" autoCapitalize="none"
          autoCorrect="off" spellCheck={false} maxLength={253} className={field} />
        <p id={`${fieldId}-domain-help`} className="mt-1 text-sm text-slate-600">Sin https://, rutas ni puertos. Requiere configurar DNS y Vercel por separado. Vacío quita el dominio propio.</p>
      </div>
      <div className="mt-3">
        <label htmlFor={`${fieldId}-confirmation`} className="block text-sm font-medium">Confirmar cambio de dominio</label>
        <input id={`${fieldId}-confirmation`} aria-describedby={`${fieldId}-confirmation-help`} name="confirmation" autoComplete="off" placeholder={values.name} className={field} />
        <p id={`${fieldId}-confirmation-help`} className="mt-1 text-sm text-slate-600">Solo al cambiar el dominio: escribe «{values.name}». Los próximos enlaces usarán el nuevo dominio; configura su DNS antes de compartirlos.</p>
      </div>
      <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
        <input name="hideEdukanaBrand" type="checkbox" defaultChecked={values.hideEdukanaBrand} />Ocultar «Hecho con Edukana» cuando el plan no lo define
      </label>
      <p className="text-sm text-slate-600">La opción del plan tiene prioridad sobre este ajuste.</p>
    </details>
    <p className="text-sm text-slate-600">Al guardar, la marca aparece en el acceso, el catálogo y los próximos correos.</p>
    <button disabled={pending || uploading} className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60">
      {uploading ? "Subiendo logo…" : pending ? "Guardando…" : "Guardar marca"}
    </button>
    {state.message && <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm text-emerald-800" : "text-sm text-red-800"}>{state.message}</p>}
  </form>;
}
