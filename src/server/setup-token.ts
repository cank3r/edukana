import { createHash, timingSafeEqual } from "node:crypto";

export type SetupTokenStatus = "not_required" | "valid" | "invalid";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Protección del alta inicial. Con `SETUP_TOKEN` definido, `/setup` solo responde a quien
 * presenta ese valor; así una base vacía ya desplegada no queda abierta al primero que llegue.
 *
 * Transición: mientras `SETUP_TOKEN` no esté definido se conserva el comportamiento anterior
 * para no romper el recorrido E2E existente. El objetivo de S1 es exigirlo siempre.
 */
export function checkSetupToken(provided: string | null | undefined, env: Record<string, string | undefined> = process.env): SetupTokenStatus {
  const expected = env.SETUP_TOKEN?.trim();
  if (!expected) return "not_required";
  if (expected.length < 24) throw new Error("SETUP_TOKEN debe tener al menos 24 caracteres.");
  if (!provided) return "invalid";
  return timingSafeEqual(digest(provided), digest(expected)) ? "valid" : "invalid";
}
