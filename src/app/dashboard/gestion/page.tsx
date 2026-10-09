import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma, Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { roleLabel } from "@/lib/ux";
import { PersonAccess } from "./accesos/AccessTools";
import { AddPerson } from "./AddPerson";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const ROLE_FILTERS: { value: string; label: string; roles: Role[] }[] = [
  { value: "estudiantes", label: "Estudiantes", roles: ["STUDENT"] },
  { value: "docentes", label: "Docentes", roles: ["TEACHER"] },
  { value: "coordinadores", label: "Coordinadores", roles: ["COORDINATOR"] },
  { value: "tutores", label: "Tutores", roles: ["PARENT"] },
  { value: "administradores", label: "Administradores", roles: ["ADMIN", "SUPER_ADMIN"] },
];
const fieldClass = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500";
const secondary = "inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800";

type Params = { q?: string; rol?: string; estado?: string; pagina?: string; agregar?: string };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("people.view")) redirect("/dashboard");
  const canManage = capabilities.has("people.manage");

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
    select: { id: true, name: true, email: true, phone: true, role: true, status: true, identity: { select: { passwordHash: true } } },
  });

  const filtered = Boolean(q || roleFilter || suspended);
  const hrefFor = (overrides: Record<string, string>) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (roleFilter) query.set("rol", roleFilter.value);
    if (suspended) query.set("estado", "suspendidos");
    for (const [key, value] of Object.entries(overrides)) query.set(key, value);
    const text = query.toString();
    return text ? `/dashboard/gestion?${text}` : "/dashboard/gestion";
  };
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = (page - 1) * PAGE_SIZE + people.length;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Personas</h1>
        <p className="mt-1 text-sm text-slate-600">
          Todas las personas de tu institución: estudiantes, docentes, tutores y equipo.{canManage ? " Desde aquí puedes agregar, corregir, invitar y suspender." : ""}
        </p>
      </header>

      {canManage && (
        <div className="space-y-3">
          <AddPerson key={params.agregar ? "abierto" : "cerrado"} canAddAdmin={user.role === "ADMIN" || user.role === "SUPER_ADMIN"} startOpen={Boolean(params.agregar)} />
          <Link href="/dashboard/gestion/accesos" className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline">Importar desde archivo e invitar</Link>
        </div>
      )}

      <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end" role="search">
        <label className="block text-sm font-medium text-slate-900">
          Buscar
          <input name="q" defaultValue={q} placeholder="Nombre o correo…" className={fieldClass} />
        </label>
        <label className="block text-sm font-medium text-slate-900">
          Rol
          <select name="rol" defaultValue={roleFilter?.value ?? ""} className={fieldClass}>
            <option value="">Todos</option>
            {ROLE_FILTERS.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-900">
          Estado
          <select name="estado" defaultValue={suspended ? "suspendidos" : ""} className={fieldClass}>
            <option value="">Activos</option>
            <option value="suspendidos">Suspendidos</option>
          </select>
        </label>
        <button className="min-h-11 rounded-lg border border-blue-600 bg-white px-4 font-semibold text-blue-700" type="submit">Buscar</button>
      </form>

      <section aria-labelledby="lista-personas">
        <p id="lista-personas" className="text-sm font-medium text-slate-700" aria-live="polite">
          {total === 0 ? "Sin resultados" : total === 1 ? "1 persona" : pages > 1 ? `${first}–${last} de ${total} personas` : `${total} personas`}
          {filtered && <Link className="ml-2 inline-flex min-h-11 items-center text-blue-700 underline" href="/dashboard/gestion">Quitar filtros</Link>}
        </p>

        {people.length === 0 ? (
          <div className="mt-2 rounded-xl border border-slate-200 bg-white p-6 text-center">
            <p className="font-semibold text-slate-950">{filtered ? "Nadie coincide con lo que buscas" : "Todavía no hay personas aquí"}</p>
            <p className="mt-1 text-sm text-slate-600">
              {suspended && !q && !roleFilter
                ? "No hay personas suspendidas. Cuando suspendas a alguien, aparecerá aquí para que puedas reactivarlo."
                : filtered
                  ? "Revisa cómo está escrito el nombre o el correo, o cambia el rol y el estado."
                  : "Aquí verás a estudiantes, docentes, tutores y equipo de tu institución."}
              {canManage ? " Si la persona aún no está en la lista, agrégala." : ""}
            </p>
            {canManage && !params.agregar && <Link href="/dashboard/gestion?agregar=1" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white">Agregar persona</Link>}
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-4">
            {people.map((person) => {
              const detailHref = person.role === "STUDENT" ? `/dashboard/gestion/estudiantes/${person.id}` : undefined;
              const isSuspended = person.status !== "ACTIVE";
              const hasPassword = Boolean(person.identity?.passwordHash);
              if (canManage) {
                return (
                  <PersonAccess
                    key={person.id}
                    person={{ id: person.id, name: person.name, email: person.email, phone: person.phone ?? "", role: person.role, roleLabel: roleLabel(person.role), suspended: isSuspended, hasPassword, isSelf: person.id === user.id, detailHref }}
                  />
                );
              }
              return (
                <li key={person.id} className="py-3">
                  <p className="truncate font-semibold text-slate-950">
                    {detailHref ? <Link className="text-blue-700 underline" href={detailHref}>{person.name}</Link> : person.name}
                  </p>
                  <p className="truncate text-sm text-slate-600">{person.email} · {roleLabel(person.role)}</p>
                  <p className="mt-1 text-xs font-semibold">
                    {isSuspended ? <span className="rounded-full bg-red-50 px-2 py-1 text-red-700">Suspendido</span> : hasPassword ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">Puede entrar</span> : <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-800">Aún no crea su contraseña</span>}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        {pages > 1 && (
          <nav className="mt-4 flex items-center justify-between gap-2" aria-label="Páginas de la lista">
            {page > 1 ? <Link className={secondary} href={hrefFor({ pagina: String(page - 1) })}>Anterior</Link> : <span />}
            <span className="text-sm text-slate-600">Página {page} de {pages}</span>
            {page < pages ? <Link className={secondary} href={hrefFor({ pagina: String(page + 1) })}>Siguiente</Link> : <span />}
          </nav>
        )}
      </section>
    </div>
  );
}
