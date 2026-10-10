"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAnnouncementAction, endAnnouncementAction } from "./actions";

export type AnnouncementFormValue = {
  id: string; title: string; body: string; level: "INFO" | "WARNING"; audience: "ALL" | "ADMINS" | "INDEPENDENT";
  startsAt: string; endsAt: string | null;
};
const field = "min-h-11 w-full rounded-lg border border-slate-300 bg-white p-2";
export function AnnouncementForm({ initial }: { initial?: AnnouncementFormValue }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  return <div className="space-y-6">
    <form aria-label={initial ? "Editar aviso" : "Crear aviso"} className="space-y-4 rounded-xl border bg-white p-4" action={(form) => {
      startTransition(async () => {
        // Inputs are explicitly UTC, so server and operator device zones cannot shift publication.
        for (const key of ["startsAt", "endsAt"]) {
          const value = String(form.get(key) || "");
          if (value) form.set(key, `${value}:00.000Z`);
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
      <label className="block">Mensaje<textarea className={field} name="body" rows={5} required maxLength={4000}
        defaultValue={initial?.body} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>Importancia<select name="level" className={field} defaultValue={initial?.level ?? "INFO"}>
          <option value="INFO">Información</option><option value="WARNING">Importante</option>
        </select></label>
        <label>Quién lo verá<select name="audience" className={field} defaultValue={initial?.audience ?? "ALL"}>
          <option value="ALL">Todas las personas</option><option value="ADMINS">Administradores</option>
          <option value="INDEPENDENT">Docentes independientes</option>
        </select></label>
        <label>Inicio (UTC)<input type="datetime-local" name="startsAt" className={field} required
          defaultValue={initial?.startsAt.slice(0, 16)} /></label>
        <label>Fin (UTC, opcional)<input type="datetime-local" name="endsAt" className={field}
          defaultValue={initial?.endsAt?.slice(0, 16)} /></label>
      </div>
      <p className="text-sm text-slate-600">Las fechas están en UTC. Sin fecha de fin, se mostrará hasta que lo termines.</p>
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
