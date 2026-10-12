import { createHash, timingSafeEqual } from "node:crypto";

export type SetupTokenStatus = "valid" | "invalid";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * El alta inicial exige un SETUP_TOKEN de al menos 24 caracteres y su coincidencia exacta.
 * Una configuración ausente o inválida mantiene cerrado el acceso, incluso con la base vacía.
 */
export function checkSetupToken(provided: string | null | undefined, env: Record<string, string | undefined> = process.env): SetupTokenStatus {
  const expected = env.SETUP_TOKEN?.trim();
  if (!expected || expected.length < 24 || !provided) return "invalid";
  return timingSafeEqual(digest(provided), digest(expected)) ? "valid" : "invalid";
}
