"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { courseStateAction, type CourseActionState } from "@/server/actions/courses";

type Intent = "publish" | "unpublish" | "archive" | "restore";

export function CourseStateTools({
  courseId,
  courseName,
  isPublished,
  isArchived,
  canPublish,
  canArchive,
  activeStudents,
}: {
  courseId: string;
  courseName: string;
  isPublished: boolean;
  isArchived: boolean;
  canPublish: boolean;
  canArchive: boolean;
  activeStudents: number;
}) {
  const router = useRouter();
  const [state, setState] = useState<CourseActionState>({ ok: false, message: "" });
  const [confirming, setConfirming] = useState<Intent | null>(null);
  const [pending, startTransition] = useTransition();

  function run(intent: Intent) {
    const formData = new FormData();
    formData.set("courseId", courseId);
    formData.set("intent", intent);
    setConfirming(null);
    startTransition(async () => {
      const result = await courseStateAction({ ok: false, message: "" }, formData);
      setState(result);
      if (result.ok) router.refresh();
    });
  }

  const impact = activeStudents === 1 ? "1 estudiante inscrito" : `${activeStudents} estudiantes inscritos`;
  const confirmation = confirming
    ? {
        publish: { title: "Publicar curso", text: `Al publicar «${courseName}», ${impact} podrán verlo.`, button: "Publicar curso" },
        unpublish: { title: "Pasar a borrador", text: `«${courseName}» dejará de estar visible para ${impact}. No se borrará nada.`, button: "Pasar a borrador" },
        archive: { title: "Archivar curso", text: `«${courseName}» quedará en modo consulta y saldrá de las listas activas. Su historial se conservará.`, button: "Archivar curso" },
        restore: { title: "Restaurar curso", text: `«${courseName}» volverá como borrador. Tendrás que revisarlo y publicarlo de nuevo.`, button: "Restaurar como borrador" },
      }[confirming]
    : null;

  if ((!canPublish && !canArchive) || (isArchived && !canArchive)) {
    return <p className="text-sm text-slate-600">No tienes permisos para cambiar el estado de este curso.</p>;
  }

  return (
    <div className="space-y-4">
      {isArchived ? (
        <button type="button" disabled={pending} onClick={() => setConfirming("restore")} className="min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60">
          Restaurar curso
        </button>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {canPublish && (
            <button type="button" disabled={pending} onClick={() => setConfirming(isPublished ? "unpublish" : "publish")} className="min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60">
              {isPublished ? "Pasar a borrador" : "Publicar curso"}
            </button>
          )}
          {canArchive && (
            <button type="button" disabled={pending} onClick={() => setConfirming("archive")} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60">
              Archivar curso
            </button>
          )}
        </div>
      )}

      {confirmation && confirming && (
        <dialog open aria-labelledby="course-confirm-title" aria-describedby="course-confirm-description" onCancel={() => setConfirming(null)} className="fixed inset-0 z-50 m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-5 text-slate-950 shadow-xl backdrop:bg-slate-950/40">
          <h3 id="course-confirm-title" className="text-lg font-bold">{confirmation.title}</h3>
          <p id="course-confirm-description" className="mt-2 text-sm text-slate-600">{confirmation.text}</p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" disabled={pending} onClick={() => setConfirming(null)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800">Cancelar</button>
            <button autoFocus type="button" disabled={pending} onClick={() => run(confirming)} className="min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60">{confirmation.button}</button>
          </div>
        </dialog>
      )}

      {state.message && <p aria-live="polite" role={state.ok ? "status" : "alert"} className={`rounded-lg p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p>}
    </div>
  );
}
