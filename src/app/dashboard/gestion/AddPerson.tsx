"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import { createPersonAction, type PeopleActionState } from "@/server/actions/people";

const primary = "min-h-11 rounded-lg bg-[var(--blue)] px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const secondary = "min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold disabled:opacity-60";
const field = "mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base";
const empty: PeopleActionState = { ok: false, message: "" };
const initialValues = { name: "", email: "", phone: "", role: "STUDENT", invite: true };
const roles = [["STUDENT", "Estudiante"], ["TEACHER", "Docente"], ["COORDINATOR", "Coordinador"],
  ["PARENT", "Tutor"], ["ADMIN", "Administrador"]];

export function AddPerson({ canAddAdmin, startOpen = false }: { canAddAdmin: boolean; startOpen?: boolean }) {
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLInputElement>(null);
  const reviewTitle = useRef<HTMLHeadingElement>(null);
  const submitting = useRef(false);
  const restoreFocus = useRef(false);
  const [open, setOpen] = useState(startOpen);
  const [review, setReview] = useState(false);
  const [values, setValues] = useState(initialValues);
  const [feedback, setFeedback] = useState(empty);
  const [, action, pending] = useActionState(async (previous: PeopleActionState, data: FormData) => {
    let result: PeopleActionState;
    try { result = await createPersonAction(previous, data); }
    catch { result = { ok: false, message: "No se pudo agregar la persona. Revisa tu conexión e intenta de nuevo." }; }
    finally { submitting.current = false; }
    setFeedback(result);
    if (result.ok) { restoreFocus.current = true; setOpen(false); setReview(false); setValues(initialValues); }
    return result;
  }, empty);
  useEffect(() => {
    if (open) { if (review) reviewTitle.current?.focus(); else first.current?.focus(); }
    else if (!pending && restoreFocus.current) { trigger.current?.focus(); restoreFocus.current = false; }
  }, [open, review, pending]);
  function close() {
    if (pending) return;
    restoreFocus.current = true; setOpen(false); setReview(false); setValues(initialValues); setFeedback(empty);
  }
  const availableRoles = roles.filter(([role]) => canAddAdmin || role !== "ADMIN");
  return <div onKeyDown={(event) => {
    if (event.key === "Escape" && open) { event.preventDefault(); close(); }
  }}>
    {!open && <button ref={trigger} type="button" className={primary} onClick={() => {
      setFeedback(empty); setOpen(true);
    }}>Agregar persona</button>}
    {open && <form ref={form} action={action} aria-labelledby={`${id}-title`}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5" onSubmit={(event) => {
        event.preventDefault();
        if (!review) { if (form.current?.reportValidity()) setReview(true); return; }
        if (submitting.current) return;
        const data = new FormData(event.currentTarget);
        submitting.current = true;
        startTransition(() => action(data));
      }}>
      <h2 ref={reviewTitle} tabIndex={review ? -1 : undefined} id={`${id}-title`} className="text-lg font-bold text-[var(--navy)]">
        {review ? "Revisar antes de agregar" : "Agregar persona"}
      </h2>
      {!review ? <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor={`${id}-name`} className="text-sm font-medium">Nombre completo</label>
          <input ref={first} id={`${id}-name`} name="name" required minLength={3} maxLength={120} className={field}
            autoComplete="off" value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} /></div>
        <div><label htmlFor={`${id}-email`} className="text-sm font-medium">Correo</label>
          <input id={`${id}-email`} name="email" type="email" required maxLength={254} className={field} autoComplete="off"
            inputMode="email" aria-describedby={`${id}-email-help`} value={values.email}
            onChange={(event) => setValues({ ...values, email: event.target.value })} />
          <p id={`${id}-email-help`} className="mt-1 text-xs text-slate-500">Usará este correo para entrar. Después no se cambia aquí.</p>
        </div>
        <div><label htmlFor={`${id}-role`} className="text-sm font-medium">Rol en esta institución</label>
          <select id={`${id}-role`} name="role" className={field} value={values.role}
            onChange={(event) => setValues({ ...values, role: event.target.value })}>
            {availableRoles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></div>
        <div><label htmlFor={`${id}-phone`} className="text-sm font-medium">Teléfono (opcional)</label>
          <input id={`${id}-phone`} name="phone" maxLength={30} inputMode="tel" className={field} autoComplete="off"
            value={values.phone} onChange={(event) => setValues({ ...values, phone: event.target.value })} /></div>
        <div className="sm:col-span-2">
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium" htmlFor={`${id}-invite`}>
            <input id={`${id}-invite`} name="invite" type="checkbox" className="h-5 w-5 shrink-0" checked={values.invite}
              aria-describedby={`${id}-invite-help`} onChange={(event) => setValues({ ...values, invite: event.target.checked })} />
            Enviarle la invitación al agregar
          </label>
          <p id={`${id}-invite-help`} className="text-xs text-slate-500">
            Es un correo con un enlace para crear su contraseña, válido por 7 días. Revisar aún no envía nada.
          </p>
        </div>
      </div> : <>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {[["Nombre", values.name], ["Correo", values.email], ["Rol", roles.find(([role]) => role === values.role)?.[1]],
            ["Teléfono", values.phone || "Sin teléfono"]].map(([label, value]) => <div key={label} className="min-w-0">
              <dt className="text-slate-500">{label}</dt><dd className="[overflow-wrap:anywhere] font-medium">{value}</dd>
            </div>)}
        </dl>
        {Object.entries(values).filter(([key]) => key !== "invite").map(([name, value]) =>
          <input key={name} type="hidden" name={name} value={String(value)} />)}
        {values.invite && <input type="hidden" name="invite" value="on" />}
        <p className="[overflow-wrap:anywhere] rounded-lg bg-slate-50 p-3 text-sm">{values.invite
          ? `Al confirmar, se agregará la persona y se enviará una invitación a ${values.email}. El correo enviado no se puede retirar.`
          : "Al confirmar, se agregará la persona sin enviar correo. Podrás invitarla desde sus acciones."}</p>
      </>}
      <div className="flex flex-wrap gap-2">
        <button className={primary} type="submit" disabled={pending}
          onClick={(event) => { if (event.detail > 1) event.preventDefault(); }}
          onKeyDown={(event) => { if (event.repeat) event.preventDefault(); }}>{pending ? "Agregando…"
          : review ? values.invite ? "Agregar y enviar invitación" : "Agregar sin enviar correo" : "Revisar"}</button>
        {review && <button className={secondary} type="button" disabled={pending} onClick={() => setReview(false)}>Corregir datos</button>}
        <button className={secondary} type="button" disabled={pending} onClick={close}>Cancelar</button>
      </div>
    </form>}
    {feedback.message && <p role={feedback.ok ? "status" : "alert"}
      className={`mt-3 rounded-lg p-3 text-sm ${feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
      {feedback.message}</p>}
  </div>;
}
