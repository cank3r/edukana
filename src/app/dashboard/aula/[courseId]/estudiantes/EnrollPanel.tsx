"use client";

import { useEffect, useRef, useState } from "react";
import { enrollGroupAction, type CourseEnrollmentState } from "@/server/actions/course-enrollment";
import { EnrollPicker } from "./EnrollPicker";
import {
  EnrollmentNotice, empty, field, people, primary, secondary, useEnrollmentSubmission, type EnrollmentProps, type Group,
} from "./enrollment-ui";

export function EnrollPanel({ courseId, seatsLeft, groups, startOpen }: {
  courseId: string; seatsLeft: number | null; groups: Group[]; startOpen: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [mode, setMode] = useState<"search" | "group">("search");
  const [result, setResult] = useState<CourseEnrollmentState>(empty);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const returning = useRef(false);
  useEffect(() => {
    if (!open && returning.current) { trigger.current?.focus(); returning.current = false; }
  }, [open]);

  function onBusyChange(value: boolean) { busyRef.current = value; setBusy(value); }
  function close() { if (!busyRef.current) { returning.current = true; setOpen(false); } }
  function finished(state: CourseEnrollmentState) {
    setResult(state);
    returning.current = true;
    setOpen(false);
  }
  function changeMode(value: "search" | "group") { if (!busyRef.current) setMode(value); }

  if (!open) return <div>
    <button ref={trigger} type="button" className={primary} onClick={() => { setResult(empty); setOpen(true); }}>
      Inscribir estudiantes
    </button>
    {result.message && <p role={result.ok ? "status" : "alert"}
      className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{result.message}</p>}
  </div>;

  return <section className="min-w-0 rounded-xl border border-blue-200 bg-white p-4 sm:p-5" aria-labelledby="inscribir">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="inscribir" className="text-lg font-bold text-slate-950">Inscribir estudiantes</h2>
      <button type="button" className={secondary} disabled={busy} onClick={close}>Cerrar</button>
    </div>
    {seatsLeft !== null && <p className="mt-1 text-sm text-slate-600">
      {seatsLeft === 0 ? "El curso está lleno: no quedan cupos." : seatsLeft === 1
        ? "Queda 1 cupo en el curso." : `Quedan ${seatsLeft} cupos en el curso.`}
    </p>}
    {groups.length > 0 && <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Cómo quieres inscribir">
      <button type="button" aria-pressed={mode === "search"} className={mode === "search" ? primary : secondary}
        disabled={busy} onClick={() => changeMode("search")}>Elegir estudiantes</button>
      <button type="button" aria-pressed={mode === "group"} className={mode === "group" ? primary : secondary}
        disabled={busy} onClick={() => changeMode("group")}>Inscribir un grupo completo</button>
    </div>}
    {mode === "group" && groups.length > 0
      ? <EnrollGroup courseId={courseId} groups={groups} onDone={finished} onBusyChange={onBusyChange} />
      : <EnrollPicker courseId={courseId} onDone={finished} onBusyChange={onBusyChange} />}
  </section>;
}

function EnrollGroup({ courseId, groups, onDone, onBusyChange }: EnrollmentProps & { groups: Group[] }) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [confirming, setConfirming] = useState(false);
  const groupSelect = useRef<HTMLSelectElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const review = useRef<HTMLDivElement>(null);
  const returning = useRef(false);
  const { busy, saving, error, clearError, submit } = useEnrollmentSubmission({ onDone, onBusyChange });
  const group = groups.find((entry) => entry.id === groupId);
  useEffect(() => { groupSelect.current?.focus(); }, []);
  useEffect(() => {
    if (confirming) review.current?.focus();
    else if (returning.current) { continueButton.current?.focus(); returning.current = false; }
  }, [confirming]);

  function back() { if (!busy.current) { returning.current = true; setConfirming(false); } }
  function confirm() {
    if (busy.current || !confirming || !group || group.members === 0) return;
    const data = new FormData();
    data.set("courseId", courseId);
    data.set("groupId", groupId);
    submit(enrollGroupAction, data);
  }

  return <div className="mt-4 min-w-0" onKeyDown={(event) => {
    if (event.key === "Escape" && confirming) { event.preventDefault(); back(); }
  }}>
    <label className="block text-sm font-medium text-slate-900" htmlFor="grupo-a-inscribir">Grupo</label>
    <select ref={groupSelect} id="grupo-a-inscribir" value={groupId} disabled={saving}
      onChange={(event) => { if (!busy.current) { setGroupId(event.target.value); setConfirming(false); clearError(); } }}
      className={`${field} mt-1`}>
      {groups.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} ({people(entry.members)})</option>)}
    </select>
    {group && group.members === 0 ? <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
      Este grupo todavía no tiene estudiantes. Elige otro o inscribe estudiantes uno por uno.
    </p> : !confirming ? <button ref={continueButton} type="button" className={`${primary} mt-4`}
      disabled={!group} onClick={() => setConfirming(true)}>Continuar</button> : (
      <div ref={review} tabIndex={-1} className="mt-4 rounded-lg bg-slate-50 p-4" role="alertdialog"
        aria-label="Confirmar inscripción del grupo">
        <p className="font-semibold text-slate-950 [overflow-wrap:anywhere]">
          Vas a inscribir al grupo «{group?.name}», que tiene {people(group?.members ?? 0)} en esta lista.
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Se revisarán los miembros actuales al confirmar. Quien ya está en el curso no se repite.
          Si no caben todos, no se inscribe a nadie y te decimos cuántos cupos quedan.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={primary} disabled={saving} onClick={(event) => { if (event.detail < 2) confirm(); }}>
            {saving ? "Inscribiendo…" : "Sí, inscribir al grupo"}
          </button>
          <button type="button" className={secondary} disabled={saving} onClick={back}>Cancelar</button>
        </div>
      </div>
    )}
    <EnrollmentNotice message={error} submission />
  </div>;
}
