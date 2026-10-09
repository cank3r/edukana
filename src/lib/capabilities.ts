import type { EdukanaRole } from "@/types/next-auth";

export const CAPABILITY_CATALOG = {
  "student.portal.view": { group: "Aprendizaje", label: "Ver portal estudiantil", description: "Consulta la experiencia personal de aprendizaje." },
  "course.view": { group: "Académico", label: "Ver cursos", description: "Accede a cursos dentro del alcance propio del rol." },
  "course.view.all": { group: "Académico", label: "Ver todos los cursos", description: "Consulta todos los cursos de la institución." },
  "course.manage": { group: "Académico", label: "Gestionar cursos", description: "Crea y modifica contenido, evaluaciones y calificaciones." },
  "course.participate": { group: "Aprendizaje", label: "Participar en cursos", description: "Entrega tareas, presenta exámenes y registra progreso." },
  "course.roster.view": { group: "Académico", label: "Ver listas de estudiantes", description: "Consulta participantes y resultados de los cursos permitidos." },
  "schedule.view": { group: "Académico", label: "Ver horarios", description: "Consulta calendario y bloques de clase permitidos." },
  "people.view": { group: "Personas", label: "Ver personas", description: "Consulta perfiles estudiantiles dentro del alcance del rol." },
  "people.manage": { group: "Personas", label: "Gestionar personas", description: "Crea cuentas institucionales sin conceder acceso fuera del rol elegido.", critical: true },
  "academic.structure.manage": { group: "Académico", label: "Gestionar estructura académica", description: "Crea y activa períodos académicos institucionales.", critical: true },
  "enrollment.manage": { group: "Académico", label: "Gestionar matrículas", description: "Inscribe estudiantes en cursos de la institución.", critical: true },
  "admissions.manage": { group: "Administración", label: "Gestionar admisiones", description: "Consulta y registra solicitudes de ingreso." },
  "announcement.publish": { group: "Comunicaciones", label: "Publicar avisos", description: "Publica comunicados para audiencias institucionales." },
  "announcement.manage": { group: "Comunicaciones", label: "Gestionar todos los avisos", description: "Lee todos los avisos y consulta el desglose completo de sus audiencias.", critical: true },
  "finance.manage": { group: "Finanzas", label: "Gestionar cobros", description: "Consulta y modifica cargos y pagos institucionales." },
  "analytics.view": { group: "Reportes", label: "Ver reportes", description: "Consulta indicadores agregados de la institución." },
  "tenant.settings.manage": { group: "Configuración", label: "Gestionar institución", description: "Modifica los datos generales de la institución.", critical: true },
  "roles.permissions.manage": { group: "Configuración", label: "Gestionar roles y permisos", description: "Modifica capacidades institucionales por rol.", critical: true },
  "guardianship.manage": { group: "Tutores", label: "Gestionar vínculos de tutores", description: "Crea, activa, configura y revoca relaciones tutor-estudiante.", critical: true },
  "child.portal.view": { group: "Tutores", label: "Abrir portal de hijos", description: "Accede al portal de hijos vinculados; no concede datos por sí sola." },
  "child.academics.view": { group: "Tutores", label: "Ver progreso académico del hijo", description: "Consulta cursos, progreso, tareas y calificaciones publicadas si el vínculo lo permite." },
  "child.attendance.view": { group: "Tutores", label: "Ver asistencia del hijo", description: "Consulta únicamente la asistencia del hijo vinculado si el vínculo lo permite." },
  "child.schedule.view": { group: "Tutores", label: "Ver horario del hijo", description: "Consulta el horario derivado de los cursos del hijo si el vínculo lo permite." },
  "child.announcements.view": { group: "Tutores", label: "Ver avisos del hijo", description: "Consulta avisos generales y de cursos del hijo si el vínculo lo permite." },
  "child.finance.view": { group: "Tutores", label: "Ver finanzas del hijo", description: "Consulta el estado de cuenta del hijo solo con autorización institucional y del vínculo.", critical: true },
} as const;

export type Capability = keyof typeof CAPABILITY_CATALOG;
export type CapabilityOverride = { capability: string; enabled: boolean };

export const CAPABILITIES = Object.freeze(Object.keys(CAPABILITY_CATALOG) as Capability[]);
export const ROLES = Object.freeze(["SUPER_ADMIN", "ADMIN", "COORDINATOR", "TEACHER", "STUDENT", "PARENT"] as const satisfies readonly EdukanaRole[]);
export const PROTECTED_ADMIN_CAPABILITIES = Object.freeze(["tenant.settings.manage", "roles.permissions.manage"] as const satisfies readonly Capability[]);

const capabilities = (...values: Capability[]) => new Set(values);

export const SYSTEM_ROLE_CAPABILITIES: Record<EdukanaRole, ReadonlySet<Capability>> = {
  SUPER_ADMIN: capabilities(...CAPABILITIES),
  ADMIN: capabilities(...CAPABILITIES),
  COORDINATOR: capabilities("course.view", "course.view.all", "course.manage", "course.roster.view", "schedule.view", "people.view", "admissions.manage", "announcement.publish", "announcement.manage"),
  TEACHER: capabilities("course.view", "course.manage", "course.roster.view", "schedule.view"),
  STUDENT: capabilities("student.portal.view", "course.view", "course.participate", "schedule.view"),
  // Every child capability still requires an ACTIVE Guardianship and its matching per-link flag.
  PARENT: capabilities("child.portal.view", "child.academics.view", "child.attendance.view", "child.schedule.view", "child.announcements.view", "child.finance.view"),
};

export const ROLE_ALLOWED_CAPABILITIES: Record<EdukanaRole, ReadonlySet<Capability>> = {
  SUPER_ADMIN: capabilities(...CAPABILITIES),
  ADMIN: capabilities(...CAPABILITIES),
  COORDINATOR: capabilities("course.view", "course.view.all", "course.manage", "course.roster.view", "schedule.view", "people.view", "admissions.manage", "announcement.publish", "announcement.manage", "analytics.view"),
  TEACHER: capabilities("course.view", "course.manage", "course.roster.view", "schedule.view", "people.view", "announcement.publish", "announcement.manage"),
  STUDENT: capabilities("student.portal.view", "course.view", "course.participate", "schedule.view"),
  PARENT: capabilities("child.portal.view", "child.academics.view", "child.attendance.view", "child.schedule.view", "child.announcements.view", "child.finance.view"),
};

export function isCapability(value: string): value is Capability {
  return Object.hasOwn(CAPABILITY_CATALOG, value);
}

export function resolveEffectiveCapabilities(role: EdukanaRole, overrides: Iterable<CapabilityOverride> = []): ReadonlySet<Capability> {
  const effective = new Set(SYSTEM_ROLE_CAPABILITIES[role]);
  if (role === "SUPER_ADMIN") return effective;

  for (const override of overrides) {
    if (!isCapability(override.capability)) continue;
    if (!ROLE_ALLOWED_CAPABILITIES[role].has(override.capability)) {
      effective.delete(override.capability);
      continue;
    }
    if (override.enabled) effective.add(override.capability);
    else effective.delete(override.capability);
  }

  if (role === "ADMIN") {
    for (const capability of PROTECTED_ADMIN_CAPABILITIES) effective.add(capability);
  }
  return effective;
}

export function hasCapability(role: EdukanaRole, capability: Capability, effective?: ReadonlySet<Capability> | readonly Capability[]) {
  const source = effective ? (effective instanceof Set ? effective : new Set(effective)) : resolveEffectiveCapabilities(role);
  return source.has(capability);
}
