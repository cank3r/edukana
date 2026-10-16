"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { invitePendingPeopleAction, type PeopleActionState } from "@/server/actions/people";

export { PersonAccess, PersonEditor } from "./PersonActions";
export { ImportPeople } from "./ImportPeople";

const primary = "min-h-11 rounded-lg bg-[var(--blue)] px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const secondary = "min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60";
const empty: PeopleActionState = { ok: false, message: "" };

function Notice({ ok, message }: { ok: boolean; message: string }) {
  if (!message) return null;
  return <p role={ok ? "status" : "alert"} className={`mt-3 rounded-lg p-3 text-sm ${ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{message}</p>;
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
    <div ref={resultFocus} tabIndex={-1}>
      {state.message && <p className="mt-3 text-sm font-semibold">Último resultado informado</p>}
      <Notice ok={state.ok} message={state.message} />
    </div>
    {state.message && <p className="mt-2 text-sm text-slate-600">
      El resultado se actualiza por cada lote. El envío al proveedor no confirma la entrega en la bandeja.
    </p>}
  </div>;
}
