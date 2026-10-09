"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { setExamPublishedAction, type ExamActionState } from "@/server/actions/exam-admin";

const primary = "min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const secondary = "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60";
const empty: ExamActionState = { ok: false, message: "" };

type PublishExamProps = { examId: string; published: boolean; blocker: string | null; attemptCount: number };

/** Cada confirmación tiene su propio estado: actualizar la ruta no reinicia useActionState. */
export function PublishExam(props: PublishExamProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  if (!props.published && props.blocker) {
    return <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{props.blocker}</p>;
  }
  if (!open) {
    return (
      <div className="space-y-2">
        {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        <button type="button" className={props.published ? secondary : primary} onClick={() => { setMessage(""); setOpen(true); }}>
          {props.published ? "Ocultar examen" : "Publicar examen"}
        </button>
      </div>
    );
  }
  return (
    <PublishConfirmation
      {...props}
      onCancel={() => setOpen(false)}
      onSuccess={(state) => {
        setMessage(state.message);
        setOpen(false);
        router.refresh();
      }}
    />
  );
}

function PublishConfirmation({ examId, published, attemptCount, onCancel, onSuccess }: PublishExamProps & {
  onCancel: () => void;
  onSuccess: (state: ExamActionState) => void;
}) {
  const [state, action, pending] = useActionState(async (previous: ExamActionState, formData: FormData) => {
    const result = await setExamPublishedAction(previous, formData);
    if (result.ok) onSuccess(result);
    return result;
  }, empty);

  return (
    <form action={action} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
      <input type="hidden" name="examId" value={examId} />
      <input type="hidden" name="publish" value={published ? "false" : "true"} />
      <p>
        {published
          ? `Los estudiantes dejarán de ver este examen y nadie podrá empezar un intento nuevo.${attemptCount ? " Los intentos ya hechos y sus notas se conservan; quien lo esté presentando ahora todavía puede enviarlo." : ""}`
          : "Los estudiantes inscritos en el curso verán el examen y podrán presentarlo dentro de las fechas que pusiste. Cuando alguien lo empiece, ya no podrás cambiar las preguntas ni los puntos."}
      </p>
      {!state.ok && state.message && <p role="alert" className="mt-2 font-semibold text-red-800">{state.message}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" className={primary} disabled={pending}>{pending ? "Guardando…" : published ? "Sí, ocultar" : "Sí, publicar"}</button>
        <button type="button" className={secondary} disabled={pending} onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}
