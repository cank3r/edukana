"use client";

import { useActionState, useState } from "react";
import { createPersonAction, type PeopleActionState } from "@/server/actions/people";

const primary = "min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const secondary = "min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60";
const fieldClass = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500";
const empty: PeopleActionState = { ok: false, message: "" };

const ROLE_OPTIONS = [
  { value: "STUDENT", label: "Estudiante" },
  { value: "TEACHER", label: "Docente" },
  { value: "COORDINATOR", label: "Coordinador" },
  { value: "PARENT", label: "Tutor" },
  { value: "ADMIN", label: "Administrador" },
];

/** Botón principal de la pantalla: abre un formulario corto para dar de alta a una persona. */
export function AddPerson({ canAddAdmin, startOpen = false }: { canAddAdmin: boolean; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [state, action, pending] = useActionState(async (previous: PeopleActionState, data: FormData) => {
    const result = await createPersonAction(previous, data);
    if (result.ok) setOpen(false);
    return result;
  }, empty);
  const roles = canAddAdmin ? ROLE_OPTIONS : ROLE_OPTIONS.filter((option) => option.value !== "ADMIN");

  return (
    <div>
      {!open && <button type="button" className={primary} onClick={() => setOpen(true)}>Agregar persona</button>}
      {open && (
        <form action={action} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="agregar-persona">
          <h2 id="agregar-persona" className="text-lg font-bold text-slate-950">Agregar persona</h2>
          <label className="block text-sm font-medium text-slate-900">
            Nombre completo
            <input name="name" required minLength={3} maxLength={120} className={fieldClass} autoComplete="off" autoFocus />
          </label>
          <label className="block text-sm font-medium text-slate-900">
            Correo
            <input name="email" type="email" required maxLength={254} className={fieldClass} autoComplete="off" inputMode="email" placeholder="ana@correo.com" />
            <span className="mt-1 block text-xs font-normal text-slate-500">Con este correo va a entrar. Revísalo bien: después no se cambia desde aquí.</span>
          </label>
          <label className="block text-sm font-medium text-slate-900">
            Rol
            <select name="role" defaultValue="STUDENT" className={fieldClass}>
              {roles.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-900">
            Teléfono (opcional)
            <input name="phone" maxLength={30} inputMode="tel" className={fieldClass} autoComplete="off" />
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-900">
            <input name="invite" type="checkbox" defaultChecked className="h-5 w-5 shrink-0" />
            Enviarle la invitación ahora
          </label>
          <p className="text-xs text-slate-500">La invitación es un correo con un enlace para que cree su contraseña. Vale por 7 días.</p>
          <div className="flex flex-wrap gap-2">
            <button className={primary} type="submit" disabled={pending}>{pending ? "Agregando…" : "Agregar persona"}</button>
            <button className={secondary} type="button" disabled={pending} onClick={() => setOpen(false)}>Cancelar</button>
          </div>
        </form>
      )}
      {state.message && <p role={state.ok ? "status" : "alert"} className={`mt-3 rounded-lg p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p>}
    </div>
  );
}
