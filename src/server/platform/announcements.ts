import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isPlatformOperator } from "./institutions";
import { isIndependentSettings } from "./independent-kind";
import { announcementAudiences, platformAnnouncementSchema } from "./announcement-policy";
import type { EdukanaRole } from "@/types/next-auth";

function requireOperator(email: string | null) {
  if (!isPlatformOperator(email)) throw new Error("No tienes permiso para administrar avisos de Edukana.");
  return email!.trim().toLowerCase();
}
function snapshot(value: { title: string; body: string; level: string; audience: string; startsAt: Date; endsAt: Date | null }) {
  return { title: value.title, body: value.body, level: value.level, audience: value.audience,
    startsAt: value.startsAt.toISOString(), endsAt: value.endsAt?.toISOString() ?? null };
}
export async function listPlatformAnnouncements(operatorEmail: string | null) {
  requireOperator(operatorEmail);
  return db.platformAnnouncement.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 });
}
export async function getPlatformAnnouncement(operatorEmail: string | null, id: string) {
  requireOperator(operatorEmail);
  return db.platformAnnouncement.findUnique({ where: { id } });
}
export async function savePlatformAnnouncement(operatorEmail: string | null, input: unknown, id?: string) {
  const operator = requireOperator(operatorEmail);
  const parsed = platformAnnouncementSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  return db.$transaction(async (tx) => {
    if (id) await tx.$queryRaw`SELECT "id" FROM "platform_announcements" WHERE "id" = ${id} FOR UPDATE`;
    const before = id ? await tx.platformAnnouncement.findUnique({ where: { id } }) : null;
    if (id && !before) return { ok: false as const, message: "Ese aviso ya no existe. Vuelve a la lista." };
    const after = id
      ? await tx.platformAnnouncement.update({ where: { id }, data: parsed.data })
      : await tx.platformAnnouncement.create({ data: { ...parsed.data, createdBy: operator } });
    await tx.auditLog.create({ data: {
      action: id ? "PLATFORM_ANNOUNCEMENT_UPDATED" : "PLATFORM_ANNOUNCEMENT_CREATED",
      entity: "PlatformAnnouncement", entityId: after.id,
      changes: { operator, before: before ? snapshot(before) : null, after: snapshot(after) } as Prisma.InputJsonValue,
    } });
    return { ok: true as const, id: after.id };
  });
}
export async function endPlatformAnnouncement(operatorEmail: string | null, id: string, confirmation: string) {
  const operator = requireOperator(operatorEmail);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "platform_announcements" WHERE "id" = ${id} FOR UPDATE`;
    const before = await tx.platformAnnouncement.findUnique({ where: { id } });
    if (!before) return { ok: false as const, message: "Ese aviso ya no existe. Vuelve a la lista." };
    if (confirmation.trim() !== before.title) return { ok: false as const, message: "Escribe el título del aviso para terminarlo." };
    const now = new Date();
    if (before.endsAt && before.endsAt <= now) return { ok: true as const, id };
    const after = await tx.platformAnnouncement.update({ where: { id }, data: { endsAt: now } });
    await tx.auditLog.create({ data: {
      action: "PLATFORM_ANNOUNCEMENT_ENDED", entity: "PlatformAnnouncement", entityId: id,
      changes: { operator, before: snapshot(before), after: snapshot(after) } as Prisma.InputJsonValue,
    } });
    return { ok: true as const, id };
  });
}

/** Called only by the server dashboard with live session props; audience is re-read from the membership. */
export async function getDashboardPlatformAnnouncements(scope: { institutionId: string; userId: string; role: EdukanaRole }) {
  const member = await db.user.findFirst({
    where: { id: scope.userId, institutionId: scope.institutionId, status: "ACTIVE" },
    select: { role: true, identityId: true, institution: { select: { settings: true } } },
  });
  if (!member) return { personId: scope.userId, announcements: [] };
  const now = new Date();
  const announcements = await db.platformAnnouncement.findMany({
    where: {
      startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      audience: { in: announcementAudiences(member.role, isIndependentSettings(member.institution.settings)) },
    }, orderBy: [{ startsAt: "desc" }, { id: "desc" }],
    select: { id: true, title: true, body: true, level: true, endsAt: true },
  });
  return { personId: member.identityId ?? scope.userId, announcements };
}
