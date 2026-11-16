"use client";

import { useActionState } from "react";
import { updateInstitutionFeaturesAction } from "@/server/actions/platform-features";
import type { InstitutionFeatures } from "@/server/platform/feature-policy";

export function FeatureForm({ institutionId, features }: { institutionId: string; features: InstitutionFeatures }) {
  const [state, action, pending] = useActionState(updateInstitutionFeaturesAction, { ok: false, message: "" });
  return <form action={action} className="space-y-3" onSubmit={(event) => {
    const data = new FormData(event.currentTarget);
    const impacts = [
      features.ai && data.get("ai") !== "on" ? "El asistente dejará de estar disponible y la administración no podrá reactivarlo." : "",
      features.catalog && data.get("catalog") !== "on" ? "El catálogo dejará de estar disponible y se bloquearán las compras nuevas." : "",
    ].filter(Boolean);
    if (impacts.length && !window.confirm(`${impacts.join("\n")}\n¿Guardar estos cambios?`)) event.preventDefault();
  }}>
    <input name="institutionId" type="hidden" value={institutionId} />
    <label className="flex min-h-11 items-center gap-3">
      <input name="ai" type="checkbox" defaultChecked={features.ai} className="h-5 w-5" /> Asistente de IA
    </label>
    <p className="text-sm text-slate-600">Al apagarlo, la administración no podrá volver a encenderlo.</p>
    <label className="flex min-h-11 items-center gap-3">
      <input name="catalog" type="checkbox" defaultChecked={features.catalog} className="h-5 w-5" /> Catálogo público y venta de cursos
    </label>
    <p className="text-sm text-slate-600">Al apagarlo, el catálogo deja de estar disponible y no se aceptan compras nuevas.</p>
    <label className="block text-sm font-medium">Comisión (%)
      <input name="commissionPercent" type="number" min="0" max="100" step="0.01" required
        defaultValue={features.commissionPercent} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 p-2" />
    </label>
    <p className="text-sm text-slate-600">Solo para el informe de ventas. No cambia lo que se cobra al comprador.</p>
    <button disabled={pending} className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-60">
      {pending ? "Guardando…" : "Guardar funciones"}
    </button>
    {state.message && <p role={state.ok ? "status" : "alert"} className="text-sm">{state.message}</p>}
  </form>;
}
