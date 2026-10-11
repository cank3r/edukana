"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { importPeopleAction, type PeopleImportState } from "@/server/actions/people-import";
import { invitePendingPeopleAction, type PeopleActionState } from "@/server/actions/people";
import { plural } from "@/lib/ux";

export { PersonAccess, PersonEditor } from "./PersonActions";

const primary = "min-h-11 rounded-lg bg-[var(--blue)] px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const secondary = "min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60";
const empty: PeopleActionState = { ok: false, message: "" };

function Notice({ ok, message }: { ok: boolean; message: string }) {
  if (!message) return null;
  return <p role={ok ? "status" : "alert"} className={`mt-3 rounded-lg p-3 text-sm ${ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{message}</p>;
}

/** Importación en dos pasos: revisar el archivo y, con el resumen a la vista, confirmar. */
export function ImportPeople() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<PeopleImportState | null>(null);
  const [pending, startTransition] = useTransition();

  function run(confirm: boolean) {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setState({ ok: false, message: "Elige primero el archivo CSV." });
      return;
    }
    const data = new FormData();
    data.set("file", file);
    if (confirm) data.set("confirm", "true");
    startTransition(async () => {
      const result = await importPeopleAction({ ok: false, message: "" }, data);
      setState(result);
      if (result.ok && result.step === "done") {
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      }
    });
  }

  const preview = state?.ok && state.step === "preview" ? state : null;
  const done = state?.ok && state.step === "done" ? state : null;
  return (
    <div className="mt-3">
      <label className="block text-sm font-medium text-slate-900">
        Archivo CSV
        <input ref={fileRef} type="file" accept=".csv,text/csv" disabled={pending} onChange={() => setState(null)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm" />
      </label>
      {!preview && <button type="button" className={`${primary} mt-3`} disabled={pending} onClick={() => run(false)}>{pending ? "Revisando…" : "Revisar archivo"}</button>}
      {state && !state.ok && <Notice ok={false} message={state.message} />}
      {(preview ?? done) && (
        <div className="mt-3 rounded-lg bg-slate-50 p-4 text-sm" aria-live="polite">
          <p className="font-semibold text-slate-950">{done ? done.message : "Esto es lo que va a pasar:"}</p>
          <ul className="mt-2 space-y-1 text-slate-700">
            <li>{done ? "Personas creadas" : "Personas nuevas que se crearán"}: <strong>{(preview ?? done)!.toCreate}</strong></li>
            <li>Ya existían y no cambian: <strong>{(preview ?? done)!.alreadyExisted}</strong></li>
            <li>Filas con errores que no se crearán: <strong>{(preview ?? done)!.rejected}</strong></li>
          </ul>
          {(preview ?? done)!.sampleErrors.length > 0 && (
            <details className="mt-3">
              <summary className="min-h-11 cursor-pointer py-2 font-semibold text-slate-900">Ver filas con errores</summary>
              <ul className="space-y-1 text-slate-700">
                {(preview ?? done)!.sampleErrors.map((error, index) => <li key={index}>Fila {error.line}: {error.message}</li>)}
              </ul>
              {(preview ?? done)!.errorsCsv && <a className="mt-2 inline-flex min-h-11 items-center font-semibold text-blue-700 underline" href={`data:text/csv;charset=utf-8,${encodeURIComponent((preview ?? done)!.errorsCsv)}`} download="filas-con-errores.csv">Descargar todas las filas con errores</a>}
            </details>
          )}
          {preview && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={primary} disabled={pending || preview.toCreate === 0} onClick={() => run(true)}>{pending ? "Creando…" : `Crear ${plural(preview.toCreate, "persona", "personas")}`}</button>
              <button type="button" className={secondary} disabled={pending} onClick={() => setState(null)}>Cancelar</button>
            </div>
          )}
          {done && <p className="mt-3 text-slate-700">Siguiente paso: envíales su invitación para que creen su contraseña.</p>}
        </div>
      )}
    </div>
  );
}

/** Envía las invitaciones pendientes por lotes hasta terminar, mostrando cuántas faltan. */
export function InvitePending({ pending }: { pending: number }) {
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const resultFocus = useRef<HTMLDivElement>(null);
  const sending = useRef(false);
  const restoreFocus = useRef(false);
  const [live, setLive] = useState<number | null>(null);
  const [previousPending, setPreviousPending] = useState(pending);
  const remaining = live ?? pending;
  const [state, setState] = useState<PeopleActionState>(empty);
  const [confirming, setConfirming] = useState(false);
  const [working, startTransition] = useTransition();
  if (previousPending !== pending) {
    setPreviousPending(pending);
    if (!sending.current) setLive(null);
  }
  useEffect(() => {
    if (confirming) title.current?.focus();
    else if (!working && restoreFocus.current) {
      (trigger.current ?? resultFocus.current)?.focus(); restoreFocus.current = false;
    }
  }, [confirming, working]);
  function cancel() {
    if (sending.current) return;
    restoreFocus.current = true; setConfirming(false);
  }
  function sendAll() {
    if (sending.current) return;
    sending.current = true;
    setConfirming(false);
    startTransition(async () => {
      let previousRemaining = remaining;
      try {
        for (;;) {
          const result = await invitePendingPeopleAction();
          setState(result);
          if (typeof result.remaining !== "number") break;
          setLive(result.remaining);
          if (!result.ok || result.remaining === 0 || result.remaining >= previousRemaining) break;
          previousRemaining = result.remaining;
        }
      } catch {
        setState({ ok: false, message: "El envío se interrumpió. Algunos correos pueden haberse enviado. Revisa los pendientes antes de reintentar." });
      } finally {
        sending.current = false;
        restoreFocus.current = true;
        router.refresh();
      }
    });
  }
  if (remaining === 0 && !state.message) return <p className="mt-1 text-sm text-slate-600">
    No hay invitaciones pendientes en la institución. Esto no confirma la entrega de correos anteriores
    ni que todas las personas puedan entrar.
  </p>;
  return <div className="mt-1" onKeyDown={(event) => {
    if (event.key === "Escape" && confirming) { event.preventDefault(); cancel(); }
  }}>
    <p className="text-sm text-slate-600">
      <strong>{remaining}</strong> {remaining === 1 ? "persona pendiente" : "personas pendientes"} en toda la institución.
      El envío incluye a todos los pendientes, no solo a los del archivo o la búsqueda actual.
      Se intentará enviarles un enlace para crear su contraseña, válido por 7 días.
    </p>
    {!confirming && remaining > 0 && <button ref={trigger} type="button" className={`${primary} mt-3`}
      disabled={working} onClick={() => setConfirming(true)}>{working ? `Enviando… faltan ${remaining}` : "Enviar invitaciones"}</button>}
    {confirming && <div className="mt-3 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
      <h3 ref={title} tabIndex={-1} className="font-semibold">Confirmar envío de invitaciones</h3>
      <p>Se intentarán enviar {remaining} correos a todas las personas pendientes de la institución. No se puede deshacer.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={primary} disabled={working} onClick={sendAll}>Sí, enviar {remaining}</button>
        <button type="button" className={secondary} disabled={working} onClick={cancel}>Cancelar</button>
      </div>
    </div>}
    <div ref={resultFocus} tabIndex={-1}><Notice ok={state.ok} message={state.message} /></div>
    {state.ok && state.message && <p className="mt-2 text-sm text-slate-600">El envío al proveedor no confirma la entrega en la bandeja.</p>}
  </div>;
}
