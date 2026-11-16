import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isPlatformOperator } from "./institutions";
import { normalizeEmail } from "@/server/identity";

export const AUDIT_PAGE_SIZE = 30;
export type AuditFilters = { institutionId?: string; action?: string; operator?: string; from?: string; to?: string; cursor?: string };
const date = (value?: string) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const result = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(result.getTime()) && result.toISOString().slice(0, 10) === value ? result : undefined;
};
export function auditCursor(row: { createdAt: Date; id: string }) {
  return Buffer.from(JSON.stringify([row.createdAt.toISOString(), row.id])).toString("base64url");
}
export function auditWhere(filters: AuditFilters): Prisma.AuditLogWhereInput {
  const from = date(filters.from);
  const to = date(filters.to);
  if ((filters.from && !from) || (filters.to && !to) || (from && to && from > to)) throw new Error("Revisa las fechas del filtro.");
  const where: Prisma.AuditLogWhereInput = {
    ...(filters.institutionId ? { institutionId: filters.institutionId.slice(0, 200) } : {}),
    ...(filters.action === "all" ? {} : { action: filters.action !== "PLATFORM_*" && filters.action?.startsWith("PLATFORM_")
      ? filters.action.slice(0, 120) : { startsWith: "PLATFORM_" } }),
    ...(filters.operator ? { changes: { path: ["operator"], equals: normalizeEmail(filters.operator).slice(0, 254) } } : {}),
    ...((from || to) ? { createdAt: { gte: from, lt: to ? new Date(to.getTime() + 86_400_000) : undefined } } : {}),
  };
  if (filters.cursor) {
    try {
      if (filters.cursor.length > 700) throw new Error();
      const parsed: unknown = JSON.parse(Buffer.from(filters.cursor, "base64url").toString());
      if (!Array.isArray(parsed) || parsed.length !== 2 || typeof parsed[0] !== "string" || typeof parsed[1] !== "string") throw new Error();
      const [timestamp, id] = parsed;
      const createdAt = new Date(timestamp);
      if (!id || id.length > 200 || !Number.isFinite(createdAt.getTime())) throw new Error();
      where.AND = [{ OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] }];
    } catch { throw new Error("La página de la bitácora no es válida. Vuelve al inicio."); }
  }
  return where;
}

/** Existing (institutionId, createdAt) and primary-key indexes; no OFFSET and no full rows/changes exposed. */
export async function listAuditLog(operatorEmail: string | null, filters: AuditFilters) {
  if (!isPlatformOperator(operatorEmail)) return null;
  const rows = await db.auditLog.findMany({
    where: auditWhere(filters), orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: AUDIT_PAGE_SIZE + 1,
    select: { id: true, institutionId: true, userId: true, action: true, entity: true, entityId: true, changes: true, createdAt: true },
  });
  const page = rows.slice(0, AUDIT_PAGE_SIZE);
  const institutions = await db.institution.findMany({
    where: { id: { in: [...new Set(page.flatMap((row) => row.institutionId ? [row.institutionId] : []))] } },
    select: { id: true, name: true },
  });
  const names = new Map(institutions.map((institution) => [institution.id, institution.name]));
  return {
    rows: page.map(({ changes, ...row }) => ({
      ...row,
      operator: changes && typeof changes === "object" && !Array.isArray(changes) && typeof changes.operator === "string"
        ? changes.operator : row.userId ? "Persona de la institución" : "Sistema",
      institutionName: row.institutionId ? names.get(row.institutionId) ?? "Institución no disponible" : "Plataforma",
      href: auditEntityHref(row),
    })),
    nextCursor: rows.length > AUDIT_PAGE_SIZE ? auditCursor(page[page.length - 1]) : null,
  };
}

export function auditEntityHref(row: { entity: string; entityId: string | null; institutionId: string | null }) {
  if (row.entity === "PlatformAnnouncement") return "/operador/avisos";
  if (row.entity === "PlatformPlan") return "/operador/planes";
  if (row.institutionId) return `/operador/${encodeURIComponent(row.institutionId)}`;
  return null;
}
