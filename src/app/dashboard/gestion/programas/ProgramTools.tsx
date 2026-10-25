"use client";

import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState } from "react";
import type { AcademicActionState } from "@/server/academic/guard";
import { createProgramAction, updateProgramAction } from "@/server/actions/programs";

export const primary = "min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
export const secondary = "min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60";
export const danger = "min-h-11 rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
export const fieldClass = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500";
const empty: AcademicActionState = { ok: false, message: "" };

type FormAction = (state: AcademicActionState, formData: FormData) => Promise<AcademicActionState>;

export function Notice({ ok, message }: { ok: boolean; message: string }) {
  if (!message) return null;
  return <p role={ok ? "status" : "alert"} className={`mt-3 rounded-lg p-3 text-sm ${ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{message}</p>;
}

/** Crear (sin `program`) o editar un programa. Al crear lleva al detalle para agregar cursos. */
export function ProgramForm({ program, startOpen = false }: { program?: { id: string; name: string; description: string; isPublished: boolean }; startOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [state, action, pending] = useActionState(async (previous: AcademicActionState, data: FormData) => {
    const result = program ? await updateProgramAction(previous, data) : await createProgramAction(previous, data);
    if (result.ok) {
      setOpen(false);
      if (!program && result.id) router.push(`/dashboard/gestion/programas/${result.id}`);
    }
    return result;
  }, empty);

  if (!open) {
    return (
      <div>
        <button type="button" className={program ? secondary : primary} onClick={() => setOpen(true)}>{program ? "Editar nombre y descripción" : "Crear programa"}</button>
        {program && <Notice ok={state.ok} message={state.message} />}
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      {program && <input type="hidden" name="programId" value={program.id} />}
      <label className="block text-sm font-medium text-slate-900">
        Nombre del programa
        <input name="name" defaultValue={program?.name ?? ""} required minLength={3} maxLength={120} className={fieldClass} placeholder="Ejemplo: Técnico en Enfermería" autoComplete="off" />
      </label>
      <label className="block text-sm font-medium text-slate-900">
        Descripción (opcional)
        <textarea name="description" defaultValue={program?.description ?? ""} maxLength={1000} rows={3} className={`${fieldClass} py-2`} />
      </label>
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-900">
        <input type="checkbox" name="isPublished" defaultChecked={program?.isPublished ?? true} className="h-5 w-5" />
        Se puede elegir al crear grupos
      </label>
      <div className="flex flex-wrap gap-2">
        <button className={primary} type="submit" disabled={pending}>{pending ? "Guardando…" : program ? "Guardar cambios" : "Crear programa"}</button>
        <button className={secondary} type="button" disabled={pending} onClick={() => setOpen(false)}>Cancelar</button>
      </div>
      <Notice ok={state.ok} message={state.message} />
    </form>
  );
}

/** Botón de una fila (Subir, Bajar, Quitar…) que envía campos ocultos. Con `confirm` pregunta antes. */
export function RowButton({ action, fields, label, pendingLabel, confirm, disabled = false }: { action: FormAction; fields: Record<string, string>; label: string; pendingLabel: string; confirm?: string; disabled?: boolean }) {
  const [state, formAction, pending] = useActionState(action, empty);
  const [asking, setAsking] = useState(false);
  const hidden = Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />);
  if (confirm && !asking) {
    return (
      <div>
        <button type="button" className={secondary} disabled={disabled || pending} onClick={() => setAsking(true)}>{pending ? pendingLabel : label}</button>
        {!state.ok && <Notice ok={false} message={state.message} />}
      </div>
    );
  }
  return (
    <form action={formAction} className={confirm ? "w-full rounded-lg bg-amber-50 p-3" : undefined}>
      {hidden}
      {confirm && <p className="text-sm font-semibold text-amber-900">{confirm}</p>}
      <div className={confirm ? "mt-2 flex flex-wrap gap-2" : undefined}>
        <button type="submit" className={confirm ? danger : secondary} disabled={disabled || pending}>{pending ? pendingLabel : confirm ? `Sí, ${label.toLowerCase()}` : label}</button>
        {confirm && <button type="button" className={secondary} onClick={() => setAsking(false)}>Cancelar</button>}
      </div>
      {!state.ok && <Notice ok={false} message={state.message} />}
    </form>
  );
}

export type PickOption = { id: string; label: string; detail?: string };

/**
 * Lista con casillas para elegir varios (cursos o estudiantes) y agregarlos de una vez.
 * `submitMany` lleva `{n}` donde va la cantidad elegida.
 * `filterable` añade un filtro en la misma pantalla; úsalo cuando la lista ya viene completa.
 */
export function PickAndAdd({ action, fields, name, options, submitOne, submitMany, emptyText, filterable = false, limit }: { action: FormAction; fields: Record<string, string>; name: string; options: PickOption[]; submitOne: string; submitMany: string; emptyText: string; filterable?: boolean; limit?: number | null }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [state, formAction, pending] = useActionState(async (previous: AcademicActionState, data: FormData) => {
    const result = await action(previous, data);
    if (result.ok) setSelected([]);
    return result;
  }, empty);
  const visible = useMemo(() => {
    const text = filter.trim().toLowerCase();
    return text ? options.filter((option) => `${option.label} ${option.detail ?? ""}`.toLowerCase().includes(text)) : options;
  }, [filter, options]);
  // Lo elegido que ya no está en la lista (porque se agregó) no cuenta.
  const chosen = selected.filter((id) => options.some((option) => option.id === id));
  const over = limit != null && chosen.length > limit;

  if (options.length === 0) return <><p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">{emptyText}</p><Notice ok={state.ok} message={state.message} /></>;
  return (
    <form action={formAction} className="mt-3">
      {Object.entries(fields).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
      {chosen.map((id) => <input key={id} type="hidden" name={name} value={id} />)}
      {filterable && options.length > 8 && (
        <label className="block text-sm font-medium text-slate-900">
          Filtrar la lista
          <input value={filter} onChange={(event) => setFilter(event.target.value)} className={fieldClass} placeholder="Escribe parte del nombre…" autoComplete="off" />
        </label>
      )}
      <ul className="mt-2 max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">
        {visible.length === 0 && <li className="p-3 text-sm text-slate-600">Nada coincide con ese filtro.</li>}
        {visible.map((option) => (
          <li key={option.id}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2">
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0"
                checked={chosen.includes(option.id)}
                onChange={(event) => setSelected((current) => (event.target.checked ? [...current, option.id] : current.filter((id) => id !== option.id)))}
              />
              <span className="min-w-0">
                <span className="block truncate font-medium text-slate-950">{option.label}</span>
                {option.detail && <span className="block truncate text-sm text-slate-600">{option.detail}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {over && <p className="mt-2 text-sm font-semibold text-red-700" role="alert">Elegiste {chosen.length} y solo {limit === 1 ? "queda 1 cupo" : `quedan ${limit} cupos`}.</p>}
      <button type="submit" className={`${secondary} mt-3`} disabled={pending || chosen.length === 0 || over}>{pending ? "Agregando…" : chosen.length <= 1 ? submitOne : submitMany.replace("{n}", String(chosen.length))}</button>
      <Notice ok={state.ok} message={state.message} />
    </form>
  );
}

/** Borrado con confirmación que dice el impacto; al terminar vuelve a la lista. */
export function DeleteWithImpact({ action, fields, label, impact, backTo }: { action: FormAction; fields: Record<string, string>; label: string; impact: string[]; backTo: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [state, formAction, pending] = useActionState(async (previous: AcademicActionState, data: FormData) => {
    const result = await action(previous, data);
    if (result.ok) router.push(backTo);
    return result;
  }, empty);
  if (!asking) return <button type="button" className={secondary} onClick={() => setAsking(true)}>{label}</button>;
  return (
    <form action={formAction} className="rounded-lg bg-amber-50 p-4" role="alertdialog" aria-label={`Confirmar: ${label}`}>
      {Object.entries(fields).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
      <p className="text-sm font-semibold text-amber-900">Esto es lo que va a pasar:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
        {impact.map((line) => <li key={line}>{line}</li>)}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={danger} type="submit" disabled={pending}>{pending ? "Borrando…" : `Sí, ${label.toLowerCase()}`}</button>
        <button className={secondary} type="button" disabled={pending} onClick={() => setAsking(false)}>Cancelar</button>
      </div>
      {!state.ok && <Notice ok={false} message={state.message} />}
    </form>
  );
}
