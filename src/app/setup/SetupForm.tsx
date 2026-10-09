"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createFirstInstitution, type SetupState } from "./actions";

const initial: SetupState = { ok: false, message: "" };
const input = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500";

export function SetupForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(createFirstInstitution, initial);
  return (
    <form action={action} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <input type="hidden" name="setupToken" value={token} />
      <fieldset className="space-y-4" disabled={pending || state.ok}>
        <legend className="mb-3 text-lg font-bold text-slate-950">Institución y administrador</legend>
        <label className="block text-sm font-medium">Nombre de la institución<input className={input} name="institutionName" required maxLength={160} autoComplete="organization" /></label>
        <label className="block text-sm font-medium">Identificador del espacio<input className={input} name="slug" required minLength={3} maxLength={63} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="colegio-piloto" /></label>
        <label className="block text-sm font-medium">Nombre del administrador<input className={input} name="adminName" required maxLength={120} autoComplete="name" /></label>
        <label className="block text-sm font-medium">Correo del administrador<input className={input} name="adminEmail" required maxLength={200} type="email" autoComplete="email" /></label>
        <label className="block text-sm font-medium">Contraseña<input className={input} name="password" required minLength={10} maxLength={200} type="password" autoComplete="new-password" /><span className="mt-1 block text-xs text-slate-500">Mínimo 10 caracteres, con al menos una letra y un número.</span></label>
        <button className="min-h-11 w-full rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60" type="submit">{pending ? "Creando institución…" : "Crear institución"}</button>
      </fieldset>
      {state.message && <p aria-live="polite" className={`rounded-lg p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p>}
      {state.ok && <Link className="flex min-h-11 items-center justify-center rounded-lg border border-blue-600 px-4 py-2.5 font-semibold text-blue-700" href="/login">Iniciar sesión</Link>}
    </form>
  );
}
