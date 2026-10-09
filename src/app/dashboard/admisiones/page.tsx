import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { admissionSummary, listLeadPrograms, listLeads } from "@/server/admissions/leads";
import { LeadForm } from "./LeadTools";
import { STAGE_HELP, STAGE_LABEL, STAGES, timeAgo, type Stage } from "./labels";

export const dynamic = "force-dynamic";

type Search = { q?: string; programa?: string; etapa?: string; crear?: string };

export default async function AdmisionesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("admissions.manage")) redirect("/dashboard");

  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 100);
  const program = (params.programa ?? "").trim().slice(0, 120);
  const startOpen = Boolean(params.crear);
  const filtering = Boolean(q || program);

  const institution = await db.institution.findUnique({ where: { id: user.institutionId }, select: { timezone: true } });
  const [leads, summary, usedPrograms, programs] = await Promise.all([
    listLeads(user.institutionId, { search: q, program }),
    admissionSummary(user.institutionId, institution?.timezone ?? "America/Santo_Domingo"),
    listLeadPrograms(user.institutionId),
    db.program.findMany({ where: { institutionId: user.institutionId, isPublished: true }, orderBy: { name: "asc" }, select: { name: true } }),
  ]);
  const programNames = programs.map((item) => item.name);
  const lowered = new Set(programNames.map((name) => name.toLowerCase()));
  const programOptions = [...programNames, ...usedPrograms.filter((name) => !lowered.has(name.toLowerCase()))];

  const byStage = new Map<Stage, typeof leads>(STAGES.map((stage) => [stage, []] as [Stage, typeof leads]));
  for (const lead of leads) byStage.get(lead.stage)?.push(lead);
  // En celular se ve una etapa a la vez: la pedida o, si no, la primera que tenga solicitudes.
  const asked = STAGES.find((stage) => stage === params.etapa);
  const selected: Stage = asked ?? STAGES.find((stage) => (byStage.get(stage)?.length ?? 0) > 0) ?? "INTERESTED";
  const tabHref = (stage: Stage) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (program) query.set("programa", program);
    query.set("etapa", stage);
    return `/dashboard/admisiones?${query.toString()}`;
  };
  const now = new Date();

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Admisiones</h1>
        <p className="mt-1 text-sm text-slate-600">Las personas que quieren entrar a la institución, ordenadas por la etapa en que van. Abre una solicitud para avanzarla o convertirla en estudiante.</p>
      </header>

      <LeadForm key={startOpen ? "abierto" : "cerrado"} programs={programOptions} startOpen={startOpen} />

      {summary.total === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
          <p className="font-semibold text-slate-950">Todavía no hay solicitudes</p>
          <p className="mt-1 text-sm text-slate-600">Cuando alguien pregunte por un programa, regístralo aquí con su nombre y correo. Luego podrás seguirlo etapa por etapa hasta que sea estudiante.</p>
          {!startOpen && <Link href="/dashboard/admisiones?crear=1" className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800">Registrar la primera solicitud</Link>}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <Figure label="Solicitudes abiertas" value={String(summary.open)} />
            <Figure label="Admitidas este mes" value={String(summary.admittedThisMonth)} />
            <Figure label="Terminan inscritas" value={summary.conversionRate === null ? "—" : `${summary.conversionRate} %`} hint={`${summary.enrolled} de ${summary.total}`} />
          </div>

          <form method="get" action="/dashboard/admisiones" className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            {asked && <input type="hidden" name="etapa" value={asked} />}
            <label className="block text-sm font-medium text-slate-900">
              Buscar por nombre o correo
              <input type="search" name="q" defaultValue={q} maxLength={100} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500" />
            </label>
            <label className="block text-sm font-medium text-slate-900">
              Programa
              <select name="programa" defaultValue={program} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500">
                <option value="">Todos los programas</option>
                {programOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800">Buscar</button>
              {filtering && <Link href="/dashboard/admisiones" className="inline-flex min-h-11 items-center px-2 font-semibold text-blue-700 underline">Quitar filtros</Link>}
            </div>
          </form>

          {filtering && leads.length === 0 && (
            <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700" role="status">Ninguna solicitud coincide con la búsqueda. Revisa cómo está escrito o quita los filtros.</p>
          )}

          <nav aria-label="Etapas" className="flex flex-wrap gap-2 lg:hidden">
            {STAGES.map((stage) => (
              <Link
                key={stage}
                href={tabHref(stage)}
                aria-current={stage === selected ? "page" : undefined}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-semibold ${stage === selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-800"}`}
              >
                {STAGE_LABEL[stage]}
                <span className={`rounded-full px-2 text-xs ${stage === selected ? "bg-white text-blue-700" : "bg-slate-100 text-slate-700"}`}>{byStage.get(stage)?.length ?? 0}</span>
              </Link>
            ))}
          </nav>

          <div className="lg:grid lg:grid-cols-3 lg:gap-4 xl:grid-cols-6">
            {STAGES.map((stage) => {
              const items = byStage.get(stage) ?? [];
              return (
                <section key={stage} aria-label={STAGE_LABEL[stage]} className={`${stage === selected ? "block" : "hidden"} min-w-0 rounded-xl bg-slate-100 p-3 lg:block`}>
                  <h2 className="flex items-center justify-between gap-2 font-semibold text-slate-950">
                    {STAGE_LABEL[stage]}
                    <span className="rounded-full bg-white px-2 text-sm text-slate-700">{items.length}</span>
                  </h2>
                  <p className="text-xs text-slate-600">{STAGE_HELP[stage]}</p>
                  {items.length === 0 ? (
                    <p className="mt-3 rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-600">Nadie en esta etapa.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {items.map((lead) => (
                        <li key={lead.id}>
                          <Link href={`/dashboard/admisiones/${lead.id}`} className="block min-h-11 rounded-lg border border-slate-200 bg-white p-3">
                            <span className="block break-words font-semibold text-blue-700 underline">{lead.name}</span>
                            <span className="block break-words text-sm text-slate-700">{lead.programInterest ?? "Sin programa indicado"}</span>
                            <span className="block text-xs text-slate-600">Llegó {timeAgo(lead.createdAt, now)}{lead.source ? ` · ${lead.source}` : ""}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
          {leads.length === 500 && <p className="text-sm text-slate-600">Se muestran las 500 solicitudes más recientes. Usa la búsqueda para encontrar las anteriores.</p>}
        </>
      )}
    </div>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xl font-bold text-slate-950">{value}</p>
      <p className="text-xs text-slate-600">{label}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
