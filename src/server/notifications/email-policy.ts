/**
 * Qué notificaciones pueden llegar por correo y cuáles llegan si la persona no ha elegido nada.
 * Código puro (sin base de datos) para poder probar la decisión «enviar / no enviar».
 */

export type EmailKindOption = {
  kind: string;
  /** Texto para la casilla, en lenguaje cotidiano. */
  label: string;
  /** Sí o no cuando la persona todavía no ha guardado sus preferencias. */
  defaultEmail: boolean;
};

/**
 * Tipos que se pueden recibir por correo, en el orden en que se muestran.
 * La inscripción a un curso se avisa solo dentro de Edukana (se crea dentro de una transacción
 * de la que no sale correo), por eso no aparece aquí.
 */
export const EMAIL_KIND_OPTIONS: readonly EmailKindOption[] = [
  { kind: "announcement", label: "Cuando publiquen un aviso para ti o para tu curso", defaultEmail: true },
  { kind: "grade", label: "Cuando califiquen una tarea", defaultEmail: true },
  { kind: "charge", label: "Cuando tengas un cargo nuevo por pagar", defaultEmail: true },
  { kind: "assignment", label: "Cuando haya una tarea nueva", defaultEmail: false },
  { kind: "exam", label: "Cuando haya un examen nuevo", defaultEmail: false },
  { kind: "live_class", label: "Cuando programen una clase en vivo", defaultEmail: false },
  { kind: "certificate", label: "Cuando tu certificado esté listo", defaultEmail: false },
  { kind: "submission", label: "Cuando un estudiante entregue una tarea", defaultEmail: false },
];

const BY_KIND = new Map(EMAIL_KIND_OPTIONS.map((option) => [option.kind, option]));

const STUDENT_KINDS = ["announcement", "grade", "charge", "assignment", "exam", "live_class", "certificate"];
const PARENT_KINDS = ["announcement"];
const STAFF_KINDS = ["announcement", "submission"];

/** Las opciones que tienen sentido para cada rol (a un docente no le llegan notas ni cobros). */
export function emailKindsForRole(role: string): EmailKindOption[] {
  const kinds = role === "STUDENT" ? STUDENT_KINDS : role === "PARENT" ? PARENT_KINDS : STAFF_KINDS;
  return EMAIL_KIND_OPTIONS.filter((option) => kinds.includes(option.kind));
}

export function isEmailKind(kind: string): boolean {
  return BY_KIND.has(kind);
}

/** El valor por omisión de un tipo. Un tipo desconocido nunca va por correo. */
export function defaultEmailFor(kind: string): boolean {
  return BY_KIND.get(kind)?.defaultEmail ?? false;
}

/**
 * La decisión para una persona:
 * - `allowed: false` lo pide quien notifica (por ejemplo, un aviso para demasiadas personas): nunca.
 * - Un tipo que no está en la lista: nunca.
 * - Si la persona eligió (`preference` true/false), manda su elección; si no, el valor por omisión.
 */
export function shouldSendEmail(input: { kind: string; allowed?: boolean; preference?: boolean | null }): boolean {
  if (input.allowed === false) return false;
  if (!isEmailKind(input.kind)) return false;
  return typeof input.preference === "boolean" ? input.preference : defaultEmailFor(input.kind);
}
