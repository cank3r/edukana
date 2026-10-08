import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
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
 * Mientras un correo pueda existir en dos instituciones (hasta S2), se envía un enlace por
 * cuenta indicando la institución. Las cuentas nunca se fusionan aquí.
 */
export async function requestPasswordReset(input: { email: string; ip: string }, now = new Date()) {
  const email = input.email.trim().toLowerCase();
  const subject = { email, ip: input.ip, kind: "reset" as const };
  if (!(await isAttemptAllowed(subject, now))) return;
  await recordAttempt(subject, false, now);

  const users = await db.user.findMany({
    where: { email, status: "ACTIVE" },
    select: { id: true, name: true, institution: { select: { name: true } } },
    take: 10,
  });
  for (const user of users) {
    const token = randomBytes(32).toString("base64url");
    await db.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + RESET_TOKEN_MINUTES * 60_000) },
    });
    try {
      await getEmailProvider().send({
        to: email,
        subject: `Restablece tu contraseña de ${user.institution.name}`,
        text: [
          `Hola, ${user.name}:`,
          "",
          `Recibimos una solicitud para cambiar tu contraseña en ${user.institution.name}.`,
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
      where: { tokenHash, usedAt: null, expiresAt: { gt: now }, user: { status: "ACTIVE" } },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) return invalid;
    const record = await tx.passwordResetToken.findUniqueOrThrow({ where: { tokenHash }, select: { userId: true } });
    await tx.user.update({
      where: { id: record.userId },
      data: { password: passwordHash, sessionVersion: { increment: 1 } },
    });
    await tx.passwordResetToken.updateMany({ where: { userId: record.userId, usedAt: null }, data: { usedAt: now } });
    const user = await tx.user.findUniqueOrThrow({ where: { id: record.userId }, select: { institutionId: true } });
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
