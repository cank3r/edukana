import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { listGroups } from "@/server/academic/groups";
import { getLead } from "@/server/admissions/leads";
import { AdvanceLead, ConvertLead, DeleteLead, LeadForm, MoveLead, RejectLead } from "../LeadTools";
import { NEXT_STAGE, STAGE_HELP, STAGE_LABEL, STAGES, timeAgo, type Stage } from "../labels";

export const dynamic = "force-dynamic";

const ROLE_WORDS: Record<string, string> = { STUDENT: "estudiante", TEACHER: "docente", COORDINATOR: "coordinador", PARENT: "tutor", ADMIN: "administrador", SUPER_ADMIN: "administrador" };
const stageName = (value: unknown) => (STAGES.includes(value as Stage) ? STAGE_LABEL[value as Stage] : "otra etapa");

/** Una línea del historial en palabras llanas. */
function describe(action: string, changes: unknown): string {
  const data = (changes && typeof changes === "object" ? changes : {}) as Record<string, unknown>;
  const reason = typeof data.reason === "string" && data.reason ? ` Motivo: ${data.reason}` : "";
  switch (action) {
    case "ADMISSION_CREATED":
      return "Se registró la solicitud.";
    case "ADMISSION_STAGE_CHANGED":
      return `Pasó de «${stageName(data.from)}» a «${stageName(data.to)}».${reason}`;
    case "ADMISSION_UPDATED":
      return "Se corrigieron sus datos.";
    case "ADMISSION_CONVERTED":
      return data.created === false ? "Se vinculó con una persona que ya existía y quedó inscrita." : "Se convirtió en estudiante.";
    default:
      return "Se hizo un cambio.";
  }
}

