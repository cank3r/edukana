import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { listGroups } from "@/server/academic/groups";
import { groupDates, groupOccupancy } from "./format";
import { GroupForm } from "./GroupTools";

export const dynamic = "force-dynamic";

export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ crear?: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("academic.structure.manage")) redirect("/dashboard");

  const startOpen = Boolean((await searchParams).crear);
  const [groups, programs] = await Promise.all([
    listGroups(user.institutionId),
    db.program.findMany({ where: { institutionId: user.institutionId, isPublished: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Grupos</h1>
        <p className="mt-1 text-sm text-slate-600">
          Un grupo es un conjunto de estudiantes que cursan juntos, con fechas; por ejemplo «Enfermería 2027 — Noche». Sirve para inscribirlos a todos en sus cursos de una vez. Es opcional.
        </p>
      </header>

      <GroupForm key={startOpen ? "abierto" : "cerrado"} programs={programs} startOpen={startOpen} />

      {groups.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
          <p className="font-semibold text-slate-950">Todavía no hay grupos</p>
          <p className="mt-1 text-sm text-slate-600">Crea el primero, agrégale sus estudiantes y sus cursos, e inscríbelos a todos con un solo botón.</p>
          {!startOpen && <Link href="/dashboard/gestion/grupos?crear=1" className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800">Crear el primer grupo</Link>}
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-4">
          {groups.map((group) => (
            <li key={group.id}>
              <Link href={`/dashboard/gestion/grupos/${group.id}`} className="block min-h-11 py-3">
                <span className="block truncate font-semibold text-blue-700 underline">{group.name}</span>
                <span className="block text-sm text-slate-600">{group.program ? group.program.name : "Sin programa"} · {groupDates(group.startsOn, group.endsOn)}</span>
                <span className="block text-sm text-slate-600">
                  {groupOccupancy(group._count.members, group.capacity)} · {group._count.courses === 1 ? "1 curso" : `${group._count.courses} cursos`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="text-sm text-slate-600">
        ¿Quieres ordenar los cursos de una carrera? <Link className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline" href="/dashboard/gestion/programas">Ver programas</Link>
      </p>
    </div>
  );
}
