"use client";

import { useActionState, useState } from "react";
import { updateBrandColorAction, type BrandColorActionState } from "@/server/actions/branding";
import { BRAND_SWATCHES, EDUKANA_BLUE, ensureReadableOnWhite, normalizeHexColor } from "@/server/platform/brand-color";

const empty: BrandColorActionState = { ok: false, message: "" };
const fieldClass = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-base uppercase outline-none focus:border-blue-500";

/** Color principal de la institución, con muestras sugeridas y aviso si hay que oscurecerlo. */
export function BrandColorForm({ current }: { current: string | null }) {
  const [text, setText] = useState(current ?? "");
  const [state, action, pending] = useActionState(async (previous: BrandColorActionState, data: FormData) => {
    const result = await updateBrandColorAction(previous, data);
    if (result.ok) setText(result.color ?? "");
    return result;
  }, empty);

  const normalized = normalizeHexColor(text);
  const preview = normalized ? ensureReadableOnWhite(normalized) : null;
  const shown = preview?.color ?? EDUKANA_BLUE;
  const invalid = text.trim() !== "" && !normalized;

  return (
    <form action={action} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: "var(--navy)" }}>Color principal</h2>
        <p className="mt-1 text-sm text-slate-600">Se usa en el menú, en el encabezado del celular y en los botones principales. Todas las personas de tu institución lo verán.</p>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-slate-900">Colores sugeridos</legend>
        <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {BRAND_SWATCHES.map((swatch) => {
            const selected = normalized === swatch.value;
            return (
              <button key={swatch.value} type="button" onClick={() => setText(swatch.value)} aria-pressed={selected} aria-label={swatch.label} title={swatch.label}
                className={`h-11 w-full rounded-lg border-2 ${selected ? "border-slate-950 ring-2 ring-slate-950 ring-offset-2" : "border-white"}`}
                style={{ background: swatch.value }} />
            );
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-[auto_1fr] items-end gap-3">
        <label className="block text-sm font-medium text-slate-900">
          Elegir
          <input type="color" value={normalized ?? EDUKANA_BLUE} onChange={(event) => setText(event.target.value.toUpperCase())}
            className="mt-1 block h-11 w-14 cursor-pointer rounded-lg border border-slate-300 bg-white p-1" />
        </label>
        <label className="block text-sm font-medium text-slate-900">
          O escribe el código del color
          <input name="brandColor" value={text} onChange={(event) => setText(event.target.value)} placeholder={EDUKANA_BLUE} maxLength={7}
            aria-invalid={invalid} className={`mt-1 ${fieldClass}`} autoCapitalize="characters" spellCheck={false} />
        </label>
      </div>
      {invalid && <p role="alert" className="text-sm text-red-700">Escribe el color como # seguido de 6 letras o números, por ejemplo {EDUKANA_BLUE}.</p>}
      {preview?.adjusted && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Ese color es muy claro para letras blancas. Al guardar lo oscurecemos a <span className="font-mono">{preview.color}</span> para que los botones se lean bien.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3" aria-label="Vista previa">
        <span className="text-sm text-slate-600">Así se verá:</span>
        <span className="inline-flex min-h-11 items-center rounded-lg px-4 font-semibold text-white" style={{ background: shown }}>Botón principal</span>
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending || invalid} className="min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60">
          {pending ? "Guardando…" : "Guardar color"}
        </button>
        {(current || text) && (
          <button type="submit" name="reset" value="1" disabled={pending}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60">
            Volver al color de Edukana
          </button>
        )}
      </div>
      {state.message && <p role={state.ok ? "status" : "alert"} className={`rounded-lg p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p>}
    </form>
  );
}