export default async function LeadPage({ params }: { params: Promise<{ leadId: string }> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("admissions.manage")) redirect("/dashboard");

  const { leadId } = await params;
  const found = await getLead(user.institutionId, leadId);
  if (!found) notFound();
  const { lead, person, sameEmail, history } = found;
  const stage: Stage = lead.stage;
  const converted = Boolean(found.convertedUserId) || stage === "ENROLLED";
  const canConvert = capabilities.has("people.manage");
  const next = NEXT_STAGE[stage];

  const [institution, programs, groups] = await Promise.all([
    db.institution.findUnique({ where: { id: user.institutionId }, select: { timezone: true } }),
    db.program.findMany({ where: { institutionId: user.institutionId, isPublished: true }, orderBy: { name: "asc" }, select: { name: true } }),
    stage === "ACCEPTED" && canConvert ? listGroups(user.institutionId) : [],
  ]);
  const when = new Intl.DateTimeFormat("es", { timeZone: institution?.timezone ?? "America/Santo_Domingo", dateStyle: "medium", timeStyle: "short" });
  const lastReason = history.find((row) => row.action === "ADMISSION_STAGE_CHANGED" && (row.changes as { to?: unknown } | null)?.to === "REJECTED");
  const reasonText = (lastReason?.changes as { reason?: unknown } | null | undefined)?.reason;
  const linkable = sameEmail ? sameEmail.role === "STUDENT" && sameEmail.status === "ACTIVE" : true;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-8">
      <header>
        <h1 className="break-words text-2xl font-bold" style={{ color: "var(--navy)" }}>{lead.name}</h1>
        <p className="mt-1 text-sm text-slate-600">
          <span className="rounded-full bg-blue-50 px-2 py-1 font-semibold text-blue-800">{STAGE_LABEL[stage]}</span> {STAGE_HELP[stage]} Llegó {timeAgo(lead.createdAt)}.
        </p>
      </header>

      <section aria-label="Siguiente paso" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-950">Siguiente paso</h2>
        {next && <AdvanceLead leadId={lead.id} to={next} label={`Pasar a «${STAGE_LABEL[next]}»`} />}
        {stage === "ACCEPTED" && !converted && (
          !canConvert ? (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              Ya está admitida. Para convertirla en estudiante hay que crear a la persona en la institución, y eso solo puede hacerlo quien gestiona personas (normalmente un administrador). Pídele que abra esta solicitud y use «Convertir en estudiante».
            </p>
          ) : !linkable && sameEmail ? (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              El correo {lead.email} ya es de {sameEmail.name}, que está en tu institución como {ROLE_WORDS[sameEmail.role] ?? "otro rol"}{sameEmail.status === "ACTIVE" ? "" : " y tiene el acceso suspendido"}. No se puede convertir así: corrige el correo con «Editar datos» o revisa a esa persona en Personas.
            </p>
          ) : (
            <ConvertLead
              leadId={lead.id}
              name={lead.name}
              email={lead.email}
              existingName={sameEmail?.name ?? null}
              groups={groups.map((group) => ({ id: group.id, name: group.name, seatsLeft: group.capacity === null ? null : Math.max(0, group.capacity - group._count.members) }))}
            />
          )
        )}
        {converted && (
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
            Ya es estudiante de la institución.{" "}
            {person && capabilities.has("people.view") ? (
              <Link href={`/dashboard/gestion/estudiantes/${person.id}`} className="inline-flex min-h-11 items-center font-semibold underline">Ver la ficha de {person.name}</Link>
            ) : person ? (
              <>Su ficha está en Personas como {person.name}.</>
            ) : (
              <>No encontramos a la persona vinculada; búscala en Personas por su correo.</>
            )}
          </p>
        )}
        {stage === "REJECTED" && (
          <>
            {typeof reasonText === "string" && reasonText && <p className="text-sm text-slate-700">Motivo: {reasonText}</p>}
            <AdvanceLead leadId={lead.id} to="INTERESTED" label="Reabrir como «Interesado»" />
          </>
        )}
        {!converted && stage !== "REJECTED" && (
          <div className="flex flex-wrap gap-2">
            <RejectLead leadId={lead.id} name={lead.name} />
          </div>
        )}
      </section>

      <section aria-label="Datos" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-950">Datos</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Item label="Correo" value={lead.email} />
          <Item label="Teléfono" value={lead.phone ?? "No indicado"} />
          <Item label="Programa de interés" value={lead.programInterest ?? "No indicado"} />
          <Item label="De dónde vino" value={lead.source ?? "No indicado"} />
        </dl>
        <div>
          <h3 className="text-sm font-medium text-slate-600">Notas</h3>
          <p className="whitespace-pre-wrap break-words text-sm text-slate-900">{lead.notes ?? "Sin notas."}</p>
        </div>
        <LeadForm
          lead={{ id: lead.id, name: lead.name, email: lead.email, phone: lead.phone ?? "", programInterest: lead.programInterest ?? "", source: lead.source ?? "", notes: lead.notes ?? "" }}
          programs={programs.map((program) => program.name)}
          emailLocked={Boolean(found.convertedUserId)}
        />
      </section>

      <section aria-label="Historial" className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-950">Historial de cambios</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Todavía no hay cambios registrados. Aquí verás cada vez que cambie de etapa o se corrijan sus datos.</p>
        ) : (
          <ol className="mt-2 divide-y divide-slate-100">
            {history.map((row) => (
              <li key={row.id} className="py-2 text-sm">
                <p className="break-words text-slate-900">{describe(row.action, row.changes)}</p>
                <p className="text-xs text-slate-600">{when.format(row.createdAt)}{row.author ? ` · ${row.author}` : ""}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {!converted && (
        <details className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold text-slate-900">Opciones avanzadas</summary>
          <div className="mt-2 space-y-5">
            <MoveLead key={stage} leadId={lead.id} stage={stage} />
            <div>
              <p className="text-sm text-slate-600">Borra la solicitud solo si se registró por error.</p>
              <div className="mt-2"><DeleteLead leadId={lead.id} name={lead.name} /></div>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-medium text-slate-600">{label}</dt>
      <dd className="break-words text-slate-900">{value}</dd>
    </div>
  );
}
