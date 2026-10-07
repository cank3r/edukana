"use client";

import { useActionState } from "react";
import { createAcademicPeriod, createPilotUser, type OnboardingState } from "@/app/dashboard/configuracion/puesta-en-marcha/actions";

const initial: OnboardingState = { ok: false, message: "" };
const input = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500";

function Feedback({ state }: { state: OnboardingState }) {
  return state.message ? <p aria-live="polite" className={`rounded-lg p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p> : null;
}

export function PilotUserForm() {
  const [state, action, pending] = useActionState(createPilotUser, initial);
  return <form action={action} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-bold">Crear cuenta</h2><label className="block text-sm font-medium">Nombre completo<input className={input} name="name" required maxLength={120} /></label><label className="block text-sm font-medium">Correo<input className={input} name="email" required type="email" maxLength={200} /></label><label className="block text-sm font-medium">Rol<select className={input} name="role" defaultValue="TEACHER"><option value="TEACHER">Docente</option><option value="STUDENT">Estudiante</option><option value="PARENT">Tutor</option></select></label><label className="block text-sm font-medium">Contraseña temporal<input className={input} name="password" required type="password" minLength={10} maxLength={200} /><span className="mt-1 block text-xs text-slate-500">Mínimo 10 caracteres, una letra y un número.</span></label><button className="min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">{pending ? "Creando…" : "Crear usuario"}</button><Feedback state={state} /></form>;
}

export function AcademicPeriodForm() {
  const [state, action, pending] = useActionState(createAcademicPeriod, initial);
  return <form action={action} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-bold">Crear período académico</h2><label className="block text-sm font-medium">Nombre<input className={input} name="name" required maxLength={100} placeholder="Año escolar 2026–2027" /></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium">Inicio<input className={input} name="startDate" required type="date" /></label><label className="block text-sm font-medium">Fin<input className={input} name="endDate" required type="date" /></label></div><button className="min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">{pending ? "Creando…" : "Crear período"}</button><Feedback state={state} /></form>;
}
