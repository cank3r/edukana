"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { deleteScheduleSlotAction, saveScheduleSlotAction, type ScheduleActionState } from "@/server/actions/schedule";

const primary = "inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const secondary = "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60";
const danger = "inline-flex min-h-11 items-center justify-center rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const field = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500";
const label = "block text-sm font-medium text-slate-900";
const empty: ScheduleActionState = { ok: false, message: "" };
const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/** Envía sin que React vacíe el formulario: si hay un choque de horario, lo escrito se conserva para corregirlo. */
const keepValues = (action: (data: FormData) => void) => (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  startTransition(() => action(data));
};

export type SlotFormValues = { weekday: number; start: string; end: string; classroom: string; startsOn: string; endsOn: string };

function Notice({ state }: { state: ScheduleActionState }) {
  if (!state.message) return null;
  return (
    <div className="mt-3 space-y-2">
      <p role={state.ok ? "status" : "alert"} className={`rounded-lg p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p>
      {state.ok && state.warning && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{state.warning}</p>}
    </div>
  );
}

function SlotFields({ values, zoneLabel }: { values: SlotFormValues; zoneLabel: string }) {
  const hasDates = Boolean(values.startsOn || values.endsOn);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>
          Día
          <select name="weekday" defaultValue={values.weekday} required className={field}>
            {DAYS.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}
          </select>
        </label>
        <label className={label}>
          Empieza
          <input name="start" type="time" defaultValue={values.start} required className={field} />
        </label>
        <label className={label}>
          Termina
          <input name="end" type="time" defaultValue={values.end} required className={field} />
        </label>
      </div>
      <p className="text-xs text-slate-500">La hora es la de la institución ({zoneLabel}).</p>
      <label className={label}>
        Aula o lugar
        <input name="classroom" defaultValue={values.classroom} required maxLength={100} className={field} placeholder="Ejemplo: Aula 3, Laboratorio o Virtual" autoComplete="off" />
      </label>
      <details className="rounded-lg border border-slate-200 bg-white px-3" open={hasDates}>
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-slate-900">Fechas en que vale este bloque (opcional)</summary>
        <div className="grid gap-3 pb-3 sm:grid-cols-2">
          <label className={label}>
            Desde
            <input name="startsOn" type="date" defaultValue={values.startsOn} className={field} />
          </label>
          <label className={label}>
            Hasta
            <input name="endsOn" type="date" defaultValue={values.endsOn} className={field} />
          </label>
          <p className="text-xs text-slate-500 sm:col-span-2">Déjalas vacías si el bloque se repite todas las semanas sin fecha de fin.</p>
        </div>
      </details>
    </>
  );
}

/** Botón «Agregar bloque» que abre el formulario. */
export function AddSlot({ courseId, zoneLabel, startOpen }: { courseId: string; zoneLabel: string; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [formKey, setFormKey] = useState(0);
  const [state, action, pending] = useActionState(async (previous: ScheduleActionState, data: FormData) => {
    const result = await saveScheduleSlotAction(previous, data);
    if (result.ok) {
      setOpen(false);
      setFormKey((key) => key + 1);
    }
    return result;
  }, empty);
  return (
    <div>
      {!open && <button type="button" className={primary} onClick={() => setOpen(true)}>Agregar bloque</button>}
      {open && (
        <form key={formKey} onSubmit={keepValues(action)} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="text-lg font-bold text-slate-950">Agregar bloque al horario</h2>
          <input type="hidden" name="courseId" value={courseId} />
          <SlotFields values={{ weekday: 1, start: "", end: "", classroom: "", startsOn: "", endsOn: "" }} zoneLabel={zoneLabel} />
          <div className="flex flex-wrap gap-2">
            <button className={primary} type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar bloque"}</button>
            <button className={secondary} type="button" disabled={pending} onClick={() => setOpen(false)}>Cancelar</button>
          </div>
          {!state.ok && <Notice state={state} />}
        </form>
      )}
      {state.ok && <Notice state={state} />}
    </div>
  );
}

/** Editar y borrar (con confirmación) un bloque. Solo se muestra a quien gestiona el curso. */
export function ManageSlot({ courseId, slotId, values, summary, zoneLabel }: { courseId: string; slotId: string; values: SlotFormValues; summary: string; zoneLabel: string }) {
  const [mode, setMode] = useState<"idle" | "editing" | "deleting">("idle");
  const [editState, editAction, editPending] = useActionState(async (previous: ScheduleActionState, data: FormData) => {
    const result = await saveScheduleSlotAction(previous, data);
    if (result.ok) setMode("idle");
    return result;
  }, empty);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteScheduleSlotAction, empty);
  return (
    <div className="mt-3">
      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondary} onClick={() => setMode("editing")}>Editar</button>
          <button type="button" className={secondary} onClick={() => setMode("deleting")}>Borrar</button>
        </div>
      )}
      {mode === "editing" && (
        <form onSubmit={keepValues(editAction)} className="space-y-3 rounded-lg bg-slate-50 p-4">
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="slotId" value={slotId} />
          <SlotFields values={values} zoneLabel={zoneLabel} />
          <div className="flex flex-wrap gap-2">
            <button className={primary} type="submit" disabled={editPending}>{editPending ? "Guardando…" : "Guardar cambios"}</button>
            <button className={secondary} type="button" disabled={editPending} onClick={() => setMode("idle")}>Cancelar</button>
          </div>
        </form>
      )}
      {mode === "deleting" && (
        <form action={deleteAction} className="rounded-lg bg-amber-50 p-4" role="alertdialog" aria-label="Confirmar borrado del bloque">
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="slotId" value={slotId} />
          <p className="text-sm font-semibold text-amber-900">
            Se borrará el bloque del {summary}. Dejará de aparecer en el horario del curso y en el horario semanal de sus estudiantes y docente. No se puede deshacer. La asistencia ya tomada no cambia.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={danger} type="submit" disabled={deletePending}>{deletePending ? "Borrando…" : "Sí, borrar bloque"}</button>
            <button className={secondary} type="button" disabled={deletePending} onClick={() => setMode("idle")}>Cancelar</button>
          </div>
        </form>
      )}
      <Notice state={editState} />
      {!deleteState.ok && <Notice state={deleteState} />}
    </div>
  );
}
