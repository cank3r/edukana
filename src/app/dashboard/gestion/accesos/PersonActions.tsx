"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import { invitePersonAction, setPersonStatusAction, updatePersonAction, type PeopleActionState } from "@/server/actions/people";

export type Person = {
  id: string; name: string; email: string; phone: string; role: string; roleLabel: string;
  suspended: boolean; hasPassword: boolean; isSelf: boolean; detailHref?: string;
  hasIdentity?: boolean; accessRestricted?: boolean; canManageAdminRoles?: boolean;
};
const primary = "min-h-11 rounded-lg bg-[var(--blue)] px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const secondary = "min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-[var(--navy)] disabled:opacity-60";
const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)]";
const field = "mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base " + focus;
const empty: PeopleActionState = { ok: false, message: "" };
const roles = [
  ["STUDENT", "Estudiante"], ["TEACHER", "Docente"], ["COORDINATOR", "Coordinador"],
  ["PARENT", "Tutor"], ["ADMIN", "Administrador"],
];

function Notice({ state }: { state: PeopleActionState }) {
  if (!state.message) return null;
  return <p role={state.ok ? "status" : "alert"} className={`mt-3 rounded-lg p-3 text-sm ${
    state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
  }`}>{state.message}</p>;
}

/** Editor independiente de la gestión de acceso. Nunca sustituye un rol no admitido por el servidor. */
export function PersonEditor({ person, onBusyChange, onEditingChange }: {
  person: Person; onBusyChange?: (busy: boolean) => void; onEditingChange?: (editing: boolean) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const restoreFocus = useRef(false);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({ name: person.name, phone: person.phone, role: person.role });
  const supported = roles.some(([role]) => role === person.role);
  const keepRole = person.isSelf || (!person.canManageAdminRoles && person.role === "ADMIN");
  const [state, action, pending] = useActionState(async (previous: PeopleActionState, data: FormData) => {
    try {
      if (!supported) return { ok: false, message: "La edición de este rol no está disponible aquí." };
      const result = await updatePersonAction(previous, data);
      if (result.ok) { restoreFocus.current = true; setEditing(false); onEditingChange?.(false); }
      return result;
    } catch {
      return { ok: false, message: "No se pudieron guardar los datos. Revisa tu conexión e intenta de nuevo." };
    } finally { submitting.current = false; onBusyChange?.(false); }
  }, empty);
  useEffect(() => {
    if (editing) firstField.current?.focus();
    else if (!pending && restoreFocus.current) { trigger.current?.focus(); restoreFocus.current = false; }
  }, [editing, pending]);
  function close() {
    if (!pending) { restoreFocus.current = true; setEditing(false); onEditingChange?.(false); }
  }
  return (
    <div className="min-w-0" onKeyDown={(event) => {
      if (event.key === "Escape" && editing) { event.preventDefault(); event.stopPropagation(); close(); }
    }}>
      <button ref={trigger} type="button" className={`${secondary} ${focus}`} disabled={!supported || pending}
        aria-expanded={editing} aria-controls={`${id}-form`} aria-describedby={!supported ? `${id}-unsupported` : undefined}
        onClick={() => {
          if (editing) close();
          else {
            setValues({ name: person.name, phone: person.phone, role: person.role });
            setEditing(true); onEditingChange?.(true);
          }
        }}>Editar datos</button>
      {!supported && <p id={`${id}-unsupported`} className="mt-2 text-sm text-slate-600">
        La edición de este rol no está disponible aquí. Sus datos y su rol se conservan.
      </p>}
      {editing && <form id={`${id}-form`} action={action} aria-label={`Editar datos de ${person.name}`}
        className="mt-3 min-w-0 space-y-3 rounded-xl bg-slate-50 p-4" onSubmit={(event) => {
          // Dispatch explicitly so React does not reset the native select after a rejected action.
          event.preventDefault();
          if (submitting.current) return;
          const data = new FormData(event.currentTarget);
          submitting.current = true; onBusyChange?.(true);
          startTransition(() => action(data));
        }}>
        <input type="hidden" name="userId" value={person.id} />
        <fieldset disabled={pending} className="min-w-0 space-y-3">
          <div><label htmlFor={`${id}-name`} className="text-sm font-medium text-slate-900">Nombre completo</label>
            <input ref={firstField} id={`${id}-name`} name="name" required minLength={3} maxLength={120} className={field}
              value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} autoComplete="off" /></div>
          <div><label htmlFor={`${id}-phone`} className="text-sm font-medium text-slate-900">Teléfono (opcional)</label>
            <input id={`${id}-phone`} name="phone" maxLength={30} inputMode="tel" className={field}
              value={values.phone} onChange={(event) => setValues({ ...values, phone: event.target.value })} autoComplete="off" /></div>
          {keepRole ? <>
            <input type="hidden" name="role" value={person.role} />
            <p className="text-sm text-slate-600">Rol: {person.roleLabel}. {person.isSelf
              ? "No puedes cambiar tu propio rol." : "Solo un administrador puede cambiar este rol."}</p>
          </> : (
            <div><label htmlFor={`${id}-role`} className="text-sm font-medium text-slate-900">Rol en esta institución</label>
              <select id={`${id}-role`} name="role" className={field} value={values.role}
                onChange={(event) => setValues({ ...values, role: event.target.value })}>
                {roles.filter(([value]) => value !== "ADMIN" || person.canManageAdminRoles)
                  .map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></div>
          )}
          <p className="[overflow-wrap:anywhere] text-sm text-slate-600">El correo {person.email} no se cambia aquí.</p>
          <div className="flex flex-wrap gap-2">
            <button className={`${primary} ${focus}`} type="submit">{pending ? "Guardando…" : "Guardar cambios"}</button>
            <button className={`${secondary} ${focus}`} type="button" onClick={close}>Cancelar</button>
          </div>
        </fieldset>
      </form>}
      <Notice state={state} />
    </div>
  );
}

/** Disclosure de acciones: tabulación normal, Escape y confirmaciones sin simular un menú ARIA. */
export function PersonAccess({ person, showSummary = true, showEdit = true }: {
  person: Person; showSummary?: boolean; showEdit?: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const confirmation = useRef<HTMLHeadingElement>(null);
  const submitting = useRef(false);
  const restoreFocus = useRef(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editPending, setEditPending] = useState(false);
  const [asking, setAsking] = useState<"invite" | "suspend" | "activate" | null>(null);
  const [reason, setReason] = useState("");
  const [state, action, pending] = useActionState(async (previous: PeopleActionState, data: FormData) => {
    try {
      const invitation = data.get("operation") === "invite";
      const result = invitation ? await invitePersonAction(previous, data) : await setPersonStatusAction(previous, data);
      if (!result.ok) return result;
      restoreFocus.current = true;
      setAsking(null);
      setOpen(false);
      return { ...result, message: invitation
        ? "Correo enviado al proveedor. La entrega en la bandeja no está confirmada."
        : data.get("status") === "ACTIVE" ? "Estado actualizado: activo en esta institución."
        : "Estado actualizado: suspendido en esta institución." };
    } catch {
      return { ok: false, message: "No se pudo completar la acción. Revisa tu conexión e intenta de nuevo." };
    } finally { submitting.current = false; }
  }, empty);
  useEffect(() => {
    if (asking) confirmation.current?.focus();
    else if (!pending && restoreFocus.current) { trigger.current?.focus(); restoreFocus.current = false; }
  }, [asking, pending]);
  function close() {
    if (!pending && !editPending) {
      restoreFocus.current = true; setAsking(null); setOpen(false); setEditing(false); trigger.current?.focus();
    }
  }
  const canInvite = !person.isSelf && !person.suspended && !person.accessRestricted && person.hasIdentity === true;
  const canChangeStatus = !person.isSelf && (person.canManageAdminRoles || !["ADMIN", "SUPER_ADMIN"].includes(person.role));
  const inviteLabel = person.hasPassword ? "Enviar aviso de acceso" : "Enviar invitación";
  return (
    <li className="min-w-0 py-4" onKeyDown={(event) => {
      if (event.key === "Escape" && open) { event.preventDefault(); close(); }
    }}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        {showSummary && <div className="min-w-0 flex-1 basis-48">
          <p className="[overflow-wrap:anywhere] font-semibold text-[var(--navy)]">
            {person.detailHref ? <Link className={`inline-flex min-h-11 max-w-full items-center text-[var(--blue)] underline ${focus}`}
              href={person.detailHref}>{person.name}</Link> : person.name}
            {person.isSelf && <span className="ml-2 text-xs font-normal text-slate-500">Tú</span>}
          </p>
          <p className="[overflow-wrap:anywhere] text-sm text-slate-600">{person.email}</p>
          <p className="mt-1 text-sm text-slate-600">{person.roleLabel}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
            <span className={`rounded-full px-2.5 py-1 ${person.suspended
              ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{person.suspended ? "Suspendido" : "Activo"}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
              {person.hasPassword ? "Con contraseña" : "Sin contraseña"}
            </span>
          </div>
        </div>}
        <button ref={trigger} type="button" className={`${secondary} ${focus}`} aria-expanded={open}
          aria-controls={`${id}-actions`} aria-label={`Acciones de ${person.name}`} disabled={pending || editPending}
          onClick={() => open ? close() : setOpen(true)}>Acciones <span aria-hidden="true">{open ? "−" : "+"}</span></button>
      </div>
      {open && <div id={`${id}-actions`} className="mt-3 min-w-0 space-y-3 rounded-xl border border-slate-200 p-3 sm:p-4">
        {!asking && <>
          {showEdit && <PersonEditor person={person} onBusyChange={setEditPending} onEditingChange={setEditing} />}
          {!person.isSelf && !editing && <div className="flex flex-wrap gap-2">
            {canInvite && <button type="button" className={`${secondary} ${focus}`} onClick={() => setAsking("invite")}>
              {inviteLabel}</button>}
            {canChangeStatus && <button type="button" className={`${secondary} ${focus}`}
              onClick={() => { setReason(""); setAsking(person.suspended ? "activate" : "suspend"); }}>
              {person.suspended ? "Reactivar en esta institución" : "Suspender en esta institución"}
            </button>}
          </div>}
          {person.isSelf && <p className="text-sm text-slate-600">No puedes cambiar tu propio estado desde aquí.</p>}
          {!person.isSelf && !canChangeStatus && <p className="text-sm text-slate-600">
            Solo un administrador puede cambiar el estado de otro administrador.
          </p>}
          {!person.isSelf && !canInvite && <p className="text-sm text-slate-600">{person.hasIdentity === false
            ? "Este registro no tiene acceso configurado."
            : person.suspended || person.accessRestricted ? "La invitación no está disponible mientras el acceso esté suspendido."
            : "Gestiona la invitación desde el directorio."}</p>}
        </>}
        {asking && <form action={action} aria-labelledby={`${id}-confirmation`} onSubmit={(event) => {
          if (submitting.current) event.preventDefault();
          else submitting.current = true;
        }}>
          <input type="hidden" name="userId" value={person.id} />
          <input type="hidden" name="operation" value={asking === "invite" ? "invite" : "status"} />
          <input type="hidden" name="status" value={asking === "activate" ? "ACTIVE" : "SUSPENDED"} />
          <h3 ref={confirmation} tabIndex={-1} id={`${id}-confirmation`} className="font-semibold text-[var(--navy)]">
            {asking === "invite" ? inviteLabel : asking === "suspend" ? "Confirmar suspensión" : "Confirmar reactivación"}
          </h3>
          <p className="mt-2 [overflow-wrap:anywhere] text-sm text-slate-600">{asking === "invite"
            ? `Se enviará un correo a ${person.email}. ${person.hasPassword
              ? "Incluye un aviso de acceso; no cambia su contraseña."
              : "Incluye un enlace para crear su contraseña, válido por 7 días."} No se puede retirar el correo una vez enviado.`
            : asking === "suspend" ? `${person.name} no podrá entrar a esta institución. Sus cursos, notas y entregas se conservan.`
            : `${person.name} quedará activo en esta institución. Esto no cambia su contraseña ni otras restricciones de su cuenta.`}</p>
          {asking === "suspend" && <div className="mt-3">
            <label htmlFor={`${id}-reason`} className="text-sm font-medium text-slate-900">Motivo de la suspensión</label>
            <input id={`${id}-reason`} name="reason" required maxLength={500} value={reason} disabled={pending}
              onChange={(event) => setReason(event.target.value)} className={field} placeholder="Ejemplo: retiro del programa" />
          </div>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className={`${asking === "suspend"
              ? "min-h-11 rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60" : primary} ${focus}`}>
              {pending ? "Procesando…" : asking === "invite" ? "Sí, enviar correo"
                : asking === "suspend" ? "Sí, suspender" : "Sí, reactivar"}
            </button>
            <button type="button" className={`${secondary} ${focus}`} disabled={pending} onClick={close}>Cancelar</button>
          </div>
        </form>}
      </div>}
      <Notice state={state} />
    </li>
  );
}
