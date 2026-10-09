/** Fechas del panel de la plataforma: «9 de octubre de 2026». */
export function formatOperatorDate(instant: Date) {
  return new Intl.DateTimeFormat("es", { timeZone: "America/Santo_Domingo", day: "numeric", month: "long", year: "numeric" }).format(instant);
}
