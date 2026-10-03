import { hasCapability } from "@/lib/capabilities";
import type { EdukanaRole } from "@/types/next-auth";

export type NavigationItem = {
  label: string;
  href: string;
  icon: "home" | "portal" | "people" | "courses" | "community" | "admissions" | "payments" | "calendar" | "analytics" | "settings";
};

const common = {
  home: { label: "Inicio", href: "/dashboard", icon: "home" },
  courses: { label: "Cursos", href: "/dashboard/aula", icon: "courses" },
  community: { label: "Avisos", href: "/dashboard/comunidad", icon: "community" },
  calendar: { label: "Calendario", href: "/dashboard/calendario", icon: "calendar" },
} satisfies Record<string, NavigationItem>;

export function navigationForRole(role: EdukanaRole): NavigationItem[] {
  if (role === "STUDENT") return [common.home, { label: "Mi aprendizaje", href: "/dashboard/portal", icon: "portal" }, common.courses, common.community, common.calendar];
  if (role === "TEACHER") return [common.home, { ...common.courses, label: "Mis cursos" }, common.community, common.calendar];
  if (role === "PARENT") return [common.home, common.community, common.calendar];

  return [
    common.home,
    ...(hasCapability(role, "people.view") ? [{ label: "Personas", href: "/dashboard/gestion", icon: "people" } as NavigationItem] : []),
    ...(hasCapability(role, "course.view") ? [common.courses] : []),
    common.community,
    ...(hasCapability(role, "admissions.manage") ? [{ label: "Admisiones", href: "/dashboard/admisiones", icon: "admissions" } as NavigationItem] : []),
    ...(hasCapability(role, "finance.manage") ? [{ label: "Cobros", href: "/dashboard/pagos", icon: "payments" } as NavigationItem] : []),
    common.calendar,
    ...(hasCapability(role, "analytics.view") ? [{ label: "Reportes", href: "/dashboard/analitica", icon: "analytics" } as NavigationItem] : []),
    ...(hasCapability(role, "tenant.settings.manage") ? [{ label: "Configuración", href: "/dashboard/configuracion", icon: "settings" } as NavigationItem] : []),
  ];
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Activo", INACTIVE: "Inactivo", SUSPENDED: "Suspendido",
  COMPLETED: "Completado", DROPPED: "Retirado", FAILED: "No aprobado",
  DRAFT: "Borrador", SUBMITTED: "Entregado", GRADED: "Calificado", RETURNED: "Devuelto",
  IN_PROGRESS: "En curso", EXPIRED: "Vencido",
  PENDING: "Pendiente", PAID: "Pagado", PARTIAL: "Pago parcial", OVERDUE: "Vencido", CANCELLED: "Cancelado",
  PRESENT: "Presente", ABSENT: "Ausente", LATE: "Tarde", EXCUSED: "Justificado",
  TEXT: "Texto", VIDEO: "Video", DOCUMENT: "Documento", ACTIVITY: "Actividad",
  MULTIPLE_CHOICE: "Selección múltiple", TRUE_FALSE: "Verdadero o falso", SHORT_ANSWER: "Respuesta corta",
};

export function spanishLabel(value: string | null | undefined): string {
  if (!value) return "Sin estado";
  return STATUS_LABELS[value] ?? value.toLocaleLowerCase("es").replaceAll("_", " ").replace(/^./, (letter) => letter.toLocaleUpperCase("es"));
}

const BREADCRUMB_LABELS: Record<string, string> = {
  dashboard: "Inicio", aula: "Cursos", gestion: "Personas", estudiantes: "Estudiantes", portal: "Mi aprendizaje",
  comunidad: "Avisos", admisiones: "Admisiones", pagos: "Cobros", calendario: "Calendario", analitica: "Reportes", configuracion: "Configuración",
};

export function breadcrumbLabel(segment: string): string {
  return BREADCRUMB_LABELS[segment] ?? "Detalle";
}

export const COURSE_TABS = [
  { href: "#resumen", label: "Resumen" },
  { href: "#contenido", label: "Contenido" },
  { href: "#estudiantes", label: "Estudiantes" },
  { href: "#asistencia", label: "Asistencia" },
  { href: "#tareas-examenes", label: "Tareas y exámenes" },
  { href: "#calificaciones", label: "Calificaciones" },
] as const;


export const COURSE_MORE_AREAS = [
  { href: "#horario", label: "Horario" },
  { href: "#certificados", label: "Certificados" },
] as const;
