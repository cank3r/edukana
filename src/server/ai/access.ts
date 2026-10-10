import { getInstitutionFeatures, lockInstitutionSettings } from "@/server/platform/features";
import { resolveInstitutionFeatures } from "@/server/platform/feature-policy";
import { createHmac } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import type { EdukanaRole } from "@/types/next-auth";
import { getAiClient, type AiClient } from "./client";

export type AiActor = { id: string; institutionId: string; role: EdukanaRole };

export type AiAvailability =
  | { ok: true; client: AiClient }
  | { ok: false; reason: "not-configured" | "institution-off" | "no-permission"; message: string };

export const AI_OFF_MESSAGES = {
  "not-configured": "El asistente de IA no está activado en esta plataforma.",
  "institution-off": "Tu institución apagó el asistente de IA.",
  "no-permission": "Tu rol no tiene acceso al asistente de IA.",
} as const;

/** La IA está encendida salvo que la institución la haya apagado (`settings.ai.enabled === false`). */
export function institutionAiEnabled(settings: unknown): boolean {
  return resolveInstitutionFeatures(settings).ai;
}

/** Dice si esta persona puede usar la IA ahora y, si no, por qué (en palabras sencillas). */
export async function getAiAvailability(actor: AiActor): Promise<AiAvailability> {
  const client = getAiClient();
  if (!client) return { ok: false, reason: "not-configured", message: AI_OFF_MESSAGES["not-configured"] };
  if (!actor.id || !actor.institutionId) return { ok: false, reason: "no-permission", message: AI_OFF_MESSAGES["no-permission"] };
  const [features, capabilities] = await Promise.all([
    getInstitutionFeatures(actor.institutionId),
    getEffectiveCapabilities(actor.institutionId, actor.role),
  ]);
  if (!features.ai) return { ok: false, reason: "institution-off", message: AI_OFF_MESSAGES["institution-off"] };
  if (!capabilities.has("ai.use")) return { ok: false, reason: "no-permission", message: AI_OFF_MESSAGES["no-permission"] };
  return { ok: true, client };
}

/** Enciende o apaga la IA de la institución. Solo quien gestiona la institución. Sin migración: vive en `settings`. */
export async function setInstitutionAiEnabled(actor: AiActor, enabled: boolean): Promise<{ ok: true } | { ok: false; message: string }> {
  const capabilities = await getEffectiveCapabilities(actor.institutionId, actor.role);
  if (!capabilities.has("tenant.settings.manage")) return { ok: false, message: "No tienes permiso para cambiar los datos de la institución." };
  return db.$transaction(async (tx) => {
    await lockInstitutionSettings(tx, actor.institutionId);
    const institution = await tx.institution.findUnique({ where: { id: actor.institutionId }, select: { settings: true } });
    if (!institution) return { ok: false, message: "No encontramos tu institución. Vuelve a iniciar sesión." } as const;
    if (resolveInstitutionFeatures(institution.settings).aiLocked) {
      return { ok: false, message: "Desactivado por Edukana" } as const;
    }
    const current = institution.settings && typeof institution.settings === "object" && !Array.isArray(institution.settings) ? (institution.settings as Prisma.JsonObject) : {};
    const previousAi = current.ai && typeof current.ai === "object" && !Array.isArray(current.ai) ? (current.ai as Prisma.JsonObject) : {};
    const before = institutionAiEnabled(current);
    await tx.institution.update({ where: { id: actor.institutionId }, data: { settings: { ...current, ai: { ...previousAi, enabled } } } });
    await tx.auditLog.create({
      data: { institutionId: actor.institutionId, userId: actor.id, action: "AI_SETTING_UPDATED", entity: "Institution", entityId: actor.institutionId, changes: { before: { enabled: before }, after: { enabled } } },
    });
    return { ok: true } as const;
  });
}

// --- Límite por persona ---------------------------------------------------------------

/** Pedidos por persona y por hora. Se puede cambiar con `AI_MAX_REQUESTS_PER_HOUR`. */
export function aiHourlyLimit(env: Record<string, string | undefined> = process.env) {
  const value = Number(env.AI_MAX_REQUESTS_PER_HOUR);
  return Number.isInteger(value) && value > 0 ? value : 20;
}

export const AI_LIMIT_MESSAGE = "Ya usaste el asistente muchas veces en la última hora. Intenta de nuevo más tarde.";

function userKey(userId: string) {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET es obligatorio para el límite de uso de la IA.");
  return createHmac("sha256", secret).update(`ai:user:${userId}`).digest("hex");
}

/**
 * Reusa la tabla del límite de intentos de inicio de sesión con su propio prefijo en el HMAC:
 * no guarda ids en claro ni se mezcla con los contadores de acceso. Las solicitudes que exceden no se cuentan.
 */
export async function takeAiAttempt(userId: string, now = new Date(), limit = aiHourlyLimit()) {
  const key = userKey(userId);
  const since = new Date(now.getTime() - 60 * 60_000);
  const used = await db.loginAttempt.count({ where: { emailHash: key, createdAt: { gte: since } } });
  if (used >= limit) return false;
  await db.$transaction([
    db.loginAttempt.deleteMany({ where: { emailHash: key, createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60_000) } } }),
    db.loginAttempt.create({ data: { emailHash: key, ipHash: key, succeeded: true, createdAt: now } }),
  ]);
  return true;
}

// --- Registro de uso -----------------------------------------------------------------

export type AiUsage = {
  feature: "generate-questions" | "ask-course";
  courseId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  outcome: "ok" | "invalid-output" | "error";
};

/** Registra que se usó la IA: quién, cuándo, para qué y cuántos tokens. Nunca el texto enviado ni la respuesta. */
export async function recordAiUsage(actor: AiActor, usage: AiUsage) {
  try {
    await db.auditLog.create({
      data: { institutionId: actor.institutionId, userId: actor.id, action: "AI_USED", entity: "Course", entityId: usage.courseId, changes: { ...usage } },
    });
  } catch (error) {
    console.error("recordAiUsage failed", { error });
  }
}
