import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { roleLabel } from "@/lib/ux";
import { countPendingInvitations } from "@/server/people/invitations";
import { ImportPeople, InvitePending, PersonAccess } from "./AccessTools";

export const dynamic = "force-dynamic";

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("people.manage")) redirect("/dashboard");

  const q = (await searchParams).q?.trim().slice(0, 100) ?? "";
  const search = q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }] } : null;
  const [pending, suspendedCount, people] = await Promise.all([
    countPendingInvitations(user.institutionId),
    db.user.count({ where: { institutionId: user.institutionId, status: "SUSPENDED" } }),
    // Sin búsqueda se muestran solo las personas suspendidas: son las únicas que necesitan atención aquí.
    db.user.findMany({
      where: { institutionId: user.institutionId, ...(search ?? { status: "SUSPENDED" as const }) },
      orderBy: { name: "asc" },
      take: 50,
      select: { id: true, name: true, email: true, phone: true, role: true, status: true, identity: { select: { passwordHash: true } } },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Importar e invitar</h1>
        <p className="mt-1 text-sm text-slate-600">Agrega personas desde una lista, envíales su invitación y controla quién puede entrar.</p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="paso-importar">
        <h2 id="paso-importar" className="text-lg font-bold text-slate-950">1. Agregar personas desde un archivo</h2>
        <p className="mt-1 text-sm text-slate-600">
          Usa una hoja de cálculo guardada como CSV con las columnas <strong>Nombre</strong> y <strong>Correo</strong>. Puedes añadir <strong>Rol</strong> (estudiante, docente o tutor) y <strong>Teléfono</strong>. Antes de crear nada verás un resumen.
        </p>
        <a className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline" href={`data:text/csv;charset=utf-8,${encodeURIComponent("Nombre,Correo,Rol,Teléfono\nAna Pérez,ana@correo.com,estudiante,8095550100\n")}`} download="plantilla-personas.csv">Descargar plantilla de ejemplo</a>
        <ImportPeople />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="paso-invitar">
        <h2 id="paso-invitar" className="text-lg font-bold text-slate-950">2. Enviar invitaciones</h2>
        <InvitePending pending={pending} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="paso-acceso">
        <h2 id="paso-acceso" className="text-lg font-bold text-slate-950">3. Corregir, suspender o reactivar a una persona</h2>
        <p className="mt-1 text-sm text-slate-600">Suspender impide entrar de inmediato y no borra nada: cursos, notas y entregas se conservan.</p>
        <form className="mt-3 flex gap-2" role="search">
          <label className="sr-only" htmlFor="buscar-persona">Buscar persona por nombre o correo</label>
          <input id="buscar-persona" name="q" defaultValue={q} placeholder="Buscar por nombre o correo…" className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base outline-none focus:border-blue-500" />
          <button className="min-h-11 rounded-lg border border-blue-600 px-4 font-semibold text-blue-700" type="submit">Buscar</button>
        </form>
        <p className="mt-3 text-sm font-medium text-slate-700">
          {q ? `Resultados para «${q}»` : `Personas suspendidas (${suspendedCount})`}
          {q && <Link className="ml-2 text-blue-700 underline" href="/dashboard/gestion/accesos">Quitar búsqueda</Link>}
        </p>
        {people.length === 0 ? (
          <p className="mt-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            {q ? "Nadie coincide con esa búsqueda. Revisa cómo está escrito el nombre o el correo." : "No hay personas suspendidas. Para corregir o suspender a alguien, búscalo por nombre o correo."}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {people.map((person) => (
              <PersonAccess
                key={person.id}
                person={{
                  id: person.id,
                  name: person.name,
                  email: person.email,
                  phone: person.phone ?? "",
                  role: person.role,
                  roleLabel: roleLabel(person.role),
                  suspended: person.status !== "ACTIVE",
                  hasPassword: Boolean(person.identity?.passwordHash),
                  isSelf: person.id === user.id,
                }}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
