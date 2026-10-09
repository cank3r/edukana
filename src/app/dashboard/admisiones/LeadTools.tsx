"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { convertLeadAction, createLeadAction, deleteLeadAction, moveLeadAction, updateLeadAction, type AdmissionActionState } from "@/server/actions/admissions";
import { SOURCE_SUGGESTIONS, STAGE_LABEL, STAGES, type Stage } from "./labels";

const primary = "min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const secondary = "min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60";
const danger = "min-h-11 rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const fieldClass = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500";
const labelClass = "block text-sm font-medium text-slate-900";
const empty: AdmissionActionState = { ok: false, message: "" };

function Notice({ ok, message }: { ok: boolean; message: string }) {
  if (!message) return null;
  return <p role={ok ? "status" : "alert"} className={`mt-3 rounded-lg p-3 text-sm ${ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{message}</p>;
}

type LeadValues = { id: string; name: string; email: string; phone: string; programInterest: string; source: string; notes: string };

/** Registrar (sin `lead`) o editar una solicitud. Al registrar lleva al detalle. */
export function LeadForm({ lead, programs, startOpen = false, emailLocked = false }: { lead?: LeadValues; programs: string[]; startOpen?: boolean; emailLocked?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [state, action, pending] = useActionState(async (previous: AdmissionActionState, data: FormData) => {
    const result = lead ? await updateLeadAction(previous, data) : await createLeadAction(previous, data);
    if (result.ok) {
      setOpen(false);
      if (!lead && result.id) router.push(`/dashboard/admisiones/${result.id}`);
      else router.refresh();
    }
    return result;
  }, empty);

  if (!open) {
    return (
      <div>
        <button type="button" className={lead ? secondary : primary} onClick={() => setOpen(true)}>{lead ? "Editar datos" : "Registrar solicitud"}</button>
        {lead && <Notice ok={state.ok} message={state.message} />}
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      {lead && <input type="hidden" name="leadId" value={lead.id} />}
      <label className={labelClass}>
        Nombre completo
        <input name="name" defaultValue={lead?.name ?? ""} required minLength={3} maxLength={120} className={fieldClass} autoComplete="off" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Correo
          <input type="email" name="email" defaultValue={lead?.email ?? ""} required maxLength={254} readOnly={emailLocked} className={`${fieldClass} ${emailLocked ? "bg-slate-100" : ""}`} placeholder="ana@correo.com" autoComplete="off" />
          {emailLocked && <span className="mt-1 block text-xs font-normal text-slate-600">Ya es estudiante: su correo se corrige en la ficha de la persona.</span>}
        </label>
        <label className={labelClass}>
          Teléfono (opcional)
          <input type="tel" name="phone" defaultValue={lead?.phone ?? ""} maxLength={30} className={fieldClass} autoComplete="off" />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Programa de interés (opcional)
          <input name="programInterest" defaultValue={lead?.programInterest ?? ""} maxLength={120} list="admisiones-programas" className={fieldClass} placeholder="Ejemplo: Técnico en Enfermería" autoComplete="off" />
        </label>
        <label className={labelClass}>
          ¿De dónde vino? (opcional)
          <input name="source" defaultValue={lead?.source ?? ""} maxLength={60} list="admisiones-origenes" className={fieldClass} placeholder="Ejemplo: Recomendación" autoComplete="off" />
        </label>
      </div>
      <datalist id="admisiones-programas">{programs.map((program) => <option key={program} value={program} />)}</datalist>
      <datalist id="admisiones-origenes">{SOURCE_SUGGESTIONS.map((source) => <option key={source} value={source} />)}</datalist>
      <label className={labelClass}>
        Notas (opcional)
        <textarea name="notes" defaultValue={lead?.notes ?? ""} maxLength={2000} rows={3} className={`${fieldClass} py-2`} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className={primary} type="submit" disabled={pending}>{pending ? "Guardando…" : lead ? "Guardar cambios" : "Registrar solicitud"}</button>
        <button className={secondary} type="button" disabled={pending} onClick={() => setOpen(false)}>Cancelar</button>
      </div>
      <Notice ok={state.ok} message={state.message} />
    </form>
  );
}

/** Botón principal del detalle: pasa la solicitud a la etapa indicada. */
export function AdvanceLead({ leadId, to, label }: { leadId: string; to: Stage; label: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (previous: AdmissionActionState, data: FormData) => {
    const result = await moveLeadAction(previous, data);
    if (result.ok) router.refresh();
    return result;
  }, empty);
  return (
    <form action={action}>
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="stage" value={to} />
      <button className={`${primary} w-full sm:w-auto`} type="submit" disabled={pending}>{pending ? "Guardando…" : label}</button>
      {!state.ok && <Notice ok={false} message={state.message} />}
    </form>
  );
}

/** Opción avanzada: llevar la solicitud a cualquier etapa abierta (sirve para devolverla). */
export function MoveLead({ leadId, stage }: { leadId: string; stage: Stage }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (previous: AdmissionActionState, data: FormData) => {
    const result = await moveLeadAction(previous, data);
    if (result.ok) router.refresh();
    return result;
  }, empty);
  const options = STAGES.filter((option) => option !== stage && option !== "ENROLLED" && option !== "REJECTED");
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="leadId" value={leadId} />
      <label className={labelClass}>
        Mover a otra etapa
        <select name="stage" defaultValue={options[0]} className={fieldClass}>
          {options.map((option) => <option key={option} value={option}>{STAGE_LABEL[option]}</option>)}
        </select>
      </label>
      <label className={labelClass}>
        Motivo (opcional)
        <input name="reason" maxLength={500} className={fieldClass} placeholder="Ejemplo: falta un documento" autoComplete="off" />
      </label>
      <button className={secondary} type="submit" disabled={pending}>{pending ? "Moviendo…" : "Mover"}</button>
      <Notice ok={state.ok} message={state.message} />
    </form>
  );
}

/** «No continúa»: pide el motivo antes de cerrar la solicitud. */
export function RejectLead({ leadId, name }: { leadId: string; name: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [state, action, pending] = useActionState(async (previous: AdmissionActionState, data: FormData) => {
    const result = await moveLeadAction(previous, data);
    if (result.ok) {
      setAsking(false);
      router.refresh();
    }
    return result;
  }, empty);
  if (!asking) return <button type="button" className={secondary} onClick={() => setAsking(true)}>No continúa</button>;
  return (
    <form action={action} className="w-full rounded-lg bg-amber-50 p-4 text-sm text-amber-900" role="alertdialog" aria-label="Confirmar que no continúa">
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="stage" value="REJECTED" />
      <p className="font-semibold">La solicitud de {name} se cerrará como «No continúa».</p>
      <p className="mt-1">No se borra: queda en el tablero con su motivo y se puede reabrir después.</p>
      <label className="mt-3 block font-medium">
        Motivo
        <input name="reason" required minLength={3} maxLength={500} className={fieldClass} placeholder="Ejemplo: eligió otra institución" autoComplete="off" />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={primary} type="submit" disabled={pending}>{pending ? "Guardando…" : "Sí, no continúa"}</button>
        <button className={secondary} type="button" disabled={pending} onClick={() => setAsking(false)}>Cancelar</button>
      </div>
      {!state.ok && <Notice ok={false} message={state.message} />}
    </form>
  );
}

/** Borrar con confirmación. Al borrar vuelve al tablero. */
export function DeleteLead({ leadId, name }: { leadId: string; name: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [state, action, pending] = useActionState(async (previous: AdmissionActionState, data: FormData) => {
    const result = await deleteLeadAction(previous, data);
    if (result.ok) router.push("/dashboard/admisiones");
    return result;
  }, empty);
  if (!asking) return <button type="button" className={secondary} onClick={() => setAsking(true)}>Borrar solicitud</button>;
  return (
    <form action={action} className="rounded-lg bg-red-50 p-4 text-sm text-red-900" role="alertdialog" aria-label="Confirmar borrado">
      <input type="hidden" name="leadId" value={leadId} />
      <p className="font-semibold">Se borrará la solicitud de {name}, con sus notas y su historial.</p>
      <p className="mt-1">No se puede deshacer. Si solo dejó de interesarse, usa «No continúa» para conservar el registro.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={danger} type="submit" disabled={pending}>{pending ? "Borrando…" : "Sí, borrar"}</button>
        <button className={secondary} type="button" disabled={pending} onClick={() => setAsking(false)}>Cancelar</button>
      </div>
      {!state.ok && <Notice ok={false} message={state.message} />}
    </form>
  );
}

type GroupOption = { id: string; name: string; seatsLeft: number | null };

/**
 * Convertir en estudiante. Muestra lo que va a pasar antes de confirmar.
 * Si el correo ya es de alguien de la institución (`existingName`), ofrece vincular en vez de crear.
 */
export function ConvertLead({ leadId, name, email, groups, existingName }: { leadId: string; name: string; email: string; groups: GroupOption[]; existingName: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [knownExisting, setKnownExisting] = useState(Boolean(existingName));
  const [invite, setInvite] = useState(!existingName);
  const [state, action, pending] = useActionState(async (previous: AdmissionActionState, data: FormData) => {
    const result = await convertLeadAction(previous, data);
    if (result.ok) {
      setOpen(false);
      router.refresh();
    } else if (result.code === "PERSON_EXISTS") {
      setKnownExisting(true);
      setInvite(false);
    }
    return result;
  }, empty);

  if (!open) {
    return (
      <div>
        <button type="button" className={`${primary} w-full sm:w-auto`} onClick={() => setOpen(true)}>Convertir en estudiante</button>
        <Notice ok={state.ok} message={state.ok ? state.message : ""} />
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <input type="hidden" name="leadId" value={leadId} />
      {knownExisting && <input type="hidden" name="link" value="1" />}
      <p className="font-semibold text-slate-950">Convertir a {name} en estudiante</p>
      {knownExisting ? (
        <p className="text-sm text-slate-700">
          El correo {email} ya es de {existingName ? <strong>{existingName}</strong> : "una persona"} en tu institución. No se creará otra persona: esta solicitud quedará vinculada con ella y pasará a «Inscrito».
        </p>
      ) : (
        <p className="text-sm text-slate-700">Se creará a la persona en tu institución como estudiante, con el correo {email}, y la solicitud pasará a «Inscrito».</p>
      )}
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-900">
        <input type="checkbox" name="invite" checked={invite} onChange={(event) => setInvite(event.target.checked)} className="h-5 w-5" />
        Enviarle la invitación ahora (un correo para crear su contraseña)
      </label>
      {groups.length > 0 && (
        <label className={labelClass}>
          Agregar a un grupo (opcional)
          <select name="groupId" value={groupId} onChange={(event) => setGroupId(event.target.value)} className={fieldClass}>
            <option value="">Sin grupo por ahora</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id} disabled={group.seatsLeft === 0}>
                {group.name}{group.seatsLeft === null ? "" : group.seatsLeft === 0 ? " — lleno" : group.seatsLeft === 1 ? " — queda 1 cupo" : ` — quedan ${group.seatsLeft} cupos`}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button className={primary} type="submit" disabled={pending}>{pending ? "Convirtiendo…" : knownExisting ? "Vincular con esa persona" : "Sí, convertir en estudiante"}</button>
        <button className={secondary} type="button" disabled={pending} onClick={() => setOpen(false)}>Cancelar</button>
      </div>
      {!state.ok && <Notice ok={false} message={state.message} />}
    </form>
  );
}
