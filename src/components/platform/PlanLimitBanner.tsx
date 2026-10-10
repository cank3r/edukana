import { auth } from "@/lib/auth";
import { getInstitutionPlanUsage } from "@/server/platform/limits";

/** Informational only. Never blocks the institution's normal work. */
export async function PlanLimitBanner({ institutionId }: { institutionId: string }) {
  const session = await auth();
  if (!session?.user || session.user.institutionId !== institutionId || !["ADMIN", "SUPER_ADMIN"].includes(session.user.role)) return null;
  const usage = await getInstitutionPlanUsage(institutionId);
  if (!usage) return null;
  const plan = usage.subscription.plan;
  const limits = [
    { used: usage.students, max: plan.maxStudents, label: "estudiantes" },
    { used: usage.storageMb, max: plan.maxStorageMb, label: "MB de almacenamiento" },
    { used: usage.aiRequests, max: plan.aiRequestsPerMonth, label: "pedidos de IA este mes" },
  ].filter((value) => value.max !== null && value.used >= value.max);
  if (!limits.length) return null;
  return <aside role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
    Llegaste al límite de tu plan: {limits.map((value) => `${Number.isInteger(value.used) ? value.used : value.used.toFixed(1)}/${value.max} ${value.label}`).join("; ")}.
    {" "}Escríbenos para ampliarlo.
  </aside>;
}
