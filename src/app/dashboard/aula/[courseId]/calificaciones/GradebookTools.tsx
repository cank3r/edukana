"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import {
  deleteManualItemAction,
  saveCategoriesAction,
  saveGradeAction,
  saveManualItemAction,
  setItemPublishedAction,
  setupSimpleGradingAction,
  type GradebookActionState,
} from "@/server/actions/gradebook";

const primary = "min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const secondary = "min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60";
const danger = "min-h-11 rounded-lg border border-red-300 bg-white px-4 py-2.5 font-semibold text-red-700 disabled:opacity-60";
const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500";
const empty: GradebookActionState = { ok: false, message: "" };

function Notice({ state }: { state: GradebookActionState }) {
  if (!state.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`mt-3 rounded-lg p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
      {state.message}
    </p>
  );
}

/** Arranque de un clic para un curso que aún no tiene cómo calificar. */
export function SimpleSetup({ courseId }: { courseId: string }) {
  const [state, action, pending] = useActionState(setupSimpleGradingAction, empty);
  return (
    <form action={action}>
      <input type="hidden" name="courseId" value={courseId} />
      <button className={primary} disabled={pending}>{pending ? "Preparando…" : "Usar configuración sencilla"}</button>
      <Notice state={state} />
    </form>
  );
}

export type CategoryOption = { id: string; label: string };

/** Crear o editar una actividad calificable manual. */
export function ItemForm({
  courseId,
  categories,
  item,
}: {
  courseId: string;
  categories: CategoryOption[];
  item?: { id: string; title: string; maxScore: number; categoryId: string };
}) {
  const [state, action, pending] = useActionState(saveManualItemAction, empty);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="gradeItemId" value={item?.id ?? ""} />
      <label className="block text-sm font-medium text-slate-900 sm:col-span-2">
        Título
        <input name="title" required maxLength={140} defaultValue={item?.title} placeholder="Por ejemplo: Exposición oral" className={field} />
      </label>
      <label className="block text-sm font-medium text-slate-900">
        Puntaje máximo
        <input name="maxScore" required inputMode="decimal" defaultValue={item?.maxScore ?? 100} className={field} />
      </label>
      {categories.length > 1 ? (
        <label className="block text-sm font-medium text-slate-900">
          Categoría
          <select name="categoryId" required defaultValue={item?.categoryId ?? categories[0]?.id} className={field}>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
          </select>
        </label>
      ) : (
        <input type="hidden" name="categoryId" value={categories[0]?.id ?? ""} />
      )}
      <div className="sm:col-span-2">
        <button className={primary} disabled={pending}>{pending ? "Guardando…" : item ? "Guardar cambios" : "Agregar actividad"}</button>
        <Notice state={state} />
      </div>
    </form>
  );
}

/** Publicar u ocultar las notas de una actividad, con confirmación que dice a quién afecta. */
export function PublishToggle({ courseId, itemId, published, gradedCount }: { courseId: string; itemId: string; published: boolean; gradedCount: number }) {
  const [state, action, pending] = useActionState(setItemPublishedAction, empty);
  const [confirming, setConfirming] = useState(false);
  const impact = published
    ? "Los estudiantes dejarán de ver esta nota y ya no contará en el promedio que ellos ven."
    : gradedCount === 0
      ? "Aún no hay notas puestas. Los estudiantes verán la actividad como pendiente de calificar."
      : `${gradedCount} ${gradedCount === 1 ? "estudiante verá su nota y su comentario" : "estudiantes verán su nota y su comentario"}.`;
  return (
    <form action={action} onSubmit={() => setConfirming(false)}>
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="gradeItemId" value={itemId} />
      <input type="hidden" name="published" value={published ? "false" : "true"} />
      {confirming ? (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <p>{impact}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className={primary} disabled={pending}>{published ? "Sí, ocultar" : "Sí, publicar"}</button>
            <button type="button" className={secondary} onClick={() => setConfirming(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button type="button" className={secondary} disabled={pending} onClick={() => setConfirming(true)}>
          {pending ? "Guardando…" : published ? "Ocultar notas" : "Publicar notas"}
        </button>
      )}
      <Notice state={state} />
    </form>
  );
}

/** Solo se ofrece borrar una actividad manual sin notas ni exoneraciones registradas. */
export function DeleteItem({ courseId, itemId, title, gradedCount }: { courseId: string; itemId: string; title: string; gradedCount: number }) {
  const [state, action, pending] = useActionState(deleteManualItemAction, empty);
  const [confirming, setConfirming] = useState(false);
  if (gradedCount > 0) {
    return (
      <p className="text-sm text-slate-600">
        No se puede borrar porque tiene notas, exoneraciones o historial. Puedes editar la actividad.
      </p>
    );
  }
  return (
    <form action={action}>
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="gradeItemId" value={itemId} />
      {confirming ? (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
          <p>
            Se borrará «{title}» solo si sigue sin notas, exoneraciones ni historial. No se puede deshacer.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className={danger} disabled={pending}>{pending ? "Borrando…" : "Sí, borrar"}</button>
            <button type="button" className={secondary} onClick={() => setConfirming(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button type="button" className={danger} disabled={pending} onClick={() => setConfirming(true)}>Borrar</button>
      )}
      <Notice state={state} />
    </form>
  );
}

type CategoryRow = { key: string; id: string; name: string; weight: string; itemCount: number };

/** Categorías de un período con sus pesos. Muestra la suma mientras se escribe. */
export function CategoryEditor({
  courseId,
  periodId,
  categories,
}: {
  courseId: string;
  periodId: string;
  categories: Array<{ id: string; name: string; weight: number; itemCount: number }>;
}) {
  const [state, action, pending] = useActionState(saveCategoriesAction, empty);
  const [rows, setRows] = useState<CategoryRow[]>(() =>
    categories.map((category) => ({ key: category.id, id: category.id, name: category.name, weight: String(category.weight), itemCount: category.itemCount })),
  );
  const [nextKey, setNextKey] = useState(1);
  const sum = Math.round(rows.reduce((total, row) => total + (Number(row.weight.replace(",", ".")) || 0), 0) * 100) / 100;
  const update = (key: string, patch: Partial<CategoryRow>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  return (
    <form action={action}>
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="gradingPeriodId" value={periodId} />
      <ul className="space-y-3">
        {rows.map((row, index) => (
          <li key={row.key} className="grid grid-cols-[1fr_5.5rem] items-end gap-2 sm:grid-cols-[1fr_7rem_auto]">
            <input type="hidden" name="categoryId" value={row.id} />
            <label className="block text-sm font-medium text-slate-900">
              Categoría {index + 1}
              <input name="name" required maxLength={60} value={row.name} onChange={(event) => update(row.key, { name: event.target.value })} className={field} />
            </label>
            <label className="block text-sm font-medium text-slate-900">
              Peso (%)
              <input name="weight" required inputMode="decimal" value={row.weight} onChange={(event) => update(row.key, { weight: event.target.value })} className={field} />
            </label>
            {row.itemCount > 0 ? (
              <p className="col-span-2 text-xs text-slate-500 sm:col-span-1 sm:pb-3">Tiene {row.itemCount} {row.itemCount === 1 ? "actividad" : "actividades"}; no se puede quitar.</p>
            ) : (
              <button type="button" className={`${secondary} col-span-2 sm:col-span-1`} disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}>
                Quitar
              </button>
            )}
          </li>
        ))}
      </ul>
      <p aria-live="polite" className={`mt-3 rounded-lg p-3 text-sm ${sum === 100 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
        {sum === 100
          ? "Los pesos suman 100 %. Todo en orden."
          : sum < 100
            ? `Los pesos suman ${sum} %. Faltan ${Math.round((100 - sum) * 100) / 100} para llegar a 100 %.`
            : `Los pesos suman ${sum} %. Sobran ${Math.round((sum - 100) * 100) / 100} para quedar en 100 %.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={secondary}
          onClick={() => {
            setRows((current) => [...current, { key: `nueva-${nextKey}`, id: "", name: "", weight: "0", itemCount: 0 }]);
            setNextKey((value) => value + 1);
          }}
        >
          Agregar categoría
        </button>
        <button className={primary} disabled={pending || sum !== 100}>{pending ? "Guardando…" : "Guardar categorías"}</button>
      </div>
      <Notice state={state} />
    </form>
  );
}

/** Editor de una nota: nota, comentario, exonerado y, si ya había nota, el motivo del cambio. */
export function GradeEditor({
  courseId,
  closeHref,
  itemId,
  enrollmentId,
  maxScore,
  entry,
}: {
  courseId: string;
  closeHref: string;
  itemId: string;
  enrollmentId: string;
  maxScore: number;
  entry: { score: number | null; feedback: string | null; isExcused: boolean } | null;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveGradeAction, empty);
  const hadScore = entry !== null && entry.score !== null;
  // Campos controlados: si el servidor pide corregir algo, lo escrito no se pierde.
  const [score, setScore] = useState(entry?.score != null ? String(entry.score) : "");
  const [excused, setExcused] = useState(entry?.isExcused ?? false);
  const [feedback, setFeedback] = useState(entry?.feedback ?? "");
  const [reason, setReason] = useState("");
  // Al guardar se vuelve a la tabla, que ya trae la nota nueva.
  useEffect(() => {
    if (state.ok) router.replace(closeHref, { scroll: false });
  }, [state.ok, router, closeHref]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="gradeItemId" value={itemId} />
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      <label className="block text-sm font-medium text-slate-900">
        Nota (de 0 a {maxScore})
        <input name="score" inputMode="decimal" autoComplete="off" autoFocus value={score} onChange={(event) => setScore(event.target.value)} aria-describedby="ayuda-nota" className={field} />
      </label>
      <p id="ayuda-nota" className="-mt-2 text-xs text-slate-500">Puedes usar decimales, por ejemplo 8,5.</p>
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-900">
        <input type="checkbox" name="isExcused" checked={excused} onChange={(event) => setExcused(event.target.checked)} className="h-5 w-5" />
        <span>Exonerado <span className="font-normal text-slate-600">(esta actividad no cuenta en su promedio)</span></span>
      </label>
      <label className="block text-sm font-medium text-slate-900">
        Comentario para el estudiante (opcional)
        <textarea name="feedback" rows={3} maxLength={5000} value={feedback} onChange={(event) => setFeedback(event.target.value)} className={`${field} py-2`} />
      </label>
      {hadScore && (
        <label className="block text-sm font-medium text-slate-900">
          Motivo del cambio
          <input name="reason" maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Por ejemplo: error al sumar los puntos" aria-describedby="ayuda-motivo" className={field} />
          <span id="ayuda-motivo" className="mt-1 block text-xs font-normal text-slate-500">Hace falta si cambias la nota. Queda guardado en el historial.</span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button className={primary} disabled={pending}>{pending ? "Guardando…" : "Guardar nota"}</button>
        <Link href={closeHref} scroll={false} className={`${secondary} inline-flex items-center`}>Cancelar</Link>
      </div>
      <Notice state={state} />
    </form>
  );
}
