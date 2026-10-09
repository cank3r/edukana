"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthMessage, authButton, authInput, authLink } from "@/components/auth/AuthCard";
import { resetPasswordAction, type PasswordResetState } from "@/server/actions/password-reset";

const initial: PasswordResetState = { ok: false, message: "" };

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initial);
  if (state.ok) {
    return (
      <div className="space-y-4">
        <AuthMessage ok message={state.message} />
        <Link className={authLink} href="/login">Iniciar sesión</Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <label className="block text-sm font-medium text-slate-900">
        Contraseña nueva
        <input className={authInput} name="password" type="password" required minLength={10} maxLength={200} autoComplete="new-password" />
        <span className="mt-1 block text-xs font-normal text-slate-500">Mínimo 10 caracteres, con al menos una letra y un número.</span>
      </label>
      <label className="block text-sm font-medium text-slate-900">
        Escríbela otra vez
        <input className={authInput} name="confirmPassword" type="password" required minLength={10} maxLength={200} autoComplete="new-password" />
      </label>
      <AuthMessage ok={false} message={state.message} />
      <button className={authButton} type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar contraseña"}</button>
      <Link className="block text-center text-sm font-medium text-blue-700 underline" href="/recuperar">Pedir un enlace nuevo</Link>
    </form>
  );
}
