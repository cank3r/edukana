"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { courseStateAction, type CourseActionState } from "@/server/actions/courses";

const primary = "min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const secondary = "min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60";
const danger = "min-h-11 rounded-lg bg-red-700 px-4 py-2.5 font-semibold text-white disabled:opacity-60";

type Intent = "publish" | "unpublish" | "archive" | "restore" | "delete";

/** Publicar, archivar, restaurar y borrar un curso; lo que quita algo de la vista pide confirmación. */
export function CourseStateTools({ courseId, courseName, isPublished, isArchived, canDelete, activeStudents }: { courseId: string; courseName: string; isPublished: boolean; isArchived: boolean; canDelete: boolean; activeStudents: number }) {
  const router = useRouter();
  const [state, setState] = useState<CourseActionState>({ ok: false, message: "" });
  const [confirming, setConfirming] = useState<Intent | null>(null);
  const [pending, startTransition] = useTransition();

  function run(intent: Intent) {
    setConfirming(null);
    const data = new FormData();
    data.set("courseId", courseId);
    data.set("intent", intent);
    startTransition(async () => {
      const result = await courseStateAction({ ok: false, message: "" }, data);
      setState(result);
      if (result.ok && result.deleted) router.push("/dashboard/aula");
      else if (result.ok) router.refresh();
    });
  }

  const students = `sus estudiantes inscritos (${activeStudents} hoy)`;
  const confirmations: Partial<Record<Intent, { text: string; button: string; className: string }>> = {
    publish: { text: `Al publicar «${courseName}», ${students} lo verán en sus cursos, con las lecciones que estén publicadas.`, button: "Sí, publicar", className: primary },
    unpublish: { text: `Al pasar «${courseName}» a borrador, ${students} dejarán de verlo. No se borra nada y puedes publicarlo de nuevo.`, button: "Sí, pasar a borrador", className: primary },
    archive: { text: `Al archivar «${courseName}», nadie lo verá en sus listas, tampoco ${students}. No se borra nada: lecciones, entregas y notas se conservan, y puedes restaurarlo cuando quieras desde «Archivados».`, button: "Sí, archivar", className: primary },
    delete: { text: `Vas a borrar «${courseName}» para siempre, con sus lecciones, tareas y exámenes. Esto no se puede deshacer.`, button: "Sí, borrar para siempre", className: danger },
  };
  const confirmation = confirming ? confirmations[confirming] : undefined;

  return (
    <div className="space-y-5">
      {!isArchived && (
        <div>
          <h3 className="font-semibold text-slate-950">{isPublished ? "Publicado" : "Borrador"}</h3>
          <p className="mt-1 text-sm text-slate-600">{isPublished ? "Los estudiantes inscritos ven este curso." : "Solo quien gestiona el curso lo ve. Publícalo cuando esté listo para tus estudiantes."}</p>
          <button type="button" className={`${isPublished ? secondary : primary} mt-3`} disabled={pending} onClick={() => setConfirming(isPublished ? "unpublish" : "publish")}>{isPublished ? "Pasar a borrador" : "Publicar"}</button>
        </div>
      )}
      <div className={isArchived ? "" : "border-t border-slate-200 pt-5"}>
        <h3 className="font-semibold text-slate-950">{isArchived ? "Este curso está archivado" : "Archivar"}</h3>
        <p className="mt-1 text-sm text-slate-600">{isArchived ? "Nadie lo ve en sus listas. Al restaurarlo vuelve tal como estaba." : "Para cursos que ya terminaron. Salen de las listas de todos, no se borra nada y se pueden restaurar."}</p>
        {isArchived
          ? <button type="button" className={`${primary} mt-3`} disabled={pending} onClick={() => run("restore")}>{pending ? "Restaurando…" : "Restaurar curso"}</button>
          : <button type="button" className={`${secondary} mt-3`} disabled={pending} onClick={() => setConfirming("archive")}>Archivar curso</button>}
      </div>
      <div className="border-t border-slate-200 pt-5">
        <h3 className="font-semibold text-slate-950">Borrar definitivamente</h3>
        {canDelete ? (
          <>
            <p className="mt-1 text-sm text-slate-600">Este curso no tiene estudiantes inscritos, entregas ni exámenes presentados, así que se puede borrar.</p>
            <button type="button" className={`${secondary} mt-3 border-red-300 text-red-800`} disabled={pending} onClick={() => setConfirming("delete")}>Borrar curso</button>
          </>
        ) : (
          <p className="mt-1 text-sm text-slate-600">Este curso ya tiene estudiantes inscritos, entregas o exámenes presentados, así que no se puede borrar. {isArchived ? "Queda archivado, sin perder nada." : "Si ya no lo usas, archívalo: sale de las listas y no se pierde nada."}</p>
        )}
      </div>

      {confirmation && confirming && (
        <div role="alertdialog" aria-label="Confirmar" className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-950">{confirmation.text}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={confirmation.className} disabled={pending} onClick={() => run(confirming)}>{confirmation.button}</button>
            <button type="button" className={secondary} disabled={pending} onClick={() => setConfirming(null)}>Cancelar</button>
          </div>
        </div>
      )}
      {state.message && <p role={state.ok ? "status" : "alert"} className={`rounded-lg p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p>}
    </div>
  );
}
