"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";
import type { ActionState } from "@/app/dashboard/actions";
import { saveScheduleSlot } from "@/app/dashboard/academico/actions";

// Solo queda el formulario del horario semanal que usa la portada del curso.
// Los demás formularios académicos viven junto a sus pantallas en `src/app/dashboard/aula/**`.

const initial: ActionState = { ok: false, message: "" };
const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500";
const button = "rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
type ServerAction = (state: ActionState, data: FormData) => Promise<ActionState>;

function Form({ action, children, submitLabel, pendingLabel = "Procesando…", className = "space-y-3" }: { action: ServerAction; children: ReactNode; submitLabel: string; pendingLabel?: string; className?: string }) {
  const [state, formAction, pending] = useActionState(action, initial);
  return <form action={formAction} className={className}>{children}<button type="submit" disabled={pending} className={button}>{pending ? pendingLabel : submitLabel}</button>{state.message && <p role="status" aria-live="polite" className={`rounded-lg p-2 text-sm ${state.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{state.message}</p>}</form>;
}
function Field({ label, name, type = "text", required, defaultValue, min, max, step }: { label: string; name: string; type?: string; required?: boolean; defaultValue?: string | number; min?: string; max?: string; step?: string }) {
  return <label className="block text-sm font-medium">{label}<input className={`${input} mt-1`} name={name} type={type} required={required} defaultValue={defaultValue} min={min} max={max} step={step} /></label>;
}
function Hidden({ name, value }: { name: string; value: string }) { return <input type="hidden" name={name} value={value} />; }

export function ScheduleForm({ courseId }: { courseId: string }) {
  return <Form action={saveScheduleSlot} submitLabel="Agregar bloque al horario"><Hidden name="courseId" value={courseId} /><div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium">Día<select className={`${input} mt-1`} name="weekday">{["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((day, i) => <option key={day} value={i + 1}>{day}</option>)}</select></label><Field label="Aula" name="classroom" required /><Field label="Inicio (minutos desde 00:00)" name="startMinutes" type="number" defaultValue={480} min="0" max="1439" /><Field label="Fin (minutos desde 00:00)" name="endMinutes" type="number" defaultValue={540} min="1" max="1440" /></div></Form>;
}
