/**
 * Color principal de una institución: validación y contraste.
 * Sin base de datos ni dependencias de servidor: lo usan también el formulario y el menú.
 *
 * Regla: el color se usa como fondo de botones y del elemento activo del menú con letras
 * blancas encima, así que debe dar un contraste de al menos 4.5:1 con el blanco (WCAG AA).
 * Si no lo da, se oscurece conservando el tono hasta alcanzarlo.
 */

export const EDUKANA_BLUE = "#2457F5";
export const MIN_CONTRAST_WITH_WHITE = 4.5;

/** Colores sugeridos; todos cumplen el contraste con blanco. */
export const BRAND_SWATCHES: ReadonlyArray<{ value: string; label: string }> = [
  { value: EDUKANA_BLUE, label: "Azul Edukana" },
  { value: "#1E3A8A", label: "Azul marino" },
  { value: "#0F766E", label: "Verde azulado" },
  { value: "#047857", label: "Verde" },
  { value: "#B91C1C", label: "Rojo" },
  { value: "#BE185D", label: "Fucsia" },
  { value: "#6D28D9", label: "Morado" },
  { value: "#C2410C", label: "Naranja" },
];

/** "#abc", "abc", "#AABBCC" o "aabbcc" → "#AABBCC". Cualquier otra cosa → null. */
export function normalizeHexColor(input: string | null | undefined): string | null {
  const raw = String(input ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(raw)) return `#${raw.split("").map((char) => char + char).join("")}`.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw}`.toUpperCase();
  return null;
}

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex([r, g, b]: [number, number, number]) {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function relativeLuminance(hex: string) {
  const [r, g, b] = channels(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste del color con el blanco, de 1 (blanco) a 21 (negro). */
export function contrastWithWhite(hex: string) {
  return 1.05 / (relativeLuminance(hex) + 0.05);
}

/** Oscurece el color en `amount` (0 a 1) conservando el tono. */
export function darkenColor(hex: string, amount: number) {
  const factor = Math.max(0, Math.min(1, 1 - amount));
  const [r, g, b] = channels(hex);
  return toHex([r * factor, g * factor, b * factor]);
}

export type ReadableColor = { color: string; adjusted: boolean; contrast: number };

/**
 * Devuelve el color tal cual si ya se lee bien con letras blancas; si no, la versión más clara
 * del mismo tono que sí cumple. `adjusted` dice si hubo que cambiarlo.
 */
export function ensureReadableOnWhite(hex: string): ReadableColor {
  const start = normalizeHexColor(hex) ?? EDUKANA_BLUE;
  const initial = contrastWithWhite(start);
  if (initial >= MIN_CONTRAST_WITH_WHITE) return { color: start, adjusted: false, contrast: initial };
  for (let step = 1; step <= 100; step += 1) {
    const candidate = darkenColor(start, step / 100);
    const contrast = contrastWithWhite(candidate);
    if (contrast >= MIN_CONTRAST_WITH_WHITE) return { color: candidate, adjusted: true, contrast };
  }
  return { color: "#000000", adjusted: true, contrast: 21 };
}

/**
 * Variables CSS que aplican la marca dentro del panel. `--brand` siempre existe; si la
 * institución eligió un color, también reemplaza el azul de los botones principales.
 */
export function brandCssVariables(brandColor: string | null | undefined): Record<string, string> {
  const normalized = normalizeHexColor(brandColor);
  if (!normalized) return { "--brand": EDUKANA_BLUE };
  const { color } = ensureReadableOnWhite(normalized);
  return {
    "--brand": color,
    "--blue": color,
    "--color-blue-600": color,
    "--color-blue-700": darkenColor(color, 0.15),
  };
}
