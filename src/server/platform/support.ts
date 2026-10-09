import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getAdminHome } from "@/server/admin-home";
import { normalizeEmail } from "@/server/identity";
import { isPlatformOperator } from "./institutions";

export const SUPPORT_DURATION_MS = 30 * 60_000;
export const SUPPORT_COOKIE = "edukana-support-view";
export const SUPPORT_READ_ONLY_MESSAGE = "La vista de soporte es de solo lectura.";

type SupportGrant = { institutionId: string; operator: string; expiresAt: Date; auditId: string };
const ticketId = (ticket: string) => createHash("sha256").update(ticket).digest("hex");
const jsonObject = (value: Prisma.JsonValue | null) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

/** An isolated support view never supplies an actor to domain mutations or changes the Auth.js session. */
export function assertSupportReadOnly(operation: string): void {
  if (operation !== "read") throw new Error(SUPPORT_READ_ONLY_MESSAGE);
}

async function findGrant(operatorEmail: string | null, ticket: string | undefined): Promise<SupportGrant | null> {
  if (!isPlatformOperator(operatorEmail) || !ticket || !/^[a-f0-9]{64}$/.test(ticket)) return null;
  const auditId = ticketId(ticket);
  const [entry, exit] = await Promise.all([
    db.auditLog.findUnique({ where: { id: auditId } }),
    db.auditLog.findUnique({ where: { id: `support-exit-${auditId}` }, select: { id: true } }),
  ]);
  if (!entry || exit || entry.action !== "PLATFORM_SUPPORT_ENTERED" || !entry.institutionId) return null;
  const changes = jsonObject(entry.changes);
  if (changes.operator !== normalizeEmail(operatorEmail!)) return null;
  const expiresAt = new Date(String(changes.expiresAt));
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() > entry.createdAt.getTime() + SUPPORT_DURATION_MS) return null;
  return { institutionId: entry.institutionId, operator: String(changes.operator), expiresAt, auditId };
}

async function recordExit(grant: SupportGrant, reason: "exit" | "expired", now: Date) {
  // Deterministic primary key makes parallel exits idempotent, using an existing index only.
  await db.auditLog.upsert({
    where: { id: `support-exit-${grant.auditId}` }, update: {},
    create: {
      id: `support-exit-${grant.auditId}`, institutionId: grant.institutionId,
      action: "PLATFORM_SUPPORT_EXITED", entity: "Institution", entityId: grant.institutionId, createdAt: now,
      changes: { operator: grant.operator, before: { support: true }, after: { support: false }, reason },
    },
  });
}

export async function startSupportView(operatorEmail: string | null, institutionId: string, confirmation: string, now = new Date()) {
  if (!isPlatformOperator(operatorEmail)) return { ok: false as const, message: "No tienes permiso para hacer esto." };
  const institution = await db.institution.findUnique({ where: { id: institutionId }, select: { name: true } });
  if (!institution || confirmation.trim() !== institution.name) {
    return { ok: false as const, message: "Escribe el nombre completo de la institución para confirmar." };
  }
  const ticket = randomBytes(32).toString("hex");
  const expiresAt = new Date(now.getTime() + SUPPORT_DURATION_MS);
  await db.auditLog.create({ data: {
    id: ticketId(ticket), institutionId, action: "PLATFORM_SUPPORT_ENTERED", entity: "Institution", entityId: institutionId,
    createdAt: now,
    changes: {
      operator: normalizeEmail(operatorEmail!), before: { support: false }, after: { support: true, readOnly: true },
      expiresAt: expiresAt.toISOString(),
    },
  } });
  return { ok: true as const, ticket, expiresAt };
}

export async function stopSupportView(operatorEmail: string | null, ticket: string | undefined, now = new Date()) {
  const grant = await findGrant(operatorEmail, ticket);
  if (!grant) return null;
  await recordExit(grant, grant.expiresAt <= now ? "expired" : "exit", now);
  return grant.institutionId;
}

export async function readSupportView(
  operatorEmail: string | null, ticket: string | undefined, institutionId: string, operation = "read", now = new Date(),
) {
  assertSupportReadOnly(operation);
  const grant = await findGrant(operatorEmail, ticket);
  if (!grant || grant.institutionId !== institutionId) return null;
  if (grant.expiresAt <= now) {
    await recordExit(grant, "expired", now);
    return null;
  }
  const home = await getAdminHome(institutionId, now);
  if (!home.institutionName) return null;
  return { home, expiresAt: grant.expiresAt };
}
