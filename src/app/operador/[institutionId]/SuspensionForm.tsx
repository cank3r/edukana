"use client";

import { useActionState, useId, useState } from "react";
import { setInstitutionSuspensionAction } from "@/server/actions/platform-suspension";

export function SuspensionForm({ institutionId, name, status }: {
  institutionId: string; name: string; status: "ACTIVE" | "SUSPENDED";
}) {
  const fieldId = useId();
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(setInstitutionSuspensionAction, { ok: false, message: "" });
  const suspending = status === "ACTIVE";
  const label = suspending ? "Suspender institución" : "Reactivar institución";
  if (!open) return (
    <button type="button" onClick={() => setOpen(true)} className="min-h-11 rounded-lg border border-slate-400 px-4 py-2 font-semibold">
      {label}
    </button>
  );
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-slate-700">
        {suspending
          ? "Se cerrará el acceso de todas las personas de esta institución y su catálogo dejará de estar disponible. Sus datos se conservan."
          : "Las personas podrán volver a entrar a esta institución y su catálogo volverá a estar disponible si está habilitado."}
        {" "}El acceso a otras instituciones no cambia.
      </p>
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="status" value={suspending ? "SUSPENDED" : "ACTIVE"} />
      {suspending && <div>
        <label htmlFor={`${fieldId}-reason`} className="block text-sm font-medium">Motivo de la suspensión</label>
        <textarea id={`${fieldId}-reason`} aria-describedby={`${fieldId}-reason-help`} name="reason"
          value={reason} onChange={(event) => setReason(event.target.value)} required maxLength={1000} rows={3} disabled={pending}
          className="mt-1 block min-h-11 w-full rounded-lg border border-slate-400 p-3" />
        <p id={`${fieldId}-reason-help`} className="text-sm text-slate-600">No incluyas contraseñas ni información sensible.</p>
      </div>}
      <label className="block break-words text-sm font-medium">
        Escribe «{name}» para confirmar
        <input name="confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required maxLength={160} autoComplete="off" disabled={pending}
          className="mt-1 block min-h-11 w-full rounded-lg border border-slate-400 p-3" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending}
          className="min-h-11 rounded-lg bg-red-700 px-4 py-2 font-semibold text-white disabled:opacity-60">
          {pending ? "Guardando…" : label}
        </button>
        <button type="button" disabled={pending} onClick={() => setOpen(false)}
          className="min-h-11 rounded-lg border border-slate-400 px-4 py-2 font-semibold">Cancelar</button>
      </div>
      {state.message && <p role={state.ok ? "status" : "alert"} className="text-sm">{state.message}</p>}
    </form>
  );
}
