import { db } from "@/lib/db";
import { getEmailProvider } from "@/server/integrations/email";
import { hashToken, issuePasswordToken } from "@/server/password-reset";

import { brandedEmail, emailBrandSelect } from "@/server/platform/branded-email";
import { institutionBaseUrl } from "@/server/platform/domain-policy";

export const INVITATION_DAYS = 7;
/** Tope por llamada: mantiene cada envío dentro del tiempo de una petición y del ritmo del proveedor. */
export const INVITATION_BATCH = 50;

export type InvitationResult = { sent: number; failed: number; skipped: number; remaining: number };

type Actor = { id: string; institutionId: string };

const targetSelect = {
  id: true,
  name: true,
  email: true,
  institution: { select: emailBrandSelect },
  identity: { select: { passwordHash: true, status: true } },
} as const;

/**
 * Envía la invitación a personas de la institución de quien invita.
 *
 * Quien aún no tiene contraseña recibe un enlace de un solo uso, válido 7 días, para definirla.
 * Quien ya tiene cuenta en otra institución recibe solo un aviso: entra con la contraseña que
 * ya usa, y quien la invita no puede cambiársela.
 *
 * Los ids de otra institución, o de personas suspendidas, se ignoran y cuentan como `skipped`.
 */
export async function sendInvitations(actor: Actor, userIds: string[], now = new Date()): Promise<InvitationResult> {
  const ids = [...new Set(userIds)].slice(0, INVITATION_BATCH);
  const users = await db.user.findMany({
    where: { id: { in: ids }, institutionId: actor.institutionId, status: "ACTIVE" },
    select: targetSelect,
  });
  const result: InvitationResult = { sent: 0, failed: 0, skipped: userIds.length - users.length, remaining: 0 };
  const invited: string[] = [];
  for (const user of users) {
    if (!user.identity || user.identity.status !== "ACTIVE") {
      result.skipped += 1;
      continue;
    }
    let token: string | null = null;
    const lines = [`Hola, ${user.name}:`, "", `${user.institution.name} te dio acceso a Edukana.`];
    try {
      const base = institutionBaseUrl(user.institution);
      if (user.identity.passwordHash) {
        lines.push("Ya tienes una cuenta con este correo: entra con tu contraseña de siempre.", "", `${base}/login`);
      } else {
        token = await issuePasswordToken(db, { userId: user.id, minutes: INVITATION_DAYS * 24 * 60 }, now);
        lines.push(
          `Abre este enlace para crear tu contraseña. Vence en ${INVITATION_DAYS} días y solo funciona una vez:`,
          "",
          `${base}/restablecer/${token}`,
          "",
          `Si vence, entra a ${base}/recuperar y pide uno nuevo con este mismo correo.`,
        );
      }
      await getEmailProvider().send(brandedEmail(user.institution, { to: user.email, subject: `Tu acceso a ${user.institution.name}`, text: lines.join("\n") }));
      result.sent += 1;
      invited.push(user.id);
    } catch (error) {
      result.failed += 1;
      // Sin correo no hay invitación: se retira el enlace para que la persona siga contando como pendiente.
      if (token) await db.passwordResetToken.deleteMany({ where: { tokenHash: hashToken(token) } });
      console.error("sendInvitations: no se pudo enviar", { correlationId: crypto.randomUUID(), userId: user.id, error });
    }
  }
  if (invited.length) {
    await db.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        userId: actor.id,
        action: "PEOPLE_INVITED",
        entity: "User",
        changes: { count: invited.length, userIds: invited },
      },
    });
  }
  return result;
}

/** Personas activas que aún no pueden entrar: sin contraseña y sin un enlace vigente. */
function pendingWhere(institutionId: string, now: Date) {
  return {
    institutionId,
    status: "ACTIVE" as const,
    identity: { status: "ACTIVE" as const, passwordHash: null },
    passwordResetTokens: { none: { usedAt: null, expiresAt: { gt: now } } },
  };
}

export function countPendingInvitations(institutionId: string, now = new Date()) {
  return db.user.count({ where: pendingWhere(institutionId, now) });
}

/**
 * Invita al siguiente lote de personas pendientes. `remaining` dice cuántas faltan:
 * la pantalla repite la llamada hasta que llegue a cero. Repetirla no reenvía a nadie,
 * porque quien ya tiene un enlace vigente deja de estar pendiente.
 */
export async function sendPendingInvitations(actor: Actor, now = new Date()): Promise<InvitationResult> {
  const pending = await db.user.findMany({
    where: pendingWhere(actor.institutionId, now),
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: INVITATION_BATCH,
  });
  const result = await sendInvitations(actor, pending.map((user) => user.id), now);
  // Si el correo falla, las fallidas siguen pendientes: se informa, y no se entra en un bucle.
  return { ...result, remaining: await countPendingInvitations(actor.institutionId, now) };
}
