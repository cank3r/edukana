import { BarChart3, BookOpen, Megaphone, UserPlus, Users } from "lucide-react";
import type { Capability } from "@/lib/capabilities";
import { plural } from "@/lib/ux";
import { STALE_SUBMISSION_DAYS } from "@/server/admin-home";
import { getCoordinatorHome, type CoordinatorActor } from "@/server/coordinator-home";
import { resolveBoardContext } from "@/server/dashboard/context";
import { Attention, type AttentionItem } from "./_tablero/Attention";
import { Board, type QuickAction } from "./_tablero/Board";

type Props = { actor: CoordinatorActor; capabilities: ReadonlySet<Capability>; userName?: string | null; query: { rango?: string; orden?: string } };

/** Cuántos cursos con entregas atrasadas se nombran en «Requiere tu atención»; el resto se resume. */
const LATE_SHOWN = 3;

/** Inicio de quien coordina: el mismo tablero de la dirección, con los bloques que su rol permite ver. */
export async function CoordinatorHome({ actor, capabilities, userName, query }: Props) {
  const [ctx, home] = await Promise.all([resolveBoardContext(actor, capabilities, query.rango), getCoordinatorHome(actor, capabilities)]);
  const icon = (Icon: typeof UserPlus) => <Icon size={16} aria-hidden="true" />;

  const items: AttentionItem[] = home.lateGrading.slice(0, LATE_SHOWN).map((course) => ({
    id: `late-${course.courseId}`,
    title: `${course.name}: ${plural(course.waiting, "entrega lleva", "entregas llevan")} más de ${STALE_SUBMISSION_DAYS} días sin nota`,
    detail: `Docente: ${course.teacherName}.`,
    href: `/dashboard/aula/${course.courseId}/tareas`,
    action: "Ver tareas",
  }));
  if (home.lateGrading.length > LATE_SHOWN) {
    const rest = home.lateGrading.length - LATE_SHOWN;
    items.push({ id: "late-rest", title: `${plural(rest, "curso más tiene", "cursos más tienen")} entregas atrasadas sin nota`, detail: "Revisa con el docente de cada curso.", href: "/dashboard/aula", action: "Ver cursos" });
  }
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

  return <Board ctx={ctx} userName={userName} query={query} quickActions={actions} attention={<Attention items={items} />} />;
}
