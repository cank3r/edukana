"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthMessage, authButton, authInput, authLink } from "@/components/auth/AuthCard";
import { requestPasswordResetAction, type PasswordResetState } from "@/server/actions/password-reset";

const initial: PasswordResetState = { ok: false, message: "" };

export function RecoverForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initial);
  if (state.ok) {
    return (
      <div className="space-y-4">
        <AuthMessage ok message={state.message} />
        <p className="text-sm text-slate-600">Revisa también la carpeta de no deseados. Si recibes el enlace, úsalo cuanto antes: vence una hora después de solicitarlo.</p>
        <Link className={authLink} href="/login">Volver a iniciar sesión</Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm font-medium text-slate-900">
        Correo electrónico
        <input className={authInput} name="email" type="email" required maxLength={200} autoComplete="email" inputMode="email" placeholder="tu@correo.com" />
      </label>
      <AuthMessage ok={false} message={state.message} />
      <button className={authButton} type="submit" disabled={pending}>{pending ? "Solicitando…" : "Solicitar enlace"}</button>
      <Link className="block text-center text-sm font-medium text-blue-700 underline" href="/login">Volver a iniciar sesión</Link>
    </form>
  );
}
