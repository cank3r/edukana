"use client";

import { useActionState, useState } from "react";
import { saveReviewAction, type SalesState } from "@/server/actions/catalog";

const initial: SalesState = { ok: false, message: "" };

/** Reseña propia: estrellas de 1 a 5 y comentario opcional. Si ya existe, se corrige. */
export function ReviewForm({ slug, courseId, rating, comment }: { slug: string; courseId: string; rating: number; comment: string }) {
  const [state, action, pending] = useActionState(saveReviewAction, initial);
  const [stars, setStars] = useState(rating);
  const [text, setText] = useState(comment);
  const [open, setOpen] = useState(rating === 0);
  // Al guardar con éxito se cierra el editor (ajuste de estado durante el render, sin efectos).
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.ok) setOpen(false);
  }

  if (!open) {
    return (
      <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
        <p className="text-slate-800">Tu reseña: <span className="text-amber-500" aria-label={`${stars} de 5 estrellas`}>{"★".repeat(stars)}</span></p>
        {state.message && <p role="status" className="mt-1 text-emerald-800">{state.message}</p>}
        <button type="button" className="mt-2 min-h-11 rounded-lg border border-slate-300 bg-white px-4 font-semibold text-slate-800" onClick={() => setOpen(true)}>Editar mi reseña</button>
      </div>
    );
  }

  return (
    <form action={action} className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="rating" value={stars} />
      <fieldset>
        <legend className="text-sm font-medium text-slate-900">{rating ? "Corrige tu valoración" : "¿Cómo valoras este curso?"}</legend>
        <div className="mt-1 flex gap-1" role="radiogroup" aria-label="Estrellas">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={stars === value}
              aria-label={value === 1 ? "1 estrella" : `${value} estrellas`}
              onClick={() => setStars(value)}
              className={`flex h-11 w-11 items-center justify-center rounded-lg border text-2xl ${value <= stars ? "border-amber-300 bg-amber-50 text-amber-500" : "border-slate-300 bg-white text-slate-300"}`}
            >
              ★
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm font-medium text-slate-900">
        Comentario (opcional)
        <textarea name="comment" value={text} onChange={(event) => setText(event.target.value)} maxLength={1000} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-base outline-none focus:border-blue-500" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending || stars === 0} className="min-h-11 rounded-lg bg-blue-600 px-4 font-semibold text-white disabled:opacity-60">
          {pending ? "Guardando…" : rating ? "Guardar cambios" : "Publicar reseña"}
        </button>
        {rating > 0 && <button type="button" className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 font-semibold text-slate-800" onClick={() => setOpen(false)}>Cancelar</button>}
      </div>
      {state.message && <p role={state.ok ? "status" : "alert"} className={`rounded-lg p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p>}
    </form>
  );
}
