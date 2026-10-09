"use client";

import { useActionState, useEffect, useState } from "react";
import { createLiveClassAction, deleteLiveClassAction, updateLiveClassAction, type LiveClassActionState } from "@/server/actions/live-classes";
import { liveClassPhase, safeJoinUrl } from "./phase";

const primary = "inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const secondary = "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60";
const danger = "inline-flex min-h-11 items-center justify-center rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const field = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500";
const label = "block text-sm font-medium text-slate-900";
const empty: LiveClassActionState = { ok: false, message: "" };

function Notice({ state }: { state: LiveClassActionState }) {
  if (!state.message) return null;
  return (
    <div className="mt-3 space-y-2">
      <p role={state.ok ? "status" : "alert"} className={`rounded-lg p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p>
      {state.ok && state.warning && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{state.warning}</p>}
    </div>
  );
}

export type ClassView = {
  id: string;
  title: string;
  description: string;
  startsAtMs: number;
  durationMinutes: number;
  joinUrl: string;
  /** Textos ya escritos en la zona horaria de la institución. */
  dayLabel: string;
  timeLabel: string;
  dateValue: string;
  timeValue: string;
};

type FormDefaults = { title: string; date: string; time: string; durationMinutes: number; joinUrl: string; description: string };

function ClassFields({ defaults, durations, minDate, zoneLabel }: { defaults: FormDefaults; durations: readonly number[]; minDate?: string; zoneLabel: string }) {
  const options = durations.includes(defaults.durationMinutes) ? durations : [...durations, defaults.durationMinutes].sort((a, b) => a - b);
  return (
    <>
      <label className={label}>
        Título
        <input name="title" defaultValue={defaults.title} required minLength={3} maxLength={120} className={field} placeholder="Ejemplo: Repaso de la unidad 2" autoComplete="off" />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>
          Fecha
          <input name="date" type="date" defaultValue={defaults.date} min={minDate} required className={field} />
        </label>
        <label className={label}>
          Hora de inicio
          <input name="time" type="time" defaultValue={defaults.time} required className={field} />
        </label>
        <label className={label}>
          Duración
          <select name="durationMinutes" defaultValue={defaults.durationMinutes} className={field}>
            {options.map((minutes) => <option key={minutes} value={minutes}>{minutes} minutos</option>)}
          </select>
        </label>
      </div>
      <p className="text-xs text-slate-500">La hora es la de la institución ({zoneLabel}).</p>
      <label className={label}>
        Enlace de la reunión
        <input name="joinUrl" type="url" inputMode="url" defaultValue={defaults.joinUrl} required maxLength={1000} pattern="https://.+" title="El enlace debe empezar con https://" className={field} placeholder="https://…" autoComplete="off" />
        <span className="mt-1 block text-xs font-normal text-slate-500">Crea la reunión en Zoom, Meet o Teams y pega aquí el enlace para invitados.</span>
      </label>
      <label className={label}>
        Nota para los estudiantes (opcional)
        <textarea name="description" defaultValue={defaults.description} maxLength={1000} rows={2} className={`${field} py-2`} placeholder="Ejemplo: traigan el ejercicio 3 resuelto" />
      </label>
    </>
  );
}

/** Botón «Programar clase» que abre el formulario. Permite repetir la clase cada semana. */
export function ScheduleClass({ courseId, durations, maxWeeks, minDate, zoneLabel, startOpen }: { courseId: string; durations: readonly number[]; maxWeeks: number; minDate: string; zoneLabel: string; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [state, action, pending] = useActionState(async (previous: LiveClassActionState, data: FormData) => {
    const result = await createLiveClassAction(previous, data);
    if (result.ok) setOpen(false);
    return result;
  }, empty);
  return (
    <div>
      {!open && <button type="button" className={primary} onClick={() => setOpen(true)}>Programar clase</button>}
      {open && (
        <form action={action} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="text-lg font-bold text-slate-950">Programar clase</h2>
          <input type="hidden" name="courseId" value={courseId} />
          <ClassFields defaults={{ title: "", date: "", time: "", durationMinutes: 60, joinUrl: "", description: "" }} durations={durations} minDate={minDate} zoneLabel={zoneLabel} />
          <label className={label}>
            Repetir cada semana durante
            <span className="mt-1 flex items-center gap-2">
              <input name="weeks" type="number" inputMode="numeric" min={1} max={maxWeeks} defaultValue={1} required className={`${field} mt-0 w-24`} />
              <span className="font-normal text-slate-700">semanas</span>
            </span>
            <span className="mt-1 block text-xs font-normal text-slate-500">Deja 1 para una sola clase. Con más, se crea una clase por semana el mismo día y a la misma hora; después puedes cambiar o borrar cada una por separado.</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button className={primary} type="submit" disabled={pending}>{pending ? "Guardando…" : "Programar clase"}</button>
            <button className={secondary} type="button" disabled={pending} onClick={() => setOpen(false)}>Cancelar</button>
          </div>
          {!state.ok && <Notice state={state} />}
        </form>
      )}
      {state.ok && <Notice state={state} />}
    </div>
  );
}

/** Hora actual que avanza sola, para que el botón de entrar se habilite sin recargar la página. */
function useNow(initialNowMs: number) {
  const [now, setNow] = useState(initialNowMs);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** «Entrar a clase» desde 15 minutos antes y hasta que termina; antes dice cuándo empieza y después «Terminó». */
export function JoinClass({ item, initialNowMs }: { item: Pick<ClassView, "startsAtMs" | "durationMinutes" | "joinUrl" | "dayLabel" | "timeLabel">; initialNowMs: number }) {
  const now = useNow(initialNowMs);
  const phase = liveClassPhase(item.startsAtMs, item.durationMinutes, now);
  const url = safeJoinUrl(item.joinUrl);
  if (phase === "ended") return <p className="text-sm font-semibold text-slate-500">Terminó</p>;
  if (phase === "before") return <p className="text-sm font-medium text-slate-700">Empieza el {item.dayLabel} a las {item.timeLabel}</p>;
  if (!url) return <p className="text-sm text-amber-800">El enlace de esta clase no es válido. Avisa a tu docente.</p>;
  return <a className={primary} href={url} target="_blank" rel="noopener noreferrer">Entrar a clase</a>;
}

/** Editar y borrar (con confirmación) una clase. Solo se muestra a quien gestiona el curso. */
export function ManageClass({ item, durations, zoneLabel }: { item: ClassView; durations: readonly number[]; zoneLabel: string }) {
  const [mode, setMode] = useState<"idle" | "editing" | "deleting">("idle");
  const [editState, editAction, editPending] = useActionState(async (previous: LiveClassActionState, data: FormData) => {
    const result = await updateLiveClassAction(previous, data);
    if (result.ok) setMode("idle");
    return result;
  }, empty);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteLiveClassAction, empty);
  return (
    <div className="mt-3">
      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondary} onClick={() => setMode("editing")}>Editar</button>
          <button type="button" className={secondary} onClick={() => setMode("deleting")}>Borrar</button>
        </div>
      )}
      {mode === "editing" && (
        <form action={editAction} className="space-y-3 rounded-lg bg-slate-50 p-4">
          <input type="hidden" name="id" value={item.id} />
          <ClassFields defaults={{ title: item.title, date: item.dateValue, time: item.timeValue, durationMinutes: item.durationMinutes, joinUrl: item.joinUrl, description: item.description }} durations={durations} zoneLabel={zoneLabel} />
          <div className="flex flex-wrap gap-2">
            <button className={primary} type="submit" disabled={editPending}>{editPending ? "Guardando…" : "Guardar cambios"}</button>
            <button className={secondary} type="button" disabled={editPending} onClick={() => setMode("idle")}>Cancelar</button>
          </div>
        </form>
      )}
      {mode === "deleting" && (
        <form action={deleteAction} className="rounded-lg bg-amber-50 p-4" role="alertdialog" aria-label="Confirmar borrado de la clase">
          <input type="hidden" name="id" value={item.id} />
          <p className="text-sm font-semibold text-amber-900">Se borrará «{item.title}» del {item.dayLabel} a las {item.timeLabel}. Los estudiantes dejarán de verla y no se puede deshacer. Las demás clases no cambian.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={danger} type="submit" disabled={deletePending}>{deletePending ? "Borrando…" : "Sí, borrar clase"}</button>
            <button className={secondary} type="button" disabled={deletePending} onClick={() => setMode("idle")}>Cancelar</button>
          </div>
        </form>
      )}
      <Notice state={editState} />
      {!deleteState.ok && <Notice state={deleteState} />}
    </div>
  );
}
