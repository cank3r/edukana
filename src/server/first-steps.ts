import { db } from "@/lib/db";
import { countPendingInvitations } from "@/server/people/invitations";

export type FirstStep = { id: string; title: string; detail: string; href: string; action: string; done: boolean };

/**
 * Pasos para poner en marcha una institución, en el orden en que hay que hacerlos.
 * Cada uno se marca solo a partir de los datos reales: nadie tiene que "darlo por hecho".
 */
export async function getFirstSteps(institutionId: string): Promise<FirstStep[]> {
  const [periods, people, courses, enrollments, pendingInvitations] = await Promise.all([
    db.academicPeriod.count({ where: { institutionId } }),
    db.user.count({ where: { institutionId, role: { in: ["STUDENT", "TEACHER"] } } }),
    db.course.count({ where: { institutionId } }),
    db.enrollment.count({ where: { course: { institutionId } } }),
    countPendingInvitations(institutionId),
  ]);
  return [
    {
      id: "period",
      title: "Crea el período académico",
      detail: "Es el tiempo en que se dan las clases, por ejemplo «Enero–Abril 2027». Los cursos se crean dentro de un período.",
      href: "/dashboard/configuracion/periodos",
      action: "Crear período",
      done: periods > 0,
    },
    {
      id: "people",
      title: "Agrega docentes y estudiantes",
      detail: "Súbelos todos de una vez desde una hoja de cálculo, o créalos uno por uno.",
      href: "/dashboard/gestion/accesos",
      action: "Agregar personas",
      done: people > 0,
    },
    {
      id: "course",
      title: "Crea el primer curso",
      detail: "Ponle nombre, elige su docente y el período.",
      href: "/dashboard/aula",
      action: "Crear curso",
      done: courses > 0,
    },
    {
      id: "enrollment",
      title: "Inscribe estudiantes en el curso",
      detail: "Un estudiante solo ve los cursos en los que está inscrito.",
      href: "/dashboard/aula",
      action: "Inscribir estudiantes",
      done: enrollments > 0,
    },
    {
      id: "invitations",
      title: "Envía las invitaciones",
      detail: "Cada persona recibe un correo para crear su contraseña. Sin esto no pueden entrar.",
      href: "/dashboard/gestion/accesos",
      action: "Enviar invitaciones",
      done: people > 0 && pendingInvitations === 0,
    },
  ];
}
