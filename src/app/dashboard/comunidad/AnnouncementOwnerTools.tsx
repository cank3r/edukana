"use client";

import { useActionState, useState } from "react";
import { deleteAnnouncementAction, updateAnnouncementAction, type AnnouncementActionState } from "@/server/actions/announcements";

const empty: AnnouncementActionState = { ok: false, message: "" };
const secondary = "min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60";
const field = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-blue-500";

type Editable = { id: string; title: string; content: string; isPinned: boolean };

/** Corregir o borrar un aviso propio (o cualquiera, para quien gestiona todos los avisos). */
export function AnnouncementOwnerTools({ announcement }: { announcement: Editable }) {
  const [mode, setMode] = useState<"idle" | "edit" | "delete">("idle");
  const [editState, editAction, saving] = useActionState(async (state: AnnouncementActionState, data: FormData) => {
    const result = await updateAnnouncementAction(state, data);
    if (result.ok) setMode("idle");
    return result;
  }, empty);
  const [deleteState, deleteAction, deleting] = useActionState(deleteAnnouncementAction, empty);

  return (
    <div className="mt-4 border-t border-slate-200/70 pt-3">
      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondary} onClick={() => setMode("edit")}>Editar</button>
          <button type="button" className={secondary} onClick={() => setMode("delete")}>Borrar</button>
        </div>
      )}

      {mode === "edit" && (
        <form action={editAction} className="space-y-3">
          <input type="hidden" name="id" value={announcement.id} />
          <label className="block text-sm font-medium text-slate-900">
            Título
            <input className={field} name="title" defaultValue={announcement.title} required minLength={4} maxLength={140} />
          </label>
          <label className="block text-sm font-medium text-slate-900">
            Mensaje
            <textarea className={field} name="content" defaultValue={announcement.content} required rows={6} />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm text-slate-900">
            <input type="checkbox" name="isPinned" defaultChecked={announcement.isPinned} className="h-5 w-5" /> Mantener fijado arriba
          </label>
          <p className="text-xs text-slate-500">Las personas que reciben el aviso no cambian. Para enviarlo a otro grupo, bórralo y publica uno nuevo.</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Guardando…" : "Guardar cambios"}</button>
            <button type="button" className={secondary} disabled={saving} onClick={() => setMode("idle")}>Cancelar</button>
          </div>
        </form>
      )}

      {mode === "delete" && (
        <form action={deleteAction} className="rounded-lg bg-amber-50 p-4" role="alertdialog" aria-label="Confirmar borrado del aviso">
          <input type="hidden" name="id" value={announcement.id} />
          <p className="text-sm font-semibold text-amber-900">¿Borrar «{announcement.title}»?</p>
          <p className="mt-1 text-sm text-amber-900">Desaparecerá para todas las personas que lo recibieron, junto con sus imágenes y videos. No se puede deshacer.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="submit" disabled={deleting} className="min-h-11 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{deleting ? "Borrando…" : "Sí, borrar aviso"}</button>
            <button type="button" className={secondary} disabled={deleting} onClick={() => setMode("idle")}>Cancelar</button>
          </div>
        </form>
      )}

      {[editState, deleteState].map((state, index) => state.message && (
        <p key={index} role={state.ok ? "status" : "alert"} className={`mt-3 rounded-lg p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p>
      ))}
    </div>
  );
}
