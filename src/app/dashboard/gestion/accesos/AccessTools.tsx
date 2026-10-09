"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState, useTransition } from "react";
import { importPeopleAction, type PeopleImportState } from "@/server/actions/people-import";
import { invitePendingPeopleAction, invitePersonAction, setPersonStatusAction, updatePersonAction, type PeopleActionState } from "@/server/actions/people";

const primary = "min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
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
              <button type="button" className={primary} disabled={pending || preview.toCreate === 0} onClick={() => run(true)}>{pending ? "Creando…" : `Crear ${preview.toCreate} personas`}</button>
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
  // Mientras se envía manda el conteo que devuelve el servidor; al terminar, el de la página.
  const [live, setLive] = useState<number | null>(null);
  const remaining = live ?? pending;
  const [state, setState] = useState<PeopleActionState>(empty);
  const [confirming, setConfirming] = useState(false);
  const [working, startTransition] = useTransition();

  function sendAll() {
    setConfirming(false);
    startTransition(async () => {
      let sentBefore = -1;
      for (;;) {
        const result = await invitePendingPeopleAction();
        setState(result);
        const left = result.remaining ?? 0;
        setLive(left);
        // Se detiene al terminar, ante un fallo, o si un lote no avanzó.
        if (!result.ok || left === 0 || left === sentBefore) break;
        sentBefore = left;
      }
      setLive(null);
      router.refresh();
    });
  }

  if (remaining === 0 && !state.message) {
    return <p className="mt-1 text-sm text-slate-600">Todas las personas activas ya tienen contraseña o una invitación vigente. No hay nada que enviar.</p>;
  }
  return (
    <div className="mt-1">
      <p className="text-sm text-slate-600">
        <strong>{remaining}</strong> {remaining === 1 ? "persona aún no puede entrar" : "personas aún no pueden entrar"}. Cada una recibirá un correo con un enlace para crear su contraseña, válido por 7 días.
      </p>
      {!confirming && remaining > 0 && <button type="button" className={`${primary} mt-3`} disabled={working} onClick={() => setConfirming(true)}>{working ? `Enviando… faltan ${remaining}` : "Enviar invitaciones"}</button>}
      {confirming && (
        <div className="mt-3 rounded-lg bg-amber-50 p-4 text-sm text-amber-900" role="alertdialog" aria-label="Confirmar envío de invitaciones">
          <p className="font-semibold">Se enviarán {remaining} correos ahora. No se puede deshacer.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={primary} onClick={sendAll}>Sí, enviar {remaining}</button>
            <button type="button" className={secondary} onClick={() => setConfirming(false)}>Cancelar</button>
          </div>
        </div>
      )}
      <Notice ok={state.ok} message={state.message} />
    </div>
  );
}

type Person = { id: string; name: string; email: string; phone: string; role: string; roleLabel: string; suspended: boolean; hasPassword: boolean; isSelf: boolean; detailHref?: string };

const ROLE_OPTIONS = [
  { value: "STUDENT", label: "Estudiante" },
  { value: "TEACHER", label: "Docente" },
  { value: "COORDINATOR", label: "Coordinador" },
  { value: "PARENT", label: "Tutor" },
  { value: "ADMIN", label: "Administrador" },
];
const fieldClass = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500";

export function PersonAccess({ person }: { person: Person }) {
  const [statusState, statusAction, statusPending] = useActionState(setPersonStatusAction, empty);
  const [inviteState, inviteAction, invitePending] = useActionState(invitePersonAction, empty);
  const [asking, setAsking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editState, editAction, editPending] = useActionState(async (state: PeopleActionState, data: FormData) => {
    const result = await updatePersonAction(state, data);
    if (result.ok) setEditing(false);
    return result;
  }, empty);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-950">{person.detailHref ? <Link className="text-blue-700 underline" href={person.detailHref}>{person.name}</Link> : person.name}</p>
          <p className="truncate text-sm text-slate-600">{person.email} · {person.roleLabel}</p>
          <p className="mt-1 text-xs font-semibold">
            {person.suspended ? <span className="rounded-full bg-red-50 px-2 py-1 text-red-700">Suspendido</span> : person.hasPassword ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">Puede entrar</span> : <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-800">Aún no crea su contraseña</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!editing && <button className={secondary} type="button" onClick={() => setEditing(true)}>Editar</button>}
        {!person.isSelf && (
          <>
            {!person.suspended && (
              <form action={inviteAction}>
                <input type="hidden" name="userId" value={person.id} />
                <button className={secondary} type="submit" disabled={invitePending}>{invitePending ? "Enviando…" : person.hasPassword ? "Enviar aviso de acceso" : "Enviar invitación"}</button>
              </form>
            )}
            {person.suspended ? (
              <form action={statusAction}>
                <input type="hidden" name="userId" value={person.id} />
                <input type="hidden" name="status" value="ACTIVE" />
                <button className={primary} type="submit" disabled={statusPending}>{statusPending ? "Reactivando…" : "Reactivar"}</button>
              </form>
            ) : (
              !asking && <button className={secondary} type="button" onClick={() => setAsking(true)}>Suspender</button>
            )}
          </>
        )}
        </div>
      </div>
      {editing && (
        <form action={editAction} className="mt-3 space-y-3 rounded-lg bg-slate-50 p-4">
          <input type="hidden" name="userId" value={person.id} />
          <label className="block text-sm font-medium text-slate-900">
            Nombre completo
            <input name="name" defaultValue={person.name} required minLength={3} maxLength={120} className={fieldClass} autoComplete="off" />
          </label>
          <label className="block text-sm font-medium text-slate-900">
            Teléfono (opcional)
            <input name="phone" defaultValue={person.phone} maxLength={30} inputMode="tel" className={fieldClass} autoComplete="off" />
          </label>
          {person.isSelf ? (
            <input type="hidden" name="role" value={person.role} />
          ) : (
            <label className="block text-sm font-medium text-slate-900">
              Rol
              <select name="role" defaultValue={person.role} className={fieldClass}>
                {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          )}
          <p className="text-xs text-slate-500">El correo ({person.email}) es la cuenta con la que entra y no se cambia aquí.</p>
          <div className="flex flex-wrap gap-2">
            <button className={primary} type="submit" disabled={editPending}>{editPending ? "Guardando…" : "Guardar cambios"}</button>
            <button className={secondary} type="button" disabled={editPending} onClick={() => setEditing(false)}>Cancelar</button>
          </div>
        </form>
      )}
      <Notice ok={editState.ok} message={editState.message} />
      {asking && !person.suspended && (
        <form action={statusAction} className="mt-3 rounded-lg bg-amber-50 p-4">
          <input type="hidden" name="userId" value={person.id} />
          <input type="hidden" name="status" value="SUSPENDED" />
          <p className="text-sm font-semibold text-amber-900">{person.name} dejará de poder entrar de inmediato. Sus cursos y notas se conservan.</p>
          <label className="mt-3 block text-sm font-medium text-slate-900">
            ¿Por qué se suspende?
            <input name="reason" required maxLength={500} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500" placeholder="Ejemplo: retiro del programa" />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="min-h-11 rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60" type="submit" disabled={statusPending}>{statusPending ? "Suspendiendo…" : "Sí, suspender"}</button>
            <button className={secondary} type="button" onClick={() => setAsking(false)}>Cancelar</button>
          </div>
        </form>
      )}
      <Notice ok={statusState.ok} message={statusState.message} />
      <Notice ok={inviteState.ok} message={inviteState.message} />
    </li>
  );
}
