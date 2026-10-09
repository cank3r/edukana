/**
 * ¿Aprobó? Compara la nota con el porcentaje para aprobar del examen (`Exam.passingPercent`).
 * Devuelve null cuando no aplica: el examen no fija porcentaje o la nota todavía no existe.
 * Código puro: lo usan la vista del estudiante y la del docente.
 */
export function examPassed(score: number | null | undefined, maxScore: number | null | undefined, passingPercent: number | null | undefined): boolean | null {
  if (passingPercent === null || passingPercent === undefined) return null;
  if (score === null || score === undefined || !maxScore || maxScore <= 0) return null;
  // Margen mínimo para que 7 de 10 con 70 % no falle por redondeo de decimales.
  return score * 100 >= passingPercent * maxScore - 1e-9;
}
