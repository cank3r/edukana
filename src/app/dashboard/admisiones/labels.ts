/** Etapas en palabras llanas. Archivo puro: lo usan las páginas y los formularios. */
export const STAGES = ["INTERESTED", "DOCUMENTS", "REVIEW", "ACCEPTED", "ENROLLED", "REJECTED"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  INTERESTED: "Interesado",
  DOCUMENTS: "Documentos",
  REVIEW: "En revisión",
  ACCEPTED: "Admitido",
  ENROLLED: "Inscrito",
  REJECTED: "No continúa",
};

export const STAGE_HELP: Record<Stage, string> = {
  INTERESTED: "Preguntó o dejó sus datos.",
  DOCUMENTS: "Está entregando sus papeles.",
  REVIEW: "La institución revisa su caso.",
  ACCEPTED: "Aprobado; falta convertirlo en estudiante.",
  ENROLLED: "Ya es estudiante.",
  REJECTED: "Se retiró o no fue aceptado.",
};

/** Paso siguiente del camino normal. Desde «Admitido» el paso es convertir en estudiante, no un cambio de etapa. */
export const NEXT_STAGE: Partial<Record<Stage, Stage>> = { INTERESTED: "DOCUMENTS", DOCUMENTS: "REVIEW", REVIEW: "ACCEPTED" };

export const SOURCE_SUGGESTIONS = ["Redes sociales", "Recomendación", "Página web", "Visita a la institución", "Feria o evento", "Llamada"];

/** «hace 3 días», «hace 2 horas», «hace un momento». */
export function timeAgo(date: Date, now = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 2) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} minutos`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "hace 1 hora" : `hace ${hours} horas`;
  const days = Math.floor(hours / 24);
  if (days < 31) return days === 1 ? "hace 1 día" : `hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "hace 1 mes" : `hace ${months} meses`;
  const years = Math.floor(days / 365);
  return years <= 1 ? "hace 1 año" : `hace ${years} años`;
}
