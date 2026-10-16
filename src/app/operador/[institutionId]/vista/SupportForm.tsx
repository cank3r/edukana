"use client";
import { useActionState } from "react";
import { enterSupportAction } from "./actions";

export function SupportForm({ institutionId, name }: { institutionId: string; name: string }) {
  const [state, action, pending] = useActionState(enterSupportAction, { message: "" });
  return <form action={action} className="space-y-3">
    <input type="hidden" name="institutionId" value={institutionId} />
    <label className="block text-sm text-slate-700">
      Escribe «{name}» para confirmar
      <input name="confirmation" required autoComplete="off" maxLength={160}
        className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-slate-950" />
    </label>
    <button disabled={pending} className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60">
      {pending ? "Abriendo…" : "Ver como administrador"}
    </button>
    {state.message && <p role="alert" className="text-sm text-red-700">{state.message}</p>}
  </form>;
}
