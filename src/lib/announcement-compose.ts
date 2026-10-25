// Ayudas puras para la pantalla de publicar un aviso: convierten la opción
// sencilla de «¿Quién lo recibe?» en los campos que espera el servidor y
// describen la audiencia en palabras para la confirmación.

export type SimpleAudience = "institution" | "students" | "teachers" | "parents" | "course" | "detailed";

export type AudienceFields = {
  audienceInstitution: boolean;
  roleIds: string[];
  courseTargetIds: string[];
  userTargetIds: string[];
  unitTargetIds: string[];
};

export const SIMPLE_AUDIENCE_OPTIONS: { id: SimpleAudience; label: string; hint: string }[] = [
  { id: "institution", label: "Toda la institución", hint: "Todas las personas activas." },
  { id: "students", label: "Solo estudiantes", hint: "Todos los estudiantes." },
  { id: "teachers", label: "Solo docentes", hint: "Todos los docentes." },
  { id: "parents", label: "Solo tutores", hint: "Madres, padres y tutores." },
  { id: "course", label: "Un curso", hint: "Las personas de un curso." },
  { id: "detailed", label: "Elegir con más detalle", hint: "Varios grupos, cursos o personas." },
];

const ROLE_BY_CHOICE: Partial<Record<SimpleAudience, string>> = { students: "STUDENT", teachers: "TEACHER", parents: "PARENT" };

const ROLE_WORDS: Record<string, string> = {
  STUDENT: "estudiantes",
  TEACHER: "docentes",
  PARENT: "tutores",
  COORDINATOR: "coordinación",
  ADMIN: "administración",
};

const emptyFields = (): AudienceFields => ({ audienceInstitution: false, roleIds: [], courseTargetIds: [], userTargetIds: [], unitTargetIds: [] });

/**
 * Campos del formulario para una opción sencilla. Devuelve `null` cuando la
 * persona eligió «con más detalle» (los campos salen de los selectores) o
 * cuando eligió «Un curso» y todavía no indicó cuál.
 */
export function simpleAudienceFields(choice: SimpleAudience, courseId = ""): AudienceFields | null {
  if (choice === "detailed") return null;
  const fields = emptyFields();
  if (choice === "institution") return { ...fields, audienceInstitution: true };
  if (choice === "course") return courseId ? { ...fields, courseTargetIds: [courseId] } : null;
  const role = ROLE_BY_CHOICE[choice];
  return role ? { ...fields, roleIds: [role] } : null;
}

export function hasAudience(fields: AudienceFields): boolean {
  return fields.audienceInstitution || fields.roleIds.length > 0 || fields.courseTargetIds.length > 0 || fields.userTargetIds.length > 0 || fields.unitTargetIds.length > 0;
}

function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  const last = parts[parts.length - 1];
  const joiner = /^(i|hi)/i.test(last) ? " e " : " y ";
  return `${parts.slice(0, -1).join(", ")}${joiner}${last}`;
}

function named(ids: string[], names: ReadonlyMap<string, string>, one: string, many: string): string {
  const known = ids.map((id) => names.get(id)).filter((name): name is string => Boolean(name));
  if (known.length !== ids.length || ids.length > 3) return `${ids.length} ${ids.length === 1 ? one : many}`;
  return joinWords(known);
}

/** Audiencia en palabras, para «Vas a publicar este aviso para: …». */
export function audienceText(
  fields: AudienceFields,
  names: { courses?: ReadonlyMap<string, string>; people?: ReadonlyMap<string, string>; units?: ReadonlyMap<string, string> } = {},
): string {
  if (fields.audienceInstitution) return "toda la institución";
  const parts: string[] = [];
  if (fields.roleIds.length) {
    const words = fields.roleIds.map((role) => ROLE_WORDS[role]).filter(Boolean);
    if (words.length) parts.push(fields.roleIds.length === 1 && ["STUDENT", "TEACHER", "PARENT"].includes(fields.roleIds[0]) ? `todos los ${words[0]}` : joinWords(words));
  }
  if (fields.courseTargetIds.length) {
    const text = named(fields.courseTargetIds, names.courses ?? new Map(), "curso", "cursos");
    parts.push(/^\d/.test(text) ? text : `${fields.courseTargetIds.length === 1 ? "el curso" : "los cursos"} ${text}`);
  }
  if (fields.userTargetIds.length) parts.push(named(fields.userTargetIds, names.people ?? new Map(), "persona elegida", "personas elegidas"));
  if (fields.unitTargetIds.length) {
    const text = named(fields.unitTargetIds, names.units ?? new Map(), "departamento", "departamentos");
    parts.push(/^\d/.test(text) ? text : `${fields.unitTargetIds.length === 1 ? "el departamento" : "los departamentos"} ${text}`);
  }
  return joinWords(parts);
}

/**
 * Número aproximado de personas que recibirán el aviso, solo cuando se puede
 * saber con la lista de personas que ya tiene la pantalla. Devuelve `null`
 * si no hay datos suficientes (por ejemplo, avisos a un curso o a un
 * departamento, o una lista de personas incompleta): nunca se inventa.
 */
export function approximateRecipients(fields: AudienceFields, people: readonly { id: string; role?: string }[], listLimit = 1000): number | null {
  if (!people.length || people.length >= listLimit) return null;
  if (fields.audienceInstitution) return people.length;
  if (fields.courseTargetIds.length || fields.unitTargetIds.length) return null;
  if (!fields.roleIds.length && !fields.userTargetIds.length) return null;
  const roles = new Set(fields.roleIds);
  const users = new Set(fields.userTargetIds);
  return people.filter((person) => users.has(person.id) || (person.role !== undefined && roles.has(person.role))).length;
}
