import { BarChart3, BookOpen, Megaphone, UserPlus, Users } from "lucide-react";
import type { Capability } from "@/lib/capabilities";
import { plural } from "@/lib/ux";
import { getCoordinatorHome, type CoordinatorActor } from "@/server/coordinator-home";
import { resolveBoardContext } from "@/server/dashboard/context";
import type { AttentionItem } from "./_tablero/Attention";
import { Board, type QuickAction } from "./_tablero/Board";

type Props = { actor: CoordinatorActor; capabilities: ReadonlySet<Capability>; userName?: string | null; query: { rango?: string; orden?: string } };

/** Inicio de quien coordina: el mismo tablero de la dirección, con los bloques que su rol permite ver. */
export async function CoordinatorHome({ actor, capabilities, userName, query }: Props) {
  const [ctx, home] = await Promise.all([resolveBoardContext(actor, capabilities, query.rango), getCoordinatorHome(actor, capabilities)]);
  const icon = (Icon: typeof UserPlus) => <Icon size={16} aria-hidden="true" />;

  // Las entregas atrasadas, el riesgo y las admisiones los resume el tablero; aquí quedan los cursos incompletos.
  const items: AttentionItem[] = [];
  const noStudents = home.gaps.filter((gap) => gap.noStudents).length;
  const noContent = home.gaps.filter((gap) => gap.noContent).length;
  if (noStudents > 0) {
    items.push({ id: "no-students", title: `${plural(noStudents, "curso no tiene", "cursos no tienen")} estudiantes inscritos`, detail: "Un estudiante solo ve los cursos en los que está inscrito.", href: "/dashboard/aula", action: "Inscribir estudiantes" });
  }
  if (noContent > 0) {
    items.push({ id: "no-content", title: `${plural(noContent, "curso no tiene", "cursos no tienen")} lecciones publicadas`, detail: "Sin lecciones publicadas el curso se ve vacío para sus estudiantes.", href: "/dashboard/aula", action: "Ver cursos" });
  }

  const actions: QuickAction[] = [
    { href: "/dashboard/aula", label: "Ver cursos", icon: icon(BookOpen) },
    ...(capabilities.has("announcement.publish") ? [{ href: "/dashboard/comunidad", label: "Publicar un aviso", icon: icon(Megaphone) }] : []),
    ...(capabilities.has("people.view") ? [{ href: "/dashboard/gestion", label: "Ver personas", icon: icon(Users) }] : []),
    ...(capabilities.has("admissions.manage") ? [{ href: "/dashboard/admisiones", label: "Admisiones", icon: icon(UserPlus) }] : []),
    ...(capabilities.has("analytics.view") ? [{ href: "/dashboard/analitica", label: "Ver reportes", icon: icon(BarChart3) }] : []),
  ];

  return <Board ctx={ctx} userName={userName} query={query} quickActions={actions} alerts={items} />;
}
