"use client";

import { useEffect, useRef, useState } from "react";
import { enrollStudentsAction, searchEnrollableStudentsAction } from "@/server/actions/course-enrollment";
import { EnrollmentNotice, field, people, primary, secondary, useEnrollmentSubmission, type EnrollmentProps } from "./enrollment-ui";

type Candidate = { id: string; name: string; email: string };
const unloaded = { students: [] as Candidate[], more: false, error: "", loaded: false };

export function EnrollPicker({ courseId, onDone, onBusyChange }: EnrollmentProps) {
  const [query, setQuery] = useState("");
  const [retry, setRetry] = useState(0);
  const [found, setFound] = useState(unloaded);
  const [selected, setSelected] = useState<Map<string, Candidate>>(new Map());
  const [confirming, setConfirming] = useState(false);
  const searchVersion = useRef(0);
  const searchInput = useRef<HTMLInputElement>(null);
  const review = useRef<HTMLDivElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const returning = useRef(false);
  const { busy, saving, error, submit } = useEnrollmentSubmission({ onDone, onBusyChange });

  useEffect(() => { searchInput.current?.focus(); }, []);
  useEffect(() => {
    if (confirming) review.current?.focus();
    else if (returning.current) { continueButton.current?.focus(); returning.current = false; }
  }, [confirming]);
  useEffect(() => {
    const version = ++searchVersion.current;
    const timer = setTimeout(async () => {
      try {
        const result = await searchEnrollableStudentsAction(courseId, query);
        if (version === searchVersion.current) {
          setFound({ students: result.students, more: result.more, error: result.ok ? "" : result.message, loaded: true });
        }
      } catch {
        if (version === searchVersion.current) {
          setFound({ ...unloaded, loaded: true, error: "No se pudo completar la búsqueda. Puedes intentarlo de nuevo." });
        }
      }
    }, 250);
    return () => { clearTimeout(timer); if (version === searchVersion.current) searchVersion.current += 1; };
  }, [courseId, query, retry]);

  function resetSearch() { searchVersion.current += 1; setFound(unloaded); }
  function toggle(student: Candidate) {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(student.id)) next.delete(student.id);
      else next.set(student.id, student);
      return next;
    });
  }
  function selectShown() {
    setSelected((current) => {
      const next = new Map(current);
      for (const student of found.students) next.set(student.id, student);
      return next;
    });
  }
  function back() {
    if (busy.current) return;
    returning.current = true;
    setConfirming(false);
  }
  function confirm() {
    if (busy.current || !confirming || selected.size === 0) return;
    const data = new FormData();
    data.set("courseId", courseId);
    for (const id of selected.keys()) data.append("studentIds", id);
    submit(enrollStudentsAction, data);
  }

  if (confirming) {
    const chosen = [...selected.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
    return <div ref={review} tabIndex={-1} className="mt-4 min-w-0 rounded-lg bg-slate-50 p-4"
      role="alertdialog" aria-label="Confirmar inscripción" onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); back(); }
      }}>
      <p className="font-semibold text-slate-950">Vas a inscribir a {people(chosen.length)}</p>
      <p className="mt-1 text-sm text-slate-600">
        Verán el curso de inmediato. Quien ya estuvo antes en el curso vuelve con sus notas y su avance.
      </p>
      <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm text-slate-800">
        {chosen.map((student) => <li key={student.id} className="[overflow-wrap:anywhere]">{student.name}</li>)}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={primary} disabled={saving} onClick={(event) => { if (event.detail < 2) confirm(); }}>
          {saving ? "Inscribiendo…" : `Sí, inscribir a ${people(chosen.length)}`}
        </button>
        <button type="button" className={secondary} disabled={saving} onClick={back}>Volver a elegir</button>
      </div>
      <EnrollmentNotice message={error} submission />
    </div>;
  }

  return <div className="mt-4 min-w-0">
    <label className="block text-sm font-medium text-slate-900" htmlFor="buscar-para-inscribir">Busca por nombre o correo</label>
    <input ref={searchInput} id="buscar-para-inscribir" type="search" value={query}
      onChange={(event) => { resetSearch(); setQuery(event.target.value); }} placeholder="Escribe un nombre…"
      className={`${field} mt-1`} autoComplete="off" />
    <div aria-live="polite">
      {found.error ? <>
        <EnrollmentNotice message={found.error} />
        <button type="button" className={`${secondary} mt-3`} onClick={() => { resetSearch(); setRetry((value) => value + 1); }}>
          Reintentar búsqueda
        </button>
      </> : !found.loaded ? <p className="mt-3 text-sm text-slate-600">Buscando…</p>
        : found.students.length === 0 ? <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          {query.trim() ? "Nadie coincide con esa búsqueda entre los estudiantes que aún no están en el curso."
            : "Todos los estudiantes activos ya están en este curso. Para sumar a alguien nuevo, agrégalo primero en Personas."}
        </p> : <>
          <ul className="mt-3 max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {found.students.map((student) => <li key={student.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2">
                <input type="checkbox" className="h-5 w-5 shrink-0" checked={selected.has(student.id)} onChange={() => toggle(student)} />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-950">{student.name}</span>
                  <span className="block truncate text-sm text-slate-600">{student.email}</span>
                </span>
              </label>
            </li>)}
          </ul>
          {found.more && <p className="mt-2 text-sm text-slate-600">Hay más estudiantes. Escribe un nombre para encontrarlos.</p>}
        </>}
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button ref={continueButton} type="button" className={primary} disabled={selected.size === 0}
        onClick={() => setConfirming(true)}>
        {selected.size === 0 ? "Elige a quién inscribir" : `Continuar con ${people(selected.size)}`}
      </button>
      {found.students.length > 1 && <button type="button" className={secondary} onClick={selectShown}>
        Marcar los {found.students.length} de la lista
      </button>}
      {selected.size > 0 && <button type="button" className={secondary} onClick={() => setSelected(new Map())}>Quitar selección</button>}
    </div>
    <EnrollmentNotice message={error} submission />
  </div>;
}
