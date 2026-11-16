import { z } from "zod";

export const institutionSuspensionSchema = z.object({
  institutionId: z.string().trim().min(1).max(200),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
  confirmation: z.string().trim().min(1, "Escribe el nombre de la institución para confirmar.").max(160),
  reason: z.string().trim().max(1000, "El motivo puede tener hasta 1000 caracteres.").default(""),
}).superRefine((value, context) => {
  if (value.status === "SUSPENDED" && !value.reason) {
    context.addIssue({ code: "custom", path: ["reason"], message: "Escribe el motivo de la suspensión." });
  }
});

export function institutionPausedMessage(name: string) {
  return `El acceso de ${name} está pausado. Contacta a tu administración.`;
}

/** Only the public status/name is carried in an authenticated credential rejection. */
export const SUSPENDED_CREDENTIAL_CODE = "institution_suspended:";
export function suspendedCredentialMessage(code: string | undefined) {
  if (!code?.startsWith(SUSPENDED_CREDENTIAL_CODE)) return null;
  try {
    const name = decodeURIComponent(code.slice(SUSPENDED_CREDENTIAL_CODE.length));
    return name ? institutionPausedMessage(name) : null;
  } catch {
    return null;
  }
}

/** For the operator's shared list: unknown URL filters deliberately mean all states. */
export function institutionStatusFilter(value: unknown): { status?: "ACTIVE" | "SUSPENDED" } {
  return value === "ACTIVE" || value === "SUSPENDED" ? { status: value } : {};
}
