"use client";

import { useActionState, useState } from "react";
import {
  issueCertificateAction,
  issueCertificatesToEligibleAction,
  markCourseCompletedAction,
  reopenCourseCompletionAction,
  revokeCertificateAction,
  type CertificateActionState,
} from "@/server/actions/certificates";

const primary = "min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const secondary = "min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60";
const danger = "min-h-11 rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const field = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500";
const link = "inline-flex min-h-11 items-center font-semibold text-blue-700 underline";
const empty: CertificateActionState = { ok: false, message: "" };

function Notice({ ok, message }: { ok: boolean; message: string }) {
  if (!message) return null;
  return <p role={ok ? "status" : "alert"} className={`mt-3 rounded-lg p-3 text-sm ${ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{message}</p>;
}

/** «Ver certificado» y «Copiar enlace para compartir» de un certificado emitido. */
export function ShareTools({ code }: { code: string }) {
  const [copied, setCopied] = useState<"" | "ok" | "error">("");
  const path = `/certificados/${code}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setCopied("ok");
    } catch {
      setCopied("error");
    }
  }
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <a className={`${primary} inline-flex items-center`} href={path} target="_blank" rel="noopener">Ver certificado</a>
        <button type="button" className={secondary} onClick={copy}>Copiar enlace para compartir</button>
      </div>
      {copied === "ok" && <p role="status" className="mt-2 text-sm text-emerald-800">Enlace copiado. Pégalo donde quieras compartirlo.</p>}
      {copied === "error" && <p role="alert" className="mt-2 text-sm text-red-800">No se pudo copiar. Abre el certificado y copia la dirección desde el navegador.</p>}
    </div>
  );
}

/** Acción principal: emitir a todos los que cumplen, con resumen antes de confirmar. */
export function IssueAllPanel({ courseId, names }: { courseId: string; names: string[] }) {
  const [asking, setAsking] = useState(false);
  const [state, action, pending] = useActionState(issueCertificatesToEligibleAction, empty);
  const total = names.length;
  const what = total === 1 ? "1 certificado" : `${total} certificados`;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      {total === 0 ? (
        <p className="text-sm text-slate-600">Por ahora nadie está pendiente de certificado. Cuando un estudiante cumpla los requisitos, aquí podrás emitirlo.</p>
      ) : !asking ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-700">
            {total === 1 ? "1 estudiante cumple los requisitos y aún no tiene certificado." : `${total} estudiantes cumplen los requisitos y aún no tienen certificado.`}
          </p>
          <button type="button" className={`${primary} w-full sm:w-auto`} onClick={() => setAsking(true)}>Emitir a todos los que cumplen</button>
        </div>
      ) : (
        <form action={action}>
          <input type="hidden" name="courseId" value={courseId} />
          <h2 className="text-lg font-bold text-slate-950">Vas a emitir {what}</h2>
          <p className="mt-1 text-sm text-slate-700">Cada estudiante podrá ver su certificado y compartir un enlace público que cualquiera puede comprobar. Lo recibirán:</p>
          <ul className="mt-2 max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 text-sm text-slate-800">
            {names.map((name, index) => <li key={`${index}-${name}`}>{name}</li>)}
          </ul>
          <p className="mt-2 text-sm text-slate-600">Quien ya tiene certificado se queda igual. Si te equivocas, puedes anular cualquiera después.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={primary} type="submit" disabled={pending}>{pending ? "Emitiendo…" : `Sí, emitir ${what}`}</button>
            <button className={secondary} type="button" disabled={pending} onClick={() => setAsking(false)}>Cancelar</button>
          </div>
        </form>
      )}
      <Notice ok={state.ok} message={state.message} />
    </section>
  );
}

export type CertificateRowView = {
  enrollmentId: string;
  name: string;
  /** Texto del estado de la persona en el curso, si no es simplemente activa. */
  note: string;
  canMarkCompleted: boolean;
  canReopen: boolean;
  progressPercent: number;
  grade: string;
  state: "issued" | "eligible" | "pending";
  missing: string;
  code: string;
  issuedOn: string;
  revokedOn: string;
  revokeReason: string;
};

const STATE = {
  issued: "bg-blue-50 text-blue-800",
  eligible: "bg-emerald-50 text-emerald-800",
  pending: "bg-slate-100 text-slate-700",
} as const;

export function CertificateList({ courseId, showGrades, rows }: { courseId: string; showGrades: boolean; rows: CertificateRowView[] }) {
  return (
    <ul className="mt-3 space-y-3">
      {rows.map((row) => <CertificateRow key={row.enrollmentId} courseId={courseId} showGrades={showGrades} row={row} />)}
    </ul>
  );
}

