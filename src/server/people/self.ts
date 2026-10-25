import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { newPasswordSchema } from "@/server/password-reset";
import { isAttemptAllowed, LOGIN_WINDOW_MINUTES, recordAttempt } from "@/server/security/login-throttle";

/** Quien actúa sobre sí mismo: la membresía (`User`) y la institución de su sesión. */
type Self = { id: string; institutionId: string };
export type SelfResult = { ok: true } | { ok: false; message: string };

const SESSION_ENDED = "Tu sesión terminó. Vuelve a iniciar sesión.";
export const NO_PASSWORD_YET =
  "Tu cuenta todavía no tiene contraseña. Sal y usa «¿Olvidaste tu contraseña?» en la pantalla de entrada para crear una.";

export const ownProfileSchema = z.object({
  name: z.string().trim().min(3, "Escribe tu nombre completo.").max(120, "El nombre es demasiado largo."),
  phone: z.string().trim().max(30, "El teléfono es demasiado largo.").optional(),
});

/**
 * Corrige el nombre y el teléfono propios. Solo toca el `User` de la sesión, en su institución.
 * El correo y el rol no se cambian aquí.
 */
export async function updateOwnProfile(actor: Self, input: { name: string; phone?: string }): Promise<SelfResult> {
  const parsed = ownProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const data = parsed.data;

  return db.$transaction(async (tx) => {
    const me = await tx.user.findFirst({
      where: { id: actor.id, institutionId: actor.institutionId, status: "ACTIVE" },
      select: { id: true, name: true, phone: true },
    });
    if (!me) return { ok: false, message: SESSION_ENDED } as const;
    const phone = data.phone || null;
    await tx.user.update({ where: { id: me.id }, data: { name: data.name, phone } });
    await tx.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        userId: me.id,
        action: "PROFILE_UPDATED",
        entity: "User",
        entityId: me.id,
        changes: { nameChanged: me.name !== data.name, phoneChanged: (me.phone ?? null) !== phone },
      },
    });
    return { ok: true } as const;
  });
}

/**
 * Cambia la contraseña propia. La contraseña pertenece a la identidad: cambia para todas las
 * instituciones de la persona y cierra todas sus sesiones, incluida la actual.
 * Los intentos fallidos con la contraseña actual cuentan igual que los de la pantalla de entrada.
 */
export async function changeOwnPassword(
  actor: Self,
  input: { currentPassword: string; newPassword: string; ip?: string },
): Promise<SelfResult> {
  const me = await db.user.findFirst({
    where: { id: actor.id, institutionId: actor.institutionId, status: "ACTIVE" },
    select: { id: true, identity: { select: { id: true, email: true, passwordHash: true, status: true } } },
  });
  if (!me) return { ok: false, message: SESSION_ENDED };
  const identity = me.identity;
  if (!identity?.passwordHash) return { ok: false, message: NO_PASSWORD_YET };
  if (identity.status !== "ACTIVE") return { ok: false, message: SESSION_ENDED };

  const attempt = { email: identity.email, ip: input.ip ?? "unknown" };
  if (!(await isAttemptAllowed(attempt))) {
    return { ok: false, message: `Hubo demasiados intentos. Espera ${LOGIN_WINDOW_MINUTES} minutos y vuelve a probar.` };
  }
  if (!input.currentPassword || !(await bcrypt.compare(input.currentPassword, identity.passwordHash))) {
    await recordAttempt(attempt, false);
    return {
      ok: false,
      message: "La contraseña actual no coincide. Escríbela de nuevo; si no la recuerdas, sal y usa «¿Olvidaste tu contraseña?».",
    };
  }

  const password = newPasswordSchema.safeParse(input.newPassword);
  if (!password.success) return { ok: false, message: password.error.issues[0]?.message ?? "Contraseña no válida." };
  if (password.data === input.currentPassword) {
    return { ok: false, message: "La contraseña nueva es igual a la actual. Elige una distinta." };
  }
  const passwordHash = await bcrypt.hash(password.data, 12);

  return db.$transaction(async (tx) => {
    // UPDATE condicional: si la contraseña cambió entre la comprobación y este punto, no se pisa.
    const changed = await tx.identity.updateMany({
      where: { id: identity.id, passwordHash: identity.passwordHash, status: "ACTIVE" },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });
    if (changed.count !== 1) return { ok: false, message: "Tu contraseña cambió hace un momento. Vuelve a iniciar sesión." } as const;
    // Los enlaces de recuperación pendientes dejan de servir.
    await tx.passwordResetToken.updateMany({ where: { user: { identityId: identity.id }, usedAt: null }, data: { usedAt: new Date() } });
    await tx.auditLog.create({
      data: { institutionId: actor.institutionId, userId: me.id, action: "PASSWORD_CHANGED", entity: "User", entityId: me.id },
    });
    return { ok: true } as const;
  });
}
