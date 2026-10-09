"use client";

import { useActionState, useState } from "react";
import { activateGuardianship, createGuardianship, revokeGuardianship, updateGuardianship, type GuardianshipActionState } from "@/app/dashboard/configuracion/tutores/actions";
import type { Capability } from "@/lib/capabilities";
import { GUARDIAN_FLAGS, GUARDIAN_FLAG_CAPABILITY, type GuardianFlag, type GuardianFlagValues } from "@/lib/guardianship-policy";

const initial: GuardianshipActionState = { ok: false, message: "" };
const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500";
const labels = { MOTHER: "Madre", FATHER: "Padre", LEGAL_GUARDIAN: "Tutor legal", OTHER: "Otro vínculo autorizado" } as const;
const status = { PENDING: "Pendiente", ACTIVE: "Activo", REVOKED: "Revocado" } as const;
const flagLabels: Record<GuardianFlag, string> = {
  canViewAcademics: "Académico y calificaciones publicadas",
  canViewAttendance: "Asistencia",
  canViewSchedule: "Horario",
  canViewAnnouncements: "Avisos relevantes",
  canViewFinance: "Finanzas del estudiante",
};
type UserOption = { id: string; name: string; email: string };
type LinkItem = GuardianFlagValues & {
  id: string; relationship: keyof typeof labels; status: keyof typeof status;
  parent: UserOption; student: UserOption;
};

function Feedback({ state }: { state: GuardianshipActionState }) {
  return state.message ? <p role="status" className={`rounded-lg p-2 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p> : null;
}

function FlagFields({ values, managerCapabilities, onChange, submitNames = false }: { values?: GuardianFlagValues; managerCapabilities: Capability[]; onChange?: (flag: GuardianFlag, value: boolean) => void; submitNames?: boolean }) {
  const allowed = new Set(managerCapabilities);
  return <div className="grid gap-2 sm:grid-cols-2">{GUARDIAN_FLAGS.map((flag) => {
    const authorized = allowed.has(GUARDIAN_FLAG_CAPABILITY[flag]);
    return <label className={`text-sm ${flag === "canViewFinance" ? "font-semibold text-amber-800" : ""} ${authorized ? "" : "cursor-not-allowed opacity-50"}`} key={flag}><input className="mr-2" type="checkbox" name={submitNames ? flag : undefined} checked={values?.[flag]} defaultChecked={values ? undefined : false} disabled={!authorized} onChange={onChange ? (event) => onChange(flag, event.target.checked) : undefined} />{flagLabels[flag]}</label>;
  })}</div>;
}

export function GuardianshipManager({ parents, students, links, managerCapabilities }: { parents: UserOption[]; students: UserOption[]; links: LinkItem[]; managerCapabilities: Capability[] }) {
  const [createState, createAction, createPending] = useActionState(createGuardianship, initial);
  return <div className="space-y-6">
    <form action={createAction} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5" onSubmit={(event) => { const form = new FormData(event.currentTarget); if (form.get("canViewFinance") && !window.confirm("¿Confirmas autorizar acceso financiero para este vínculo?")) event.preventDefault(); }}>
      <div><h2 className="font-bold text-slate-900">Nuevo vínculo pendiente</h2><p className="text-sm text-slate-500">Crear no concede acceso. Un administrador debe activarlo después.</p></div>
      <div className="grid gap-3 md:grid-cols-3"><label className="text-sm font-medium">Tutor<select className={`${input} mt-1`} name="parentId" required defaultValue=""><option value="" disabled>Seleccionar tutor</option>{parents.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select></label><label className="text-sm font-medium">Estudiante<select className={`${input} mt-1`} name="studentId" required defaultValue=""><option value="" disabled>Seleccionar estudiante</option>{students.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select></label><label className="text-sm font-medium">Relación<select className={`${input} mt-1`} name="relationship" defaultValue="LEGAL_GUARDIAN">{Object.entries(labels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
      <FlagFields managerCapabilities={managerCapabilities} submitNames /><Feedback state={createState} /><button disabled={createPending || !parents.length || !students.length} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{createPending ? "Creando…" : "Crear pendiente"}</button>
    </form>
    <div className="space-y-4">{links.map((item) => <GuardianshipCard key={item.id} item={item} managerCapabilities={managerCapabilities} />)}{!links.length && <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">No hay vínculos registrados en esta institución.</p>}</div>
  </div>;
}

function GuardianshipCard({ item, managerCapabilities }: { item: LinkItem; managerCapabilities: Capability[] }) {
  const [updateState, updateAction, updatePending] = useActionState(updateGuardianship, initial);
  const [activateState, activateAction, activatePending] = useActionState(activateGuardianship, initial);
  const [revokeState, revokeAction, revokePending] = useActionState(revokeGuardianship, initial);
  const initialValues: GuardianFlagValues = { canViewAcademics: item.canViewAcademics, canViewAttendance: item.canViewAttendance, canViewSchedule: item.canViewSchedule, canViewAnnouncements: item.canViewAnnouncements, canViewFinance: item.canViewFinance };
  const [values, setValues] = useState(initialValues);
  const allowed = new Set(managerCapabilities);
  const changes = GUARDIAN_FLAGS.filter((flag) => allowed.has(GUARDIAN_FLAG_CAPABILITY[flag]) && values[flag] !== initialValues[flag]).map((flag) => ({ flag, enabled: values[flag] }));
  const missingActivationAuthority = GUARDIAN_FLAGS.filter((flag) => item[flag] && !allowed.has(GUARDIAN_FLAG_CAPABILITY[flag]));
  return <article className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold">{item.parent.name} → {item.student.name}</h2><p className="text-sm text-slate-500">{labels[item.relationship]} · {status[item.status]}</p></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : item.status === "PENDING" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{status[item.status]}</span></div>
    <form action={updateAction} className="mt-4 space-y-3" onSubmit={(event) => { if (changes.some((change) => change.flag === "canViewFinance" && change.enabled) && !window.confirm("¿Confirmas habilitar finanzas para este vínculo activo o pendiente?")) event.preventDefault(); }}><input type="hidden" name="id" value={item.id} /><input type="hidden" name="changes" value={JSON.stringify(changes)} /><FlagFields values={values} managerCapabilities={managerCapabilities} onChange={(flag, value) => setValues((current) => ({ ...current, [flag]: value }))} /><Feedback state={updateState} /><button disabled={updatePending || item.status === "REVOKED" || changes.length === 0} className="rounded-lg border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-700 disabled:opacity-50">{updatePending ? "Guardando…" : "Guardar permisos"}</button></form>
    {missingActivationAuthority.length > 0 && item.status === "PENDING" && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">No puedes activar este vínculo porque incluye áreas que tus permisos no cubren.</p>}
    <div className="mt-4 flex flex-wrap gap-2">{item.status === "PENDING" && <form action={activateAction} onSubmit={(event) => { if (!window.confirm("¿Confirmas activar este vínculo y sus permisos configurados?")) event.preventDefault(); }}><input type="hidden" name="id" value={item.id} /><button disabled={activatePending || missingActivationAuthority.length > 0} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{activatePending ? "Activando…" : "Activar vínculo"}</button></form>}{item.status !== "REVOKED" && <form action={revokeAction} onSubmit={(event) => { if (!window.confirm("¿Confirmas revocar inmediatamente todo acceso de este tutor al estudiante?")) event.preventDefault(); }}><input type="hidden" name="id" value={item.id} /><button disabled={revokePending} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white">{revokePending ? "Revocando…" : "Revocar vínculo"}</button></form>}</div><Feedback state={activateState} /><Feedback state={revokeState} />
  </article>;
}