function CertificateRow({ courseId, showGrades, row }: { courseId: string; showGrades: boolean; row: CertificateRowView }) {
  const [asking, setAsking] = useState<"" | "revoke" | "complete">("");
  const [issued, issue, issuing] = useActionState(issueCertificateAction, empty);
  const [completed, complete, completing] = useActionState(markCourseCompletedAction, empty);
  const [reopened, reopen, reopening] = useActionState(reopenCourseCompletionAction, empty);
  const [revoked, revoke, revoking] = useActionState(revokeCertificateAction, empty);
  const hidden = (
    <>
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="enrollmentId" value={row.enrollmentId} />
    </>
  );
  // La pregunta se cierra sola cuando la fila cambia de estado tras confirmar.
  const askingRevoke = asking === "revoke" && row.state === "issued";
  const askingComplete = asking === "complete" && row.state === "pending";
  const label = row.state === "issued" ? `Certificado emitido el ${row.issuedOn}` : row.state === "eligible" ? "Cumple los requisitos" : "Aún no";

  return (
    <li className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-950">{row.name}</p>
          <p className="mt-1 flex flex-wrap gap-1 text-xs font-semibold">
            <span className={`rounded-full px-2 py-1 ${STATE[row.state]}`}>{label}</span>
            {row.note && <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{row.note}</span>}
          </p>
        </div>
        <dl className="flex gap-5 text-sm">
          <div><dt className="text-xs text-slate-500">Avance</dt><dd className="font-semibold text-slate-900">{row.progressPercent}%</dd></div>
          {showGrades && <div><dt className="text-xs text-slate-500">Nota actual</dt><dd className="font-semibold text-slate-900">{row.grade || "Sin notas"}</dd></div>}
        </dl>
      </div>

      {row.state === "pending" && row.missing && <p className="mt-2 text-sm text-slate-700">{row.missing}</p>}
      {row.state !== "issued" && row.revokedOn && (
        <p className="mt-2 text-sm text-amber-900">
          Tuvo un certificado que se anuló el {row.revokedOn}{row.revokeReason ? ` · Motivo: ${row.revokeReason}` : ""}. Si lo emites de nuevo recibirá un enlace nuevo.
        </p>
      )}

      {!askingRevoke && !askingComplete && (
        <div className="mt-3 flex flex-wrap gap-2">
          {row.state === "issued" && (
            <>
              <a className={link} href={`/certificados/${row.code}`} target="_blank" rel="noopener">Ver certificado</a>
              <button type="button" className={secondary} onClick={() => setAsking("revoke")}>Anular certificado</button>
            </>
          )}
          {row.state === "eligible" && (
            <form action={issue}>
              {hidden}
              <button className={primary} type="submit" disabled={issuing}>{issuing ? "Emitiendo…" : "Emitir certificado"}</button>
            </form>
          )}
          {row.state === "eligible" && row.canReopen && (
            <form action={reopen}>
              {hidden}
              <button className={secondary} type="submit" disabled={reopening}>{reopening ? "Reabriendo…" : "Quitar el completado"}</button>
            </form>
          )}
          {row.state === "pending" && row.canMarkCompleted && (
            <button type="button" className={secondary} onClick={() => setAsking("complete")}>Marcar curso como completado</button>
          )}
        </div>
      )}

      {askingComplete && (
        <form action={complete} className="mt-3 rounded-lg bg-amber-50 p-4">
          {hidden}
          <p className="text-sm font-semibold text-amber-900">
            {row.name} lleva {row.progressPercent}% del curso. Si lo marcas como completado, contará como terminado aunque le falten lecciones y podrás emitir su certificado.
          </p>
          <p className="mt-1 text-sm text-amber-900">Úsalo cuando hizo el trabajo de otra forma, por ejemplo en clase presencial. Puedes deshacerlo mientras no tenga certificado.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={primary} type="submit" disabled={completing}>{completing ? "Guardando…" : "Sí, marcar como completado"}</button>
            <button className={secondary} type="button" disabled={completing} onClick={() => setAsking("")}>Cancelar</button>
          </div>
        </form>
      )}

      {askingRevoke && (
        <form action={revoke} className="mt-3 rounded-lg bg-red-50 p-4">
          {hidden}
          <p className="text-sm font-semibold text-red-900">
            Vas a anular el certificado de {row.name}. Su enlace público dejará de verificar: quien lo abra verá que fue anulado, y el estudiante ya no lo verá entre sus certificados.
          </p>
          <p className="mt-1 text-sm text-red-900">El motivo queda guardado en el historial. Podrás emitirle uno nuevo, con otro enlace.</p>
          <label className="mt-3 block text-sm font-medium text-slate-900">
            ¿Por qué se anula?
            <input name="reason" required maxLength={500} className={`${field} mt-1`} placeholder="Ejemplo: se emitió por error" autoComplete="off" />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={danger} type="submit" disabled={revoking}>{revoking ? "Anulando…" : "Sí, anular certificado"}</button>
            <button className={secondary} type="button" disabled={revoking} onClick={() => setAsking("")}>Cancelar</button>
          </div>
        </form>
      )}

      <Notice ok={issued.ok} message={issued.message} />
      <Notice ok={completed.ok} message={completed.message} />
      <Notice ok={reopened.ok} message={reopened.message} />
      <Notice ok={revoked.ok} message={revoked.message} />
    </li>
  );
}
