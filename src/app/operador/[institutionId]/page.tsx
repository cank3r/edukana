import Link from "next/link";
import { notFound } from "next/navigation";
import { INSTITUTION_TYPE_OPTIONS } from "@/server/platform/institution-settings";
import { getInstitutionForOperator, type AdminInvitationState } from "@/server/platform/operator";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { formatOperatorDate } from "../format";
import { ResendInvitation } from "./ResendInvitation";

export const dynamic = "force-dynamic";

const STATE_TEXT: Record<AdminInvitationState, string> = {
  HAS_PASSWORD: "Ya creó su contraseña y puede entrar.",
  LINK_SENT: "Invitación enviada; todavía no crea su contraseña.",
  PENDING: "Todavía no crea su contraseña y no tiene un enlace vigente.",
  SUSPENDED: "Cuenta suspendida.",
};

export default async function OperatorInstitutionPage({ params }: { params: Promise<{ institutionId: string }> }) {
  const { institutionId } = await params;
  const institution = await getInstitutionForOperator(await getOperatorEmail(), institutionId);
  if (!institution) notFound();
  const type = INSTITUTION_TYPE_OPTIONS.find((option) => option.value === institution.type)?.label ?? "Otro";

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-8">
      <header>
        <Link href="/operador" className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline">Volver a instituciones</Link>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>{institution.name}</h1>
        <p className="mt-1 text-sm text-slate-600">{type} · alta el {formatOperatorDate(institution.createdAt)}</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Resumen">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-2xl font-bold text-slate-950">{institution.activePeople}</p><p className="text-sm text-slate-600">Personas activas</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-2xl font-bold text-slate-950">{institution.courses}</p><p className="text-sm text-slate-600">Cursos</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-2xl font-bold text-slate-950">{institution.withoutPassword}</p><p className="text-sm text-slate-600">Sin contraseña todavía</p></div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold" style={{ color: "var(--navy)" }}>Administración</h2>
        {institution.admins.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-700">Esta institución no tiene administradores.</p>
        ) : (
          <ul className="space-y-3">
            {institution.admins.map((admin) => (
              <li key={admin.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="font-semibold text-slate-950">{admin.name}</p>
                <p className="break-all text-sm text-slate-700">{admin.email}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {STATE_TEXT[admin.state]}
                  {admin.linkExpiresAt && ` El enlace vence el ${formatOperatorDate(admin.linkExpiresAt)}.`}
                </p>
                {(admin.state === "PENDING" || admin.state === "LINK_SENT") && <ResendInvitation institutionId={institution.id} adminUserId={admin.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--navy)" }}>Invitaciones pendientes</h2>
        <p className="text-sm text-slate-700">
          {institution.withoutPassword === 0
            ? "Todas las personas activas ya crearon su contraseña."
            : `${institution.withoutPassword} ${institution.withoutPassword === 1 ? "persona no ha" : "personas no han"} creado su contraseña. ${institution.pendingInvitations} de ellas no tiene${institution.pendingInvitations === 1 ? "" : "n"} un enlace vigente.`}
        </p>
        {institution.pendingInvitations > 0 && <p className="text-sm text-slate-600">La administración de la institución puede invitarlas desde Personas → Importar desde archivo e invitar.</p>}
      </section>

      <section className="space-y-1 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--navy)" }}>Identificador</h2>
        <p className="break-all font-mono text-sm text-slate-900">{institution.slug}</p>
        <p className="text-sm text-slate-600">Nombre corto y único de la institución. Su enlace de entrada con su nombre y colores es <span className="break-all font-mono">/login?institucion={institution.slug}</span>.</p>
      </section>
    </div>
  );
}
