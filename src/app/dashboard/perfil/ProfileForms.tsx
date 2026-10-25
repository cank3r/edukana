"use client";

import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useActionState, useEffect } from "react";
import { changeOwnPasswordAction, updateOwnProfileAction, type ProfileActionState } from "@/server/actions/profile";

const primary = "min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const input = "mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base outline-none focus:border-blue-500";
const label = "block text-sm font-medium text-slate-900";
const empty: ProfileActionState = { ok: false, message: "" };

function Notice({ ok, message }: { ok: boolean; message: string }) {
  if (!message) return null;
  return <p role={ok ? "status" : "alert"} className={`mt-3 rounded-lg p-3 text-sm ${ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{message}</p>;
}

/** Nombre y teléfono propios. */
export function OwnDataForm({ name, phone }: { name: string; phone: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (previous: ProfileActionState, data: FormData) => {
    const result = await updateOwnProfileAction(previous, data);
    if (result.ok) router.refresh();
    return result;
  }, empty);
  return (
    <form action={action} className="mt-3 space-y-3">
      <label className={label}>
        Nombre completo
        <input name="name" defaultValue={name} required minLength={3} maxLength={120} autoComplete="name" className={input} />
      </label>
      <label className={label}>
        Teléfono (opcional)
        <input name="phone" type="tel" defaultValue={phone} maxLength={30} autoComplete="tel" className={input} />
      </label>
      <button type="submit" className={primary} disabled={pending}>{pending ? "Guardando…" : "Guardar mis datos"}</button>
      <Notice ok={state.ok} message={state.message} />
    </form>
  );
}

/** Cambio de contraseña. Al terminar bien se cierra la sesión y se vuelve a la pantalla de entrada. */
export function OwnPasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, pending] = useActionState(changeOwnPasswordAction, empty);
  const done = state.ok;

  useEffect(() => {
    if (!done) return;
    // La sesión actual ya no vale: se da un momento para leer el aviso y se sale.
    const timer = setTimeout(() => void signOut({ callbackUrl: "/login" }), 4000);
    return () => clearTimeout(timer);
  }, [done]);

  if (done) {
    return (
      <div className="mt-3 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
        <p className="font-semibold">Tu contraseña se cambió.</p>
        <p className="mt-1">Por seguridad cerramos tu sesión en todos tus dispositivos. En un momento te llevamos a la pantalla de entrada para que entres con la contraseña nueva.</p>
        <button type="button" className={`${primary} mt-3`} onClick={() => void signOut({ callbackUrl: "/login" })}>Iniciar sesión de nuevo</button>
      </div>
    );
  }

  if (!hasPassword) {
    return (
      <div className="mt-3 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
        <p>Tu cuenta todavía no tiene contraseña. Para crearla, sal y usa «¿Olvidaste tu contraseña?» en la pantalla de entrada: te enviamos un enlace a tu correo.</p>
        <button type="button" className={`${primary} mt-3`} onClick={() => void signOut({ callbackUrl: "/recuperar" })}>Salir y crear mi contraseña</button>
      </div>
    );
  }

  return (
    <form action={action} className="mt-3 space-y-3">
      <p className="text-sm text-slate-600">Al cambiarla se cerrará tu sesión en todos tus dispositivos y tendrás que entrar de nuevo con la contraseña nueva.</p>
      <label className={label}>
        Contraseña actual
        <input name="currentPassword" type="password" required autoComplete="current-password" className={input} />
      </label>
      <label className={label}>
        Contraseña nueva
        <input name="newPassword" type="password" required minLength={10} maxLength={200} autoComplete="new-password" aria-describedby="ayuda-clave-nueva" className={input} />
        <span id="ayuda-clave-nueva" className="mt-1 block text-sm font-normal text-slate-600">Al menos 10 caracteres, con una letra y un número.</span>
      </label>
      <label className={label}>
        Repite la contraseña nueva
        <input name="repeatPassword" type="password" required minLength={10} maxLength={200} autoComplete="new-password" className={input} />
      </label>
      <button type="submit" className={primary} disabled={pending}>{pending ? "Cambiando…" : "Cambiar contraseña"}</button>
      <Notice ok={false} message={state.message} />
    </form>
  );
}
