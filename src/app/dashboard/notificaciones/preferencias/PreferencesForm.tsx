"use client";

import { useActionState } from "react";
import { saveEmailPreferencesAction, type PreferencesActionState } from "@/server/actions/notifications";
import type { EmailPreferenceItem } from "@/server/notifications/preferences";

const empty: PreferencesActionState = { ok: false, message: "" };

/** Una casilla por tipo de notificación. Se guarda todo junto con un solo botón. */
export function PreferencesForm({ items }: { items: EmailPreferenceItem[] }) {
  const [state, action, pending] = useActionState(saveEmailPreferencesAction, empty);
  return (
    <form action={action} className="space-y-4">
      <fieldset>
        <legend className="text-base font-semibold text-slate-950">Avísame por correo…</legend>
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.kind}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50">
                <input type="checkbox" name="email" value={item.kind} defaultChecked={item.email} className="h-5 w-5 shrink-0 accent-blue-600" />
                <span className="text-slate-900">{item.label}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60">
        {pending ? "Guardando…" : "Guardar mis preferencias"}
      </button>
      {state.message && (
        <p role={state.ok ? "status" : "alert"} className={`rounded-lg p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
