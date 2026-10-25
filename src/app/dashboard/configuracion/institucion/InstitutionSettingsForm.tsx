"use client";

import { useActionState, useState } from "react";
import type { AcademicActionState } from "@/server/academic/guard";
import { updateInstitutionSettingsAction } from "@/server/actions/institution-settings";

const primary = "min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const fieldClass = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500";
const empty: AcademicActionState = { ok: false, message: "" };

type Option = { value: string; label: string };
type Props = {
  institution: { name: string; type: string; timezone: string; language: string };
  types: Option[];
  languages: Option[];
  latinAmerica: Option[];
  otherZones: Option[];
};

export function InstitutionSettingsForm({ institution, types, languages, latinAmerica, otherZones }: Props) {
  const [name, setName] = useState(institution.name);
  const [type, setType] = useState(institution.type);
  const [timezone, setTimezone] = useState(institution.timezone);
  const [language, setLanguage] = useState(institution.language);
  /** Zona guardada: la del servidor hasta que un guardado correcto la cambie. */
  const [savedZone, setSavedZone] = useState(institution.timezone);
  const [state, action, pending] = useActionState(async (previous: AcademicActionState, data: FormData) => {
    const result = await updateInstitutionSettingsAction(previous, data);
    if (result.ok) setSavedZone(String(data.get("timezone") ?? ""));
    return result;
  }, empty);
  const zoneChanged = timezone !== savedZone;

  return (
    <form action={action} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <label className="block text-sm font-medium text-slate-900">
        Nombre de la institución
        <input name="name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={160} className={fieldClass} autoComplete="organization" />
        <span className="mt-1 block text-sm font-normal text-slate-600">Es el nombre que ven todas las personas al entrar y en los correos de invitación.</span>
      </label>

      <label className="block text-sm font-medium text-slate-900">
        Tipo de institución
        <select name="type" value={type} onChange={(event) => setType(event.target.value)} className={fieldClass}>
          {types.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>

      <label className="block text-sm font-medium text-slate-900">
        Zona horaria
        <select name="timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} className={fieldClass}>
          <optgroup label="América Latina">
            {latinAmerica.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </optgroup>
          <optgroup label="Resto del mundo">
            {otherZones.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </optgroup>
        </select>
        <span className="mt-1 block text-sm font-normal text-slate-600">Elige el lugar donde está tu institución. Con esa hora se muestran las clases y las fechas límite.</span>
      </label>
      {zoneChanged && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Vas a cambiar la zona horaria. Al guardar, las horas de las clases y las fechas límite de tareas y exámenes se mostrarán a todas las personas con la hora del nuevo lugar. Las clases y fechas ya creadas no se mueven; solo cambia cómo se ve la hora.
        </p>
      )}

      <label className="block text-sm font-medium text-slate-900">
        Idioma
        <select name="language" value={language} onChange={(event) => setLanguage(event.target.value)} className={fieldClass}>
          {languages.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>

      <button className={primary} type="submit" disabled={pending}>{pending ? "Guardando…" : zoneChanged ? "Guardar y cambiar la zona horaria" : "Guardar cambios"}</button>
      {state.message && <p role={state.ok ? "status" : "alert"} className={`rounded-lg p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p>}
    </form>
  );
}
