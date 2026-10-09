import { db } from "@/lib/db";
import { countPendingInvitations } from "@/server/people/invitations";

/** Días que una entrega puede esperar calificación antes de avisar a quien administra. */
export const STALE_SUBMISSION_DAYS = 7;

export type AdminHomeNumbers = {
  activeStudents: number;
  activeTeachers: number;
  courses: number;
  activeEnrollments: number;
  pendingInvitations: number;
  suspendedPeople: number;
};

export type AdminHomeAlert = {
  id: "period-missing" | "period-ended" | "invitations" | "empty-courses" | "stale-submissions";
  title: string;
  detail: string;
  href: string;
  action: string;
};

export type AdminHome = { institutionName: string; hasPeriod: boolean; numbers: AdminHomeNumbers; alerts: AdminHomeAlert[] };

/** Avisos que repiten un paso de «Primeros pasos»: mientras la guía se vea, no se muestran dos veces. */
export const ALERTS_IN_FIRST_STEPS: AdminHomeAlert["id"][] = ["period-missing", "invitations", "empty-courses"];

const plural = (count: number, one: string, many: string) => (count === 1 ? `1 ${one}` : `${count} ${many}`);

/**
 * Números y pendientes del inicio de quien administra, ya calculados.
 * Todo se cuenta dentro de la institución indicada, en una sola ronda de consultas.
 */
export async function getAdminHome(institutionId: string, now = new Date()): Promise<AdminHome> {
  const staleBefore = new Date(now.getTime() - STALE_SUBMISSION_DAYS * 24 * 60 * 60_000);
  const [
    institution,
    activeStudents,
    activeTeachers,
    courses,
    activeEnrollments,
    pendingInvitations,
    suspendedPeople,
    activePeriod,
    emptyCourses,
    staleSubmissions,
    periods,
  ] = await Promise.all([
    db.institution.findUnique({ where: { id: institutionId }, select: { name: true } }),
    db.user.count({ where: { institutionId, role: "STUDENT", status: "ACTIVE" } }),
    db.user.count({ where: { institutionId, role: "TEACHER", status: "ACTIVE" } }),
    db.course.count({ where: { institutionId } }),
    db.enrollment.count({ where: { status: "ACTIVE", course: { institutionId } } }),
    countPendingInvitations(institutionId, now),
    db.user.count({ where: { institutionId, status: "SUSPENDED" } }),
    // Si hay varios períodos activos, cuenta el que termina más tarde.
    db.academicPeriod.findFirst({
      where: { institutionId, isActive: true },
      orderBy: { endDate: "desc" },
      select: { name: true, endDate: true },
    }),
    // Un curso cuyos estudiantes ya lo completaron no está «sin estudiantes».
    db.course.count({ where: { institutionId, enrollments: { none: { status: { in: ["ACTIVE", "COMPLETED"] } } } } }),
    db.submission.count({
      where: { status: "SUBMITTED", submittedAt: { lt: staleBefore }, assignment: { course: { institutionId } } },
    }),
    db.academicPeriod.count({ where: { institutionId } }),
  ]);

  const alerts: AdminHomeAlert[] = [];
  if (!activePeriod) {
    alerts.push({
      id: "period-missing",
      title: "No hay un período académico en curso",
      detail: "Los cursos se crean dentro de un período, por ejemplo «Enero–Abril 2027».",
      href: "/dashboard/configuracion/periodos",
      action: "Crear período",
    });
  } else if (activePeriod.endDate < now) {
    alerts.push({
      id: "period-ended",
      title: `El período «${activePeriod.name}» ya terminó`,
      detail: "Crea el período siguiente para seguir abriendo cursos.",
      href: "/dashboard/configuracion/periodos",
      action: "Revisar períodos",
    });
  }
  if (pendingInvitations > 0) {
    alerts.push({
      id: "invitations",
      title: `${plural(pendingInvitations, "persona aún no puede", "personas aún no pueden")} entrar`,
      detail: "Les falta recibir el correo para crear su contraseña.",
      href: "/dashboard/gestion/accesos",
      action: "Enviar invitaciones",
    });
  }
  if (emptyCourses > 0) {
    alerts.push({
      id: "empty-courses",
      title: `${plural(emptyCourses, "curso no tiene", "cursos no tienen")} estudiantes inscritos`,
      detail: "Un estudiante solo ve los cursos en los que está inscrito.",
      href: "/dashboard/aula",
      action: "Inscribir estudiantes",
    });
  }
  if (staleSubmissions > 0) {
    alerts.push({
      id: "stale-submissions",
      title: `${plural(staleSubmissions, "entrega lleva", "entregas llevan")} más de ${STALE_SUBMISSION_DAYS} días sin calificar`,
      detail: "Los estudiantes esperan su nota. Revisa con el docente de cada curso.",
      href: "/dashboard/aula",
      action: "Ver cursos",
    });
  }

  return {
    institutionName: institution?.name ?? "",
    hasPeriod: periods > 0,
    numbers: { activeStudents, activeTeachers, courses, activeEnrollments, pendingInvitations, suspendedPeople },
    alerts,
  };
}
