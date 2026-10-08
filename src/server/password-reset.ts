import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { ensureIdentity, listActiveMemberships, normalizeEmail } from "@/server/identity";
import { getEmailProvider } from "@/server/integrations/email";
import { isAttemptAllowed, recordAttempt } from "@/server/security/login-throttle";

export const RESET_TOKEN_MINUTES = 60;

export const newPasswordSchema = z
  .string()
  .min(10, "La contraseña debe tener al menos 10 caracteres.")
  .max(200)
  .regex(/[A-Za-zÁÉÍÓÚáéíóúÑñ]/, "Incluye al menos una letra.")
  .regex(/\d/, "Incluye al menos un número.");

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function appUrl() {
  const value = process.env.APP_URL ?? process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (!value) throw new Error("APP_URL es obligatorio para enviar enlaces de recuperación.");
  return value.replace(/\/$/, "");
}

/**
 * Solicita la recuperación. No devuelve nada y no lanza por causas que dependan de si la
 * cuenta existe: quien llama responde siempre lo mismo.
 *
 * La contraseña pertenece a la identidad: se envía un solo enlace aunque la persona esté en
 * varias instituciones, y al usarlo cambia para todas.
 */
export async function requestPasswordReset(input: { email: string; ip: string }, now = new Date()) {
  const email = normalizeEmail(input.email);
  const subject = { email, ip: input.ip, kind: "reset" as const };
  if (!(await isAttemptAllowed(subject, now))) return;
  await recordAttempt(subject, false, now);

  const identity = await db.identity.findUnique({ where: { email }, select: { id: true, status: true } });
  if (!identity || identity.status !== "ACTIVE") return;
  const memberships = await listActiveMemberships(identity.id);
  if (!memberships.length) return;

  const token = randomBytes(32).toString("base64url");
  await db.passwordResetToken.create({
    data: {
      userId: memberships[0].id,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + RESET_TOKEN_MINUTES * 60_000),
    },
  });
  const places = memberships.map((item) => item.institution.name).join(", ");
  try {
    await getEmailProvider().send({
      to: email,
      subject: "Restablece tu contraseña de Edukana",
      text: [
        `Hola, ${memberships[0].name}:`,
        "",
        `Recibimos una solicitud para cambiar la contraseña de tu cuenta (${places}).`,
        `Abre este enlace para elegir una nueva. Vence en ${RESET_TOKEN_MINUTES} minutos y solo funciona una vez:`,
        "",
        `${appUrl()}/restablecer/${token}`,
        "",
        "Si no lo pediste, ignora este mensaje: tu contraseña no cambia.",
      ].join("\n"),
    });
  } catch (error) {
    const correlationId = crypto.randomUUID();
    console.error("requestPasswordReset: no se pudo enviar el correo", { correlationId, error });
  }
}

export type ResetResult = { ok: true } | { ok: false; reason: "invalid_password" | "invalid_token"; message: string };

/** Cambia la contraseña con un enlace vigente, lo consume e invalida todas las sesiones de la cuenta. */
export async function resetPasswordWithToken(input: { token: string; password: string }, now = new Date()): Promise<ResetResult> {
  const password = newPasswordSchema.safeParse(input.password);
  if (!password.success) {
    return { ok: false, reason: "invalid_password", message: password.error.issues[0]?.message ?? "Contraseña no válida." };
  }
  const invalid: ResetResult = {
    ok: false,
    reason: "invalid_token",
    message: "El enlace no es válido o ya venció. Solicita uno nuevo.",
  };
  if (!input.token || input.token.length > 200) return invalid;
  const tokenHash = hashToken(input.token);
  const passwordHash = await bcrypt.hash(password.data, 12);

  return db.$transaction(async (tx) => {
    // El UPDATE condicional consume el enlace de forma atómica: de dos usos simultáneos solo uno cuenta.
    const consumed = await tx.passwordResetToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now }, user: { status: "ACTIVE", OR: [{ identity: null }, { identity: { status: "ACTIVE" } }] } },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) return invalid;
    const record = await tx.passwordResetToken.findUniqueOrThrow({ where: { tokenHash }, select: { userId: true } });
    const user = await tx.user.findUniqueOrThrow({
      where: { id: record.userId },
      select: { institutionId: true, email: true, identityId: true },
    });
    const identityId = user.identityId ?? (await ensureIdentity(tx, { email: user.email }));
    if (!user.identityId) await tx.user.update({ where: { id: record.userId }, data: { identityId } });
    await tx.identity.update({
      where: { id: identityId },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });
    // Cualquier otro enlace pendiente de la misma persona, en cualquier institución, deja de servir.
    await tx.passwordResetToken.updateMany({ where: { user: { identityId }, usedAt: null }, data: { usedAt: now } });
    await tx.auditLog.create({
      data: {
        institutionId: user.institutionId,
        userId: record.userId,
        action: "PASSWORD_RESET_COMPLETED",
        entity: "User",
        entityId: record.userId,
      },
    });
    return { ok: true } as const;
  });
}
