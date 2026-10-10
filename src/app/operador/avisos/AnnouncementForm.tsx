"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { zonedDateKey, zonedTimeToUtc, zonedTimeValue } from "@/lib/timezone";
import { OPERATOR_TIME_ZONE } from "../format";
import { saveAnnouncementAction, endAnnouncementAction } from "./actions";

/** Valor de un campo `datetime-local` en hora de Santo Domingo a partir de un instante ISO. */
const localValue = (iso: string | null | undefined) => {
  if (!iso) return undefined;
  const instant = new Date(iso);
  return `${zonedDateKey(instant, OPERATOR_TIME_ZONE)}T${zonedTimeValue(instant, OPERATOR_TIME_ZONE)}`;
};

export type AnnouncementFormValue = {
  id: string; title: string; body: string; level: "INFO" | "WARNING"; audience: "ALL" | "ADMINS" | "INDEPENDENT";
  startsAt: string; endsAt: string | null;
};
const field = "min-h-11 w-full rounded-lg border border-slate-300 bg-white p-2";
export function AnnouncementForm({ initial }: { initial?: AnnouncementFormValue }) {
  const fieldId = useId();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  return <div className="space-y-6">
    <form aria-label={initial ? "Editar aviso" : "Crear aviso"} className="space-y-4 rounded-xl border bg-white p-4" action={(form) => {
      startTransition(async () => {
        // Los campos se escriben en hora de Santo Domingo; se envía el instante UTC exacto, sin depender
        // de la zona del servidor ni del dispositivo del operador.
        for (const key of ["startsAt", "endsAt"]) {
          const value = String(form.get(key) || "");
          if (!value) continue;
          const instant = zonedTimeToUtc(value.slice(0, 10), value.slice(11, 16), OPERATOR_TIME_ZONE);
          if (!instant) { setMessage("Revisa las fechas: usa día y hora válidos."); return; }
          form.set(key, instant.toISOString());
        }
        try {
          const result = await saveAnnouncementAction(form);
          if (!result.ok) { setMessage(result.message); return; }
          router.push("/operador/avisos?guardado=1"); router.refresh();
        } catch { setMessage("No se pudo guardar. Revisa tu conexión e inténtalo de nuevo."); }
      });
    }}>
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <label className="block">Título<input className={field} name="title" required minLength={3} maxLength={160}
        defaultValue={initial?.title} /></label>
      <div><label htmlFor={`${fieldId}-body`} className="block">Mensaje</label>
        <textarea id={`${fieldId}-body`} className={field} name="body" rows={5} required maxLength={4000}
        defaultValue={initial?.body} /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor={`${fieldId}-level`}>Importancia</label>
          <select id={`${fieldId}-level`} name="level" className={field} defaultValue={initial?.level ?? "INFO"}>
          <option value="INFO">Información</option><option value="WARNING">Importante</option>
        </select></div>
        <div><label htmlFor={`${fieldId}-audience`}>Quién lo verá</label>
          <select id={`${fieldId}-audience`} name="audience" className={field} defaultValue={initial?.audience ?? "ALL"}>
          <option value="ALL">Todas las personas</option><option value="ADMINS">Administradores</option>
          <option value="INDEPENDENT">Docentes independientes</option>
        </select></div>
        <label>Inicio<input type="datetime-local" name="startsAt" className={field} required
          defaultValue={localValue(initial?.startsAt)} /></label>
        <label>Fin (opcional)<input type="datetime-local" name="endsAt" className={field}
          defaultValue={localValue(initial?.endsAt)} /></label>
      </div>
      <p className="text-sm text-slate-600">Las horas son de Santo Domingo. Sin fecha de fin, se mostrará hasta que lo termines.</p>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="confirmed" value="yes" required />
        Confirmo que el mensaje se mostrará a la audiencia elegida durante estas fechas.</label>
      <button disabled={pending} className="min-h-11 rounded-lg bg-blue-700 px-4 text-white disabled:opacity-50">
        {pending ? "Guardando…" : initial ? "Guardar cambios" : "Crear aviso"}</button>
    </form>
    {initial && <form aria-label="Terminar aviso" className="space-y-3 rounded-xl border bg-white p-4" action={(form) => {
      startTransition(async () => {
        try {
          const result = await endAnnouncementAction(form);
          if (!result.ok) { setMessage(result.message); return; }
          router.push("/operador/avisos?terminado=1"); router.refresh();
        } catch { setMessage("No se pudo terminar. Revisa tu conexión e inténtalo de nuevo."); }
      });
    }}>
      <input type="hidden" name="id" value={initial.id} />
      <h2 className="font-semibold">Terminar aviso</h2>
      <p className="text-sm">Dejará de mostrarse. También cancela un aviso que todavía no comenzó.</p>
      <label className="block">Escribe el título para confirmar: {initial.title}
        <input name="confirmation" className={field} required autoComplete="off" /></label>
      <button disabled={pending} className="min-h-11 rounded-lg border border-red-300 px-4 text-red-800">Terminar aviso</button>
    </form>}
    {message && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">{message}</p>}
  </div>;
}
