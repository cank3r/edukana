"use client";
import { useActionState, type ReactNode } from "react";
import { billingAction } from "@/app/operador/planes/actions";

export function BillingForm({ operation, institutionId, children, label }: {
  operation: string; institutionId?: string; children?: ReactNode; label: string;
}) {
  const [state, action, pending] = useActionState(billingAction, { ok: false, message: "" });
  return <form action={action} className="space-y-3">
    <input type="hidden" name="operation" value={operation} />
    {institutionId && <input type="hidden" name="institutionId" value={institutionId} />}
    {children}
    <button disabled={pending} className="min-h-11 rounded-lg bg-[var(--navy)] px-4 py-2 text-white disabled:opacity-50">
      {pending ? "Guardando…" : label}
    </button>
    {state.message && <p role="status" className={state.ok ? "text-green-800" : "text-red-700"}>{state.message}</p>}
  </form>;
}
export function BillingInput({ label, name, value, type = "text", required = true }: {
  label: string; name: string; value?: string | number; type?: string; required?: boolean;
}) {
  return <label className="block text-sm">{label}<input name={name} type={type} defaultValue={value}
    required={required} min={type === "number" ? 0 : undefined} step={type === "number" ? 1 : undefined}
    className="mt-1 block min-h-11 w-full rounded-lg border border-gray-300 px-3" /></label>;
}
