"use client";

import { useActionState, useMemo, useState } from "react";
import { AlertTriangle, Search, ShieldCheck } from "lucide-react";
import { saveRolePermissions, type RolePermissionsActionState } from "@/app/dashboard/configuracion/roles/actions";
import { CAPABILITY_CATALOG, CAPABILITIES, PROTECTED_ADMIN_CAPABILITIES, type Capability } from "@/lib/capabilities";
import { plural } from "@/lib/ux";
import type { EdukanaRole } from "@/types/next-auth";

const initialState: RolePermissionsActionState = { ok: false, message: "" };
const roleLabels: Record<EdukanaRole, string> = {
  SUPER_ADMIN: "Súper administrador",
  ADMIN: "Administrador",
  COORDINATOR: "Coordinador",
  TEACHER: "Docente",
  STUDENT: "Estudiante",
  PARENT: "Tutor",
};

type RoleConfig = {
  role: EdukanaRole;
  enabled: Capability[];
  allowed: Capability[];
  restriction: string | null;
};

export function RolePermissionsEditor({ roles, actorCapabilities }: { roles: RoleConfig[]; actorCapabilities: Capability[] }) {
  const [state, action, pending] = useActionState(saveRolePermissions, initialState);
  const [selectedRole, setSelectedRole] = useState<EdukanaRole>("COORDINATOR");
  const [search, setSearch] = useState("");
  const initialSelections = useMemo(
    () => Object.fromEntries(roles.map((item) => [item.role, item.enabled])) as Record<EdukanaRole, Capability[]>,
    [roles],
  );
  const [selections, setSelections] = useState<Record<EdukanaRole, Capability[]>>(initialSelections);
  const config = roles.find((item) => item.role === selectedRole)!;
  const selected = new Set(selections[selectedRole]);
  const initialSelected = new Set(initialSelections[selectedRole]);
  const actorSet = new Set(actorCapabilities);
  const allowedSet = new Set(config.allowed);
  const changes = CAPABILITIES.filter((capability) => actorSet.has(capability) && selected.has(capability) !== initialSelected.has(capability))
    .map((capability) => ({ capability, enabled: selected.has(capability) }));

  const groups = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    return CAPABILITIES.filter((capability) => {
      const item = CAPABILITY_CATALOG[capability];
      return !query || `${item.label} ${item.description} ${item.group}`.toLocaleLowerCase("es").includes(query);
    }).reduce<Record<string, Capability[]>>((result, capability) => {
      const group = CAPABILITY_CATALOG[capability].group;
      (result[group] ??= []).push(capability);
      return result;
    }, {});
  }, [search]);

  function toggle(capability: Capability) {
    const next = new Set(selections[selectedRole]);
    if (next.has(capability)) next.delete(capability);
    else next.add(capability);
    setSelections((current) => ({ ...current, [selectedRole]: [...next] }));
  }

  function confirmCriticalChange(event: React.FormEvent<HTMLFormElement>) {
    const critical = selectedRole === "ADMIN" || changes.some(({ capability }) => "critical" in CAPABILITY_CATALOG[capability]);
    if (critical && !window.confirm("Este cambio afecta permisos críticos. ¿Confirmas que deseas guardarlo?")) event.preventDefault();
  }

  return (
    <form action={action} onSubmit={confirmCriticalChange} className="space-y-5">
      <input type="hidden" name="role" value={selectedRole} />
      <input type="hidden" name="changes" value={JSON.stringify(changes)} />

      <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 lg:grid-cols-[18rem_1fr]">
        <div>
          <label htmlFor="permission-role" className="mb-2 block text-sm font-semibold text-slate-800">Rol institucional</label>
          <select id="permission-role" value={selectedRole} onChange={(event) => setSelectedRole(event.target.value as EdukanaRole)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500">
            {roles.map((item) => <option key={item.role} value={item.role}>{roleLabels[item.role]}</option>)}
          </select>
          <p className="mt-2 text-xs text-slate-500">Los cambios solo afectan a esta institución.</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={17} /> Seguridad primero</p>
          <p className="mt-1">No puedes conceder ni revocar permisos que no posees. Esos permisos se conservan como están aunque no aparezcan en este formulario.</p>
        </div>
      </div>

      {config.restriction && <div role="note" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><strong>Rol protegido.</strong> {config.restriction}</div>}

      <div className="relative">
        <label className="sr-only" htmlFor="permission-search">Buscar permisos</label>
        <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input id="permission-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar permisos…" className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-4 text-sm outline-none focus:border-blue-500" />
      </div>

      <div className="space-y-4">
        {Object.entries(groups).map(([group, capabilities]) => (
          <fieldset key={group} className="rounded-2xl border border-slate-200 bg-white p-5">
            <legend className="px-2 text-sm font-bold text-slate-900">{group}</legend>
            <div className="divide-y divide-slate-100">
              {capabilities.map((capability) => {
                const item = CAPABILITY_CATALOG[capability];
                const protectedAdmin = selectedRole === "ADMIN" && PROTECTED_ADMIN_CAPABILITIES.includes(capability as (typeof PROTECTED_ADMIN_CAPABILITIES)[number]);
                const disabled = Boolean(config.restriction) || !allowedSet.has(capability) || !actorSet.has(capability) || protectedAdmin;
                const checked = selected.has(capability);
                return <label key={capability} className={`flex gap-3 py-3 ${disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer"}`}><input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(capability)} className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600" /><span><span className="flex items-center gap-2 text-sm font-semibold text-slate-900">{item.label}{"critical" in item && item.critical && <ShieldCheck size={14} className="text-amber-600" />}</span><span className="block text-xs leading-5 text-slate-500">{item.description}</span></span></label>;
              })}
            </div>
          </fieldset>
        ))}
      </div>

      {state.message && <p role="status" className={`rounded-xl px-4 py-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p>}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">{plural(selected.size, "activa", "activas")} · {plural(changes.length, "cambio", "cambios")}</p><button type="submit" disabled={pending || Boolean(config.restriction) || changes.length === 0} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Guardando…" : "Guardar permisos"}</button></div>
    </form>
  );
}
