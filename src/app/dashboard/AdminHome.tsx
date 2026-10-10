import { BarChart3, BookOpen, CalendarPlus, CreditCard, Megaphone, UserPlus } from "lucide-react";
import type { Capability } from "@/lib/capabilities";
import { ALERTS_IN_FIRST_STEPS, getAdminHome } from "@/server/admin-home";
import { resolveBoardContext, type BoardActor } from "@/server/dashboard/context";
import { getFirstStepsGuide } from "@/server/first-steps";
import { Board, type QuickAction } from "./_tablero/Board";
import { FirstSteps } from "./FirstSteps";

type Props = { actor: BoardActor; capabilities: ReadonlySet<Capability>; userName?: string | null; query: { rango?: string; orden?: string } };

/**
 * Inicio de quien administra: tablero de control de la institución.
 * En una institución nueva se ve la misma estructura con «—» y, arriba, los primeros pasos.
 */
export async function AdminHome({ actor, capabilities, userName, query }: Props) {
  const canManagePeople = capabilities.has("people.manage");
  const [ctx, home, guide] = await Promise.all([
    resolveBoardContext(actor, capabilities, query.rango),
    getAdminHome(actor.institutionId),
    canManagePeople ? getFirstStepsGuide(actor.institutionId) : null,
  ]);
  const showGuide = Boolean(guide?.visible);
  // Lo que ya pide «Primeros pasos» no se repite en «Requiere tu atención», y las entregas atrasadas
  // las resume el propio tablero (junto con riesgo, cobros y admisiones).
  const alerts = home.alerts.filter((alert) => alert.id !== "stale-submissions" && !(showGuide && ALERTS_IN_FIRST_STEPS.includes(alert.id)));
  const icon = (Icon: typeof UserPlus) => <Icon size={16} aria-hidden="true" />;

  const actions: QuickAction[] = [
    ...(canManagePeople ? [{ href: "/dashboard/gestion/accesos", label: "Agregar personas", icon: icon(UserPlus) }] : []),
    home.hasPeriod
      ? { href: "/dashboard/aula", label: "Crear un curso", icon: icon(BookOpen) }
      : { href: "/dashboard/configuracion/periodos", label: "Crear un período", icon: icon(CalendarPlus) },
    ...(capabilities.has("announcement.publish") ? [{ href: "/dashboard/comunidad", label: "Publicar un aviso", icon: icon(Megaphone) }] : []),
    ...(capabilities.has("finance.manage") ? [{ href: "/dashboard/pagos", label: "Registrar un pago", icon: icon(CreditCard) }] : []),
    ...(capabilities.has("analytics.view") ? [{ href: "/dashboard/analitica", label: "Ver reportes", icon: icon(BarChart3) }] : []),
  ];

  return (
    <Board
      ctx={ctx}
      userName={userName}
      query={query}
      quickActions={actions}
      firstSteps={showGuide && guide ? <FirstSteps steps={guide.steps} /> : null}
      alerts={alerts}
      attentionEmpty={showGuide ? { title: "Empieza por los primeros pasos", detail: "Cuando la institución funcione, aquí aparecerá lo que necesite tu atención." } : undefined}
    />
  );
}
