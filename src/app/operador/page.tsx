import Link from "next/link";
import { notFound } from "next/navigation";
import { INSTITUTION_TYPE_OPTIONS } from "@/server/platform/institution-settings";
import { listInstitutionsForOperator, OPERATOR_LIST_LIMIT } from "@/server/platform/operator";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { formatOperatorDate } from "./format";
import { plural } from "@/lib/ux";

export const dynamic = "force-dynamic";

const primary = "inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white";
const fieldClass = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500";
const typeLabel = (type: string) => INSTITUTION_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? "Otro";

export default async function OperatorHomePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const institutions = await listInstitutionsForOperator(await getOperatorEmail(), q);
  if (!institutions) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Instituciones</h1>
          <p className="mt-1 text-sm text-slate-600">Todas las instituciones de la plataforma. Crea una nueva y su administrador recibe la invitación por correo.</p>
        </div>
        <Link href="/operador/nueva" className={primary}>Crear institución</Link>
      </header>

      <form role="search" className="flex gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <label className="sr-only" htmlFor="buscar-institucion">Buscar institución</label>
        <input id="buscar-institucion" name="q" defaultValue={q} placeholder="Buscar por nombre o identificador" className={fieldClass} />
        <button type="submit" className="min-h-11 shrink-0 rounded-lg border border-slate-300 bg-white px-4 font-semibold text-slate-800">Buscar</button>
      </form>

      {institutions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <p className="font-semibold text-slate-900">{q ? "Ninguna institución coincide con la búsqueda." : "Todavía no hay instituciones."}</p>
          <p className="mt-1 text-sm text-slate-600">{q ? "Prueba con otra parte del nombre." : "Crea la primera y su administrador recibirá la invitación."}</p>
          {q ? <Link href="/operador" className="mt-3 inline-flex min-h-11 items-center font-semibold text-blue-700 underline">Ver todas</Link>
            : <Link href="/operador/nueva" className={`${primary} mt-3`}>Crear institución</Link>}
        </div>
      ) : (
        <ul className="space-y-3">
          {institutions.map((institution) => (
            <li key={institution.id}>
              <Link href={`/operador/${institution.id}`} className="block rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-500">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-base font-semibold text-slate-950">{institution.name}</span>
                  <span className="text-sm text-slate-600">{typeLabel(institution.type)}</span>
                </span>
                <span className="mt-1 block text-sm text-slate-700">
                  {plural(institution.activePeople, "persona activa", "personas activas")} · {plural(institution.courses, "curso", "cursos")}
                </span>
                <span className="mt-1 block text-sm text-slate-600">Alta: {formatOperatorDate(institution.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {institutions.length === OPERATOR_LIST_LIMIT && (
        <p className="text-sm text-slate-600">Se muestran las {OPERATOR_LIST_LIMIT} más recientes. Usa la búsqueda para encontrar otras.</p>
      )}
    </div>
  );
}
