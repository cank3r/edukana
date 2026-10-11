import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma, Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { plural, roleLabel } from "@/lib/ux";
import { PersonAccess } from "./accesos/AccessTools";
import { AddPerson } from "./AddPerson";
import { peopleProfileHref, peopleReturnHref } from "./people-navigation";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;
const ROLE_FILTERS: { value: string; label: string; roles: Role[] }[] = [
  { value: "estudiantes", label: "Estudiantes", roles: ["STUDENT"] },
  { value: "docentes", label: "Docentes", roles: ["TEACHER"] },
  { value: "coordinadores", label: "Coordinadores", roles: ["COORDINATOR"] },
  { value: "tutores", label: "Tutores", roles: ["PARENT"] },
  { value: "administradores", label: "Administradores", roles: ["ADMIN", "SUPER_ADMIN"] },
];
const field = "mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base";
const secondary = "inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold";
const link = "inline-flex min-h-11 items-center text-sm font-semibold text-[var(--blue)] underline";
type Params = { q?: string; rol?: string; estado?: string; pagina?: string; agregar?: string };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("people.view")) redirect("/dashboard");
  const canManage = capabilities.has("people.manage");
  const canOrganize = capabilities.has("academic.structure.manage");
  const canManageAdminRoles = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const roleFilter = ROLE_FILTERS.find((filter) => filter.value === params.rol) ?? null;
  const suspended = params.estado === "suspendidos";
  const requestedPage = Math.max(1, Math.min(10_000, Number.parseInt(String(params.pagina ?? "1"), 10) || 1));
  const where: Prisma.UserWhereInput = {
    institutionId: user.institutionId,
    status: suspended ? "SUSPENDED" : "ACTIVE",
    ...(roleFilter ? { role: { in: roleFilter.roles } } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const total = await db.user.count({ where });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pages);
  const people = await db.user.findMany({
    where,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: { id: true, name: true, email: true, phone: true, role: true, status: true,
      identity: { select: { passwordHash: true } } },
  });
  const filtered = Boolean(q || roleFilter || suspended);
  function hrefFor(overrides: Record<string, string>) {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (roleFilter) query.set("rol", roleFilter.value);
    if (suspended) query.set("estado", "suspendidos");
    for (const [key, value] of Object.entries(overrides)) query.set(key, value);
    return query.size ? `/dashboard/gestion?${query}` : "/dashboard/gestion";
  }
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = (page - 1) * PAGE_SIZE + people.length;
  const returnHref = peopleReturnHref(hrefFor({ pagina: String(page) }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold text-[var(--navy)]">Personas</h1>
        <p className="mt-1 text-sm text-slate-600">
          Estudiantes, docentes, tutores y equipo de tu institución.
          {canManage ? " Busca a una persona para consultar sus datos o gestionar su acceso." : " Consulta sus datos y actividad."}
        </p>
      </header>
      {(canManage || canOrganize) && <div className="space-y-3">
        {canManage && <AddPerson key={params.agregar ? "abierto" : "cerrado"}
          canAddAdmin={canManageAdminRoles} startOpen={Boolean(params.agregar)} />}
        <div className="flex flex-wrap gap-x-5">
          {canManage && <Link href="/dashboard/gestion/accesos" className={link}>Importar e invitar</Link>}
          {canOrganize && <Link href="/dashboard/gestion/programas" className={link}>Programas</Link>}
          {canOrganize && <Link href="/dashboard/gestion/grupos" className={link}>Grupos</Link>}
        </div>
      </div>}
      <form key={`${q}-${roleFilter?.value}-${suspended}`} action="/dashboard/gestion" role="search" aria-label="Buscar personas"
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-end">
        <div><label htmlFor="people-search" className="text-sm font-medium">Buscar</label>
          <input id="people-search" name="q" defaultValue={q} maxLength={100} placeholder="Nombre o correo" className={field} />
        </div>
        <div><label htmlFor="people-role" className="text-sm font-medium">Rol</label>
          <select id="people-role" name="rol" defaultValue={roleFilter?.value ?? ""} className={field}>
            <option value="">Todos</option>
            {ROLE_FILTERS.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
          </select>
        </div>
        <div><label htmlFor="people-status" className="text-sm font-medium">Estado en la institución</label>
          <select id="people-status" name="estado" defaultValue={suspended ? "suspendidos" : ""} className={field}>
            <option value="">Activos</option><option value="suspendidos">Suspendidos</option>
          </select>
        </div>
        <button className={secondary} type="submit">Buscar</button>
      </form>
      <section aria-labelledby="lista-personas">
        <h2 id="lista-personas" className="text-lg font-bold text-[var(--navy)]">Directorio</h2>
        <p className="mt-1 text-sm text-slate-600">
          {suspended ? "Personas suspendidas en esta institución" : "Personas activas en esta institución"}
          {roleFilter ? ` · ${roleFilter.label}` : " · Todos los roles"}
        </p>
        {user.role === "TEACHER" && <p className="mt-2 text-sm text-slate-600">
          Para consultar la ficha de un estudiante, abre uno de tus cursos. Aquí puedes abrir tu propia ficha.
        </p>}
        <p className="mt-2 text-sm font-medium text-slate-700" aria-live="polite">
          {total === 0 ? "Sin resultados" : pages > 1 ? `${first}-${last} de ${total} personas` : plural(total, "persona", "personas")}
          {filtered && <Link className={`ml-3 ${link}`} href="/dashboard/gestion">Quitar filtros</Link>}
        </p>
        {people.length === 0 ? <div className="mt-2 rounded-xl border border-slate-200 bg-white p-6 text-center">
          <p className="font-semibold text-slate-950">
            {suspended && !q && !roleFilter ? "No hay personas suspendidas"
              : filtered ? "Nadie coincide con lo que buscas" : "Todavía no hay personas activas aquí"}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {suspended && !q && !roleFilter ? "Cuando suspendas a alguien, aparecerá aquí para que puedas reactivarlo."
              : filtered ? "Revisa el nombre o el correo, o cambia el rol y el estado."
              : "Aquí verás a estudiantes, docentes, tutores y equipo activos de tu institución."}
          </p>
          {canManage && !params.agregar && <Link href={hrefFor({ agregar: "1" })}
            className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[var(--blue)] px-4 py-2.5 font-semibold text-white">
            Agregar persona</Link>}
        </div> : <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-4 sm:px-5">
          {people.map((person) => {
            // The current query does not establish a teacher's relationship to another person.
            const detailHref = user.role !== "TEACHER" || person.id === user.id
              ? peopleProfileHref(person.id, returnHref) : undefined;
            const isSuspended = person.status !== "ACTIVE";
            const hasPassword = Boolean(person.identity?.passwordHash);
            if (canManage) return <PersonAccess key={person.id} person={{
              id: person.id, name: person.name, email: person.email, phone: person.phone ?? "", role: person.role,
              roleLabel: roleLabel(person.role), suspended: isSuspended, hasPassword, hasIdentity: Boolean(person.identity),
              canManageAdminRoles, isSelf: person.id === user.id, detailHref,
            }} />;
            return <li key={person.id} className="min-w-0 py-4">
              <p className="[overflow-wrap:anywhere] font-semibold text-[var(--navy)]">
                {detailHref ? <Link className="inline-flex min-h-11 max-w-full items-center text-[var(--blue)] underline"
                  href={detailHref}>{person.name}</Link> : person.name}
              </p>
              <p className="[overflow-wrap:anywhere] text-sm text-slate-600">{person.email}</p>
              <p className="mt-1 text-sm text-slate-600">{roleLabel(person.role)}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                <span className={`rounded-full px-2.5 py-1 ${isSuspended
                  ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{isSuspended ? "Suspendido" : "Activo"}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                  {hasPassword ? "Con contraseña" : "Sin contraseña"}
                </span>
              </div>
            </li>;
          })}
        </ul>}
        {pages > 1 && <nav className="mt-4 flex flex-wrap items-center justify-between gap-2" aria-label="Páginas de la lista">
          {page > 1 ? <Link className={secondary} href={hrefFor({ pagina: String(page - 1) })}>Anterior</Link> : <span />}
          <span className="text-sm text-slate-600">Página {page} de {pages}</span>
          {page < pages ? <Link className={secondary} href={hrefFor({ pagina: String(page + 1) })}>Siguiente</Link> : <span />}
        </nav>}
      </section>
    </div>
  );
}
