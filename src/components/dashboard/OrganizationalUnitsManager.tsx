"use client";

import { useActionState } from "react";
import { addOrganizationalUnitMember, createOrganizationalUnit, removeOrganizationalUnitMember, renameOrganizationalUnit, type OrganizationalUnitActionState } from "@/app/dashboard/configuracion/unidades/actions";

const initial: OrganizationalUnitActionState = { ok: false, message: "" };
const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const primary = "rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
type Person = { id: string; name: string; detail: string };
type Unit = { id: string; name: string; memberships: Array<{ user: Person }> };

function Feedback({ state }: { state: OrganizationalUnitActionState }) {
  if (!state.message) return null;
  return <p className={`mt-2 rounded-lg px-3 py-2 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`} role="status">{state.message}</p>;
}

export function OrganizationalUnitsManager({ units, people }: { units: Unit[]; people: Person[] }) {
  const [state, action, pending] = useActionState(createOrganizationalUnit, initial);
  return <div className="space-y-6">
    <form action={action} className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-bold">Crear unidad</h2><p className="mb-3 text-sm text-slate-500">Añade un departamento, sede o unidad organizativa.</p>
      <div className="flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor="new-unit-name">Nombre de la unidad</label><input className={input} id="new-unit-name" maxLength={100} minLength={2} name="name" placeholder="Ej. Departamento de Ciencias" required /><button className={primary} disabled={pending} type="submit">{pending ? "Creando…" : "Crear unidad"}</button></div><Feedback state={state} />
    </form>
    <section aria-labelledby="units-heading"><h2 className="mb-3 text-lg font-bold" id="units-heading">Unidades configuradas</h2><div className="space-y-4">{units.map((unit) => <UnitCard key={unit.id} people={people} unit={unit} />)}{!units.length && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Todavía no hay unidades. Crea la primera para usarla al segmentar anuncios.</p>}</div></section>
  </div>;
}

function UnitCard({ unit, people }: { unit: Unit; people: Person[] }) {
  const [renameState, renameAction, renaming] = useActionState(renameOrganizationalUnit, initial);
  const [addState, addAction, adding] = useActionState(addOrganizationalUnitMember, initial);
  const assigned = new Set(unit.memberships.map((membership) => membership.user.id));
  const available = people.filter((person) => !assigned.has(person.id));
  return <article className="rounded-2xl border border-slate-200 bg-white p-5">
    <form action={renameAction}><input name="unitId" type="hidden" value={unit.id} /><div className="flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor={`unit-name-${unit.id}`}>Nombre de {unit.name}</label><input className={input} defaultValue={unit.name} id={`unit-name-${unit.id}`} maxLength={100} minLength={2} name="name" required /><button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={renaming} type="submit">{renaming ? "Guardando…" : "Guardar nombre"}</button></div><Feedback state={renameState} /></form>
    <div className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-sm font-bold">Miembros</h3>{unit.memberships.length ? <ul className="mt-2 divide-y divide-slate-100">{unit.memberships.map(({ user }) => <MemberRow key={user.id} unitId={unit.id} user={user} />)}</ul> : <p className="mt-2 text-sm text-slate-500">Sin miembros asignados.</p>}</div>
    <form action={addAction} className="mt-4"><input name="unitId" type="hidden" value={unit.id} /><label className="mb-1 block text-sm font-medium" htmlFor={`unit-member-${unit.id}`}>Asignar persona</label><div className="flex flex-col gap-2 sm:flex-row"><select className={input} defaultValue="" disabled={!available.length} id={`unit-member-${unit.id}`} name="userId" required><option disabled value="">Seleccionar persona…</option>{available.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.detail}</option>)}</select><button className={primary} disabled={adding || !available.length} type="submit">{adding ? "Asignando…" : "Asignar"}</button></div><Feedback state={addState} /></form>
  </article>;
}

function MemberRow({ unitId, user }: { unitId: string; user: Person }) {
  const [state, action, pending] = useActionState(removeOrganizationalUnitMember, initial);
  return <li className="py-2"><form action={action} className="flex items-center justify-between gap-3"><input name="unitId" type="hidden" value={unitId} /><input name="userId" type="hidden" value={user.id} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{user.name}</span><span className="block text-xs text-slate-500">{user.detail}</span></span><button className="rounded-lg px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50" disabled={pending} type="submit">{pending ? "Retirando…" : "Retirar"}</button></form><Feedback state={state} /></li>;
}
