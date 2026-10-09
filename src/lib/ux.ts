import { hasCapability, type Capability } from "@/lib/capabilities";
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

export function navigationForRole(role: EdukanaRole, effective?: ReadonlySet<Capability> | readonly Capability[]): NavigationItem[] {
  const can = (capability: Capability) => hasCapability(role, capability, effective);
  // Docente y estudiante solo ven sus cursos: el menú lo dice igual que el título de la página.
  const courses = role === "TEACHER" || role === "STUDENT" ? { ...common.courses, label: "Mis cursos" } : common.courses;
  const student = role === "STUDENT" && can("student.portal.view");
  return [
    common.home,
    ...(role === "PARENT" && can("child.portal.view") ? [{ label: "Mis hijos", href: "/dashboard/hijos", icon: "portal" } as NavigationItem] : []),
    ...(can("people.view") ? [{ label: "Personas", href: "/dashboard/gestion", icon: "people" } as NavigationItem] : []),
    ...(can("course.view") ? [courses] : []),
    ...(role !== "PARENT" || can("child.announcements.view") ? [common.community] : []),
    ...(can("admissions.manage") ? [{ label: "Admisiones", href: "/dashboard/admisiones", icon: "admissions" } as NavigationItem] : []),
    ...(can("finance.manage") ? [{ label: "Cobros", href: "/dashboard/pagos", icon: "payments" } as NavigationItem] : []),
    ...(can("finance.manage") ? [{ label: "Ventas", href: "/dashboard/ventas", icon: "payments" } as NavigationItem] : []),
    ...(can("schedule.view") ? [common.calendar] : []),
    ...(can("analytics.view") ? [{ label: "Reportes", href: "/dashboard/analitica", icon: "analytics" } as NavigationItem] : []),
    ...(can("tenant.settings.manage") || can("roles.permissions.manage") ? [{ label: "Configuración", href: "/dashboard/configuracion", icon: "settings" } as NavigationItem] : []),
    ...(student ? [
      { label: "Mi estado de cuenta", href: "/dashboard/mi-cuenta", icon: "payments" } as NavigationItem,
      { label: "Mis certificados", href: "/dashboard/mis-certificados", icon: "portal" } as NavigationItem,
    ] : []),
  ];
}

export const MAX_MAIN_NAVIGATION = 5;

/**
 * Como máximo cinco entradas visibles por rol: si hay más, las primeras cuatro quedan a la vista
 * y el resto se agrupa bajo «Más» (que cuenta como la quinta).
 */
export function groupNavigation(items: NavigationItem[]): { main: NavigationItem[]; more: NavigationItem[] } {
  if (items.length <= MAX_MAIN_NAVIGATION) return { main: items, more: [] };
  return { main: items.slice(0, MAX_MAIN_NAVIGATION - 1), more: items.slice(MAX_MAIN_NAVIGATION - 1) };
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

const ROLE_LABELS: Record<EdukanaRole, string> = {
  SUPER_ADMIN: "Súper administrador",
  ADMIN: "Administrador",
  COORDINATOR: "Coordinador",
  TEACHER: "Docente",
  STUDENT: "Estudiante",
  PARENT: "Tutor",
};

export function roleLabel(role: EdukanaRole): string {
  return ROLE_LABELS[role];
}

/** Cantidad con su palabra en singular o plural: `plural(1, "aviso", "avisos")` → «1 aviso». */
export function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

export function spanishLabel(value: string | null | undefined): string {
  if (!value) return "Sin estado";
  return STATUS_LABELS[value] ?? value.toLocaleLowerCase("es").replaceAll("_", " ").replace(/^./, (letter) => letter.toLocaleUpperCase("es"));
}

const BREADCRUMB_LABELS: Record<string, string> = {
  dashboard: "Inicio", aula: "Cursos", gestion: "Personas", estudiantes: "Estudiantes", portal: "Mi aprendizaje",
  comunidad: "Avisos", admisiones: "Admisiones", pagos: "Cobros", calendario: "Calendario", analitica: "Reportes", configuracion: "Configuración", roles: "Roles y permisos", tutores: "Tutores", hijos: "Mis hijos", "puesta-en-marcha": "Puesta en marcha", periodos: "Períodos", institucion: "Datos de la institución", asistencia: "Asistencia", certificados: "Certificados", "mis-certificados": "Mis certificados", "mi-cuenta": "Mi estado de cuenta", perfil: "Mi perfil", contenido: "Contenido", leccion: "Lección", clases: "Clases en vivo", tareas: "Tareas", preguntas: "Banco de preguntas", examenes: "Exámenes", presentar: "Exámenes", calificaciones: "Calificaciones", "mis-notas": "Mis notas", editar: "Editar", nuevo: "Nuevo", nueva: "Nueva", resultados: "Resultados", resultado: "Resultado", accesos: "Importar e invitar", programas: "Programas", grupos: "Grupos", horario: "Horario", ventas: "Ventas", recibo: "Recibo",
  notificaciones: "Notificaciones", personas: "Personas", preferencias: "Qué me llega por correo",
};

export function breadcrumbLabel(segment: string): string {
  return BREADCRUMB_LABELS[segment] ?? "Detalle";
}
