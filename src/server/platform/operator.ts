import type { InstitutionType, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizeEmail } from "@/server/identity";
import { countPendingInvitations, sendInvitations } from "@/server/people/invitations";
import { isPlatformOperator } from "./institutions";

/**
 * Lo que ve el operador de la plataforma: todas las instituciones, sus administradores y el
 * estado de sus invitaciones. Cada función vuelve a comprobar que el correo sea de un operador;
 * para cualquier otra persona devuelve null, y la pantalla responde «no existe».
 *
 * No se muestra el último acceso: los intentos de inicio de sesión se guardan cifrados por
 * correo, sin institución, y se borran al día, así que no dan un dato fiable por institución.
 */

const ADMIN_ROLES: Role[] = ["ADMIN", "SUPER_ADMIN"];

export type OperatorInstitutionRow = {
  id: string;
  name: string;
  slug: string;
  type: InstitutionType;
  createdAt: Date;
  activePeople: number;
  courses: number;
};

export const OPERATOR_LIST_LIMIT = 200;

/** Instituciones de la plataforma, la más reciente primero. `q` busca por nombre o identificador. */
export async function listInstitutionsForOperator(operatorEmail: string | null | undefined, q = ""): Promise<OperatorInstitutionRow[] | null> {
  if (!isPlatformOperator(operatorEmail)) return null;
  const search = q.trim().slice(0, 100);
  const rows = await db.institution.findMany({
    where: search
      ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { slug: { contains: search.toLowerCase() } }] }
      : undefined,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: OPERATOR_LIST_LIMIT,
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      createdAt: true,
      _count: { select: { users: { where: { status: "ACTIVE" } }, courses: { where: { archivedAt: null } } } },
    },
  });
  return rows.map(({ _count, ...row }) => ({ ...row, activePeople: _count.users, courses: _count.courses }));
}

export type AdminInvitationState = "HAS_PASSWORD" | "LINK_SENT" | "PENDING" | "SUSPENDED";

export type OperatorInstitutionDetail = OperatorInstitutionRow & {
  admins: Array<{ id: string; name: string; email: string; state: AdminInvitationState; linkExpiresAt: Date | null }>;
  /** Personas activas que todavía no crean su contraseña. */
  withoutPassword: number;
  /** De ellas, las que no tienen un enlace vigente: hay que invitarlas de nuevo. */
  pendingInvitations: number;
};

export async function getInstitutionForOperator(
  operatorEmail: string | null | undefined,
  institutionId: string,
  now = new Date(),
): Promise<OperatorInstitutionDetail | null> {
  if (!isPlatformOperator(operatorEmail) || !institutionId) return null;
  const institution = await db.institution.findUnique({
    where: { id: institutionId },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      createdAt: true,
      _count: { select: { users: { where: { status: "ACTIVE" } }, courses: { where: { archivedAt: null } } } },
    },
  });
  if (!institution) return null;
  const [admins, withoutPassword, pendingInvitations] = await Promise.all([
    db.user.findMany({
      where: { institutionId, role: { in: ADMIN_ROLES } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        identity: { select: { passwordHash: true, status: true } },
        passwordResetTokens: {
          where: { usedAt: null, expiresAt: { gt: now } },
          orderBy: { expiresAt: "desc" },
          take: 1,
          select: { expiresAt: true },
        },
      },
    }),
    db.user.count({ where: { institutionId, status: "ACTIVE", identity: { status: "ACTIVE", passwordHash: null } } }),
    countPendingInvitations(institutionId, now),
  ]);
  const { _count, ...row } = institution;
  return {
    ...row,
    activePeople: _count.users,
    courses: _count.courses,
    withoutPassword,
    pendingInvitations,
    admins: admins.map((admin) => {
      const link = admin.passwordResetTokens[0]?.expiresAt ?? null;
      const suspended = admin.status !== "ACTIVE" || admin.identity?.status !== "ACTIVE";
      const state: AdminInvitationState = suspended ? "SUSPENDED" : admin.identity?.passwordHash ? "HAS_PASSWORD" : link ? "LINK_SENT" : "PENDING";
      return { id: admin.id, name: admin.name, email: admin.email, state, linkExpiresAt: state === "LINK_SENT" ? link : null };
    }),
  };
}

export type ResendResult = { ok: boolean; message: string };

/**
 * Reenvía la invitación a un administrador que todavía no crea su contraseña.
 * Usa el mismo envío que la pantalla de Personas: enlace de un solo uso, válido 7 días.
 */
export async function resendAdminInvitation(
  operatorEmail: string | null | undefined,
  institutionId: string,
  adminUserId: string,
  now = new Date(),
): Promise<ResendResult> {
  if (!isPlatformOperator(operatorEmail)) return { ok: false, message: "No tienes permiso para hacer esto." };
  const admin = await db.user.findFirst({
    where: { id: adminUserId, institutionId, role: { in: ADMIN_ROLES } },
    select: { id: true, email: true, status: true, identity: { select: { passwordHash: true, status: true } } },
  });
  if (!admin) return { ok: false, message: "No encontramos a ese administrador en esta institución." };
  if (admin.status !== "ACTIVE" || admin.identity?.status !== "ACTIVE") {
    return { ok: false, message: "Esta cuenta está suspendida. La institución debe reactivarla antes de invitarla." };
  }
  if (admin.identity?.passwordHash) {
    return { ok: false, message: "Este administrador ya creó su contraseña. Si la olvidó, puede usar «¿Olvidaste tu contraseña?» al entrar." };
  }
  const result = await sendInvitations({ id: admin.id, institutionId }, [admin.id], now);
  await db.auditLog.create({
    data: {
      institutionId,
      action: "OPERATOR_INVITATION_RESENT",
      entity: "User",
      entityId: admin.id,
      changes: { operator: normalizeEmail(String(operatorEmail)), sent: result.sent === 1 },
    },
  });
  return result.sent === 1
    ? { ok: true, message: `Invitación reenviada a ${admin.email}. El enlace vence en 7 días.` }
    : { ok: false, message: "No se pudo enviar el correo. Revisa la configuración de correo e intenta de nuevo." };
}
