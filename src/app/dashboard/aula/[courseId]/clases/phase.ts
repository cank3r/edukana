/** Se puede entrar desde 15 minutos antes de la hora de inicio y hasta que la clase termina. */
export const JOIN_EARLY_MINUTES = 15;

export type LiveClassPhase = "before" | "open" | "ended";

export function liveClassPhase(startsAtMs: number, durationMinutes: number, nowMs: number): LiveClassPhase {
  if (nowMs >= startsAtMs + durationMinutes * 60_000) return "ended";
  return nowMs >= startsAtMs - JOIN_EARLY_MINUTES * 60_000 ? "open" : "before";
}

/** Solo se enlaza a direcciones https; cualquier otra cosa se trata como si no hubiera enlace. */
export function safeJoinUrl(value: string): string | null {
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}
