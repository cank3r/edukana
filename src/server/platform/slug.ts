/**
 * Identificador sugerido a partir del nombre de la institución: sin tildes, en minúsculas,
 * con guiones entre palabras y como máximo 63 caracteres. Sin dependencias de servidor.
 * "Colegio San José de Calasanz" → "colegio-san-jose-de-calasanz".
 */
export function suggestSlug(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
}
