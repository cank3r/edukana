"use client";

import { useActionState, useState } from "react";
import { setInstitutionAiAction, type AiSettingState } from "@/server/actions/ai";

const empty: AiSettingState = { ok: false, message: "" };

export function AiSettingForm({ enabled, platformReady }: { enabled: boolean; platformReady: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(async (previous: AiSettingState, data: FormData) => {
    const result = await setInstitutionAiAction(previous, data);
    if (result.ok) setConfirming(false);
    return result;
  }, empty);
  const next = !enabled;

  return (
    <section aria-labelledby="asistente-ia" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <div>
        <h2 id="asistente-ia" className="text-lg font-semibold" style={{ color: "var(--navy)" }}>Asistente de IA</h2>
        <p className="mt-1 text-sm text-slate-600">
          Ayuda a los docentes a proponer preguntas a partir de sus lecciones (siempre las revisan antes de guardarlas) y responde dudas de los estudiantes usando solo el contenido de sus cursos.
        </p>
      </div>
      <p className="text-sm font-semibold text-slate-900">
        Estado: <span className={enabled ? "text-emerald-700" : "text-slate-700"}>{enabled ? "Encendido" : "Apagado"}</span>
      </p>
      {!platformReady && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">La plataforma todavía no tiene el asistente activado. Hasta que se active, nadie lo verá aunque esté encendido aquí.</p>
      )}

      {confirming ? (
        <form action={action} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <input type="hidden" name="enabled" value={next ? "1" : "0"} />
          <p className="text-sm text-slate-800">
            {next
              ? "Todos los docentes y estudiantes de tu institución volverán a ver el asistente en sus cursos."
              : "Todos los docentes y estudiantes de tu institución dejarán de ver el asistente. Las preguntas que ya se guardaron en los bancos no se borran."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60">
              {next ? "Sí, encender" : "Sí, apagar"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800">Cancelar</button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} disabled={pending} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60">
          {enabled ? "Apagar el asistente" : "Encender el asistente"}
        </button>
      )}
      {!pending && state.message && (
        <p role={state.ok ? "status" : "alert"} className={`rounded-lg p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p>
      )}
    </section>
  );
}
