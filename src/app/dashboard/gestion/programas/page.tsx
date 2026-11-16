import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { listPrograms } from "@/server/academic/programs";
import { ProgramForm } from "./ProgramTools";
import { plural } from "@/lib/ux";

export const dynamic = "force-dynamic";


export default async function ProgramsPage({ searchParams }: { searchParams: Promise<{ crear?: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("academic.structure.manage")) redirect("/dashboard");

  const startOpen = Boolean((await searchParams).crear);
  const programs = await listPrograms(user.institutionId);

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Programas</h1>
        <p className="mt-1 text-sm text-slate-600">
          Un programa es una carrera o diplomado: una lista ordenada de cursos. Es opcional; si solo ofreces cursos sueltos no necesitas crear ninguno.
        </p>
      </header>

      <ProgramForm key={startOpen ? "abierto" : "cerrado"} startOpen={startOpen} />

      {programs.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
          <p className="font-semibold text-slate-950">Todavía no hay programas</p>
          <p className="mt-1 text-sm text-slate-600">Crea el primero para agrupar los cursos de una carrera en el orden en que se cursan. Después podrás armar grupos de estudiantes que lo sigan.</p>
          {!startOpen && <Link href="/dashboard/gestion/programas?crear=1" className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800">Crear el primer programa</Link>}
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-4">
          {programs.map((program) => (
            <li key={program.id}>
              <Link href={`/dashboard/gestion/programas/${program.id}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-blue-700 underline">{program.name}</span>
                  <span className="block text-sm text-slate-600">
                    {plural(program._count.courses, "curso", "cursos")} · {plural(program._count.groups, "grupo", "grupos")}
                  </span>
                </span>
                {!program.isPublished && <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">No se ofrece a grupos nuevos</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="text-sm text-slate-600">
        ¿Ya tienes un programa? <Link className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline" href="/dashboard/gestion/grupos">Arma un grupo de estudiantes</Link>
      </p>
    </div>
  );
}
