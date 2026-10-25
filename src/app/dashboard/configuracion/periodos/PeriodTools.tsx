"use client";

import { useActionState, useState } from "react";
import type { AcademicActionState } from "@/server/academic/guard";
import { createPeriodAction, deletePeriodAction, setCurrentPeriodAction, updatePeriodAction } from "@/server/actions/periods";

const primary = "min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const secondary = "min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60";
const danger = "min-h-11 rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const fieldClass = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500";
const empty: AcademicActionState = { ok: false, message: "" };

type FormAction = (state: AcademicActionState, formData: FormData) => Promise<AcademicActionState>;
export type PeriodRange = { id: string; name: string; startDate: string; endDate: string };

function Notice({ ok, message }: { ok: boolean; message: string }) {
  if (!message) return null;
  return <p role={ok ? "status" : "alert"} className={`mt-3 rounded-lg p-3 text-sm ${ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{message}</p>;
}

/**
 * Crear (sin `period`) o editar nombre y fechas. Avisa mientras se escribe si la fecha final
 * queda antes del inicio (no deja guardar) o si las fechas se cruzan con otro período (sí deja).
 */
export function PeriodForm({ period, others, startOpen = false }: { period?: PeriodRange; others: PeriodRange[]; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [name, setName] = useState(period?.name ?? "");
  const [startDate, setStartDate] = useState(period?.startDate ?? "");
  const [endDate, setEndDate] = useState(period?.endDate ?? "");
  const [state, action, pending] = useActionState(async (previous: AcademicActionState, data: FormData) => {
    const result = period ? await updatePeriodAction(previous, data) : await createPeriodAction(previous, data);
    if (result.ok) {
      setOpen(false);
      if (!period) {
        setName("");
        setStartDate("");
        setEndDate("");
      }
    }
    return result;
  }, empty);

  const inverted = Boolean(startDate && endDate && endDate < startDate);
  const crossing = startDate && endDate && !inverted
    ? others.filter((other) => other.id !== period?.id && startDate <= other.endDate && other.startDate <= endDate).map((other) => `«${other.name}»`)
    : [];

  if (!open) {
    return (
      <div>
        <button type="button" className={period ? secondary : primary} onClick={() => setOpen(true)}>{period ? "Editar nombre y fechas" : "Crear período"}</button>
        <Notice ok={state.ok} message={state.message} />
      </div>
    );
  }
  return (
    <form action={action} className="w-full space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      {period && <input type="hidden" name="periodId" value={period.id} />}
      <p className="font-semibold text-slate-950">{period ? "Editar período" : "Nuevo período"}</p>
      <label className="block text-sm font-medium text-slate-900">
        Nombre del período
        <input name="name" value={name} onChange={(event) => setName(event.target.value)} required minLength={3} maxLength={100} className={fieldClass} placeholder="Ejemplo: Enero–Abril 2027" autoComplete="off" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-900">
          Empieza el
          <input type="date" name="startDate" value={startDate} onChange={(event) => setStartDate(event.target.value)} required className={fieldClass} />
        </label>
        <label className="block text-sm font-medium text-slate-900">
          Termina el
          <input type="date" name="endDate" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} required className={fieldClass} />
        </label>
      </div>
      {inverted && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">La fecha final no puede ser anterior a la fecha de inicio.</p>}
      {crossing.length > 0 && (
        <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Estas fechas se cruzan con {crossing.join(", ")}. Puedes guardarlo así si es lo que quieres.
        </p>
      )}
      {period && <p className="text-sm text-slate-600">Cambiar las fechas no mueve ni borra los cursos de este período.</p>}
      <div className="flex flex-wrap gap-2">
        <button className={primary} type="submit" disabled={pending || inverted}>{pending ? "Guardando…" : period ? "Guardar cambios" : "Crear período"}</button>
        <button className={secondary} type="button" disabled={pending} onClick={() => setOpen(false)}>Cancelar</button>
      </div>
      <Notice ok={state.ok} message={state.message} />
    </form>
  );
}

/** Botón que primero explica el impacto y pide confirmar. */
function ConfirmButton({ action, periodId, label, confirmLabel, pendingLabel, impact, tone }: { action: FormAction; periodId: string; label: string; confirmLabel: string; pendingLabel: string; impact: string; tone: "primary" | "danger" }) {
  const [asking, setAsking] = useState(false);
  const [state, formAction, pending] = useActionState(async (previous: AcademicActionState, data: FormData) => {
    const result = await action(previous, data);
    setAsking(false);
    return result;
  }, empty);
  if (!asking) {
    return (
      <div>
        <button type="button" className={secondary} onClick={() => setAsking(true)}>{label}</button>
        <Notice ok={state.ok} message={state.message} />
      </div>
    );
  }
  return (
    <form action={formAction} className="w-full rounded-lg bg-amber-50 p-3">
      <input type="hidden" name="periodId" value={periodId} />
      <p className="text-sm font-semibold text-amber-900">{impact}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="submit" className={tone === "danger" ? danger : primary} disabled={pending}>{pending ? pendingLabel : confirmLabel}</button>
        <button type="button" className={secondary} disabled={pending} onClick={() => setAsking(false)}>Cancelar</button>
      </div>
    </form>
  );
}

export function MarkCurrentButton({ periodId, name, currentName }: { periodId: string; name: string; currentName: string | null }) {
  const impact = currentName
    ? `Solo puede haber un período actual. «${name}» pasará a ser el actual y «${currentName}» dejará de serlo. Los cursos de los dos períodos siguen igual.`
    : `«${name}» pasará a ser el período actual. Los cursos no cambian.`;
  return <ConfirmButton action={setCurrentPeriodAction} periodId={periodId} label="Marcar como período actual" confirmLabel="Sí, marcar como actual" pendingLabel="Marcando…" impact={impact} tone="primary" />;
}

export function DeletePeriodButton({ periodId, name, isCurrent }: { periodId: string; name: string; isCurrent: boolean }) {
  const impact = `¿Borrar «${name}»? No tiene cursos ni cobros, así que no se pierde nada más.${isCurrent ? " Es el período actual: después tendrás que marcar otro." : ""} No se puede deshacer.`;
  return <ConfirmButton action={deletePeriodAction} periodId={periodId} label="Borrar" confirmLabel="Sí, borrar" pendingLabel="Borrando…" impact={impact} tone="danger" />;
}
