import "server-only";

import { Prisma } from "@prisma/client";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { resolveCourseReadScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import type { EdukanaRole } from "@/types/next-auth";

export type ReportActor = { id: string; institutionId: string; role: EdukanaRole };

/** Qué cursos puede ver quien abre los reportes: todos los de su institución, solo los que dicta, o ninguno. */
export type ReportScope = { kind: "all" } | { kind: "teacher"; teacherId: string } | { kind: "none" };

export type ReportAccess = {
  institutionId: string;
  scope: ReportScope;
  /** Cobros: solo con permiso de cobros y viendo toda la institución. */
  canSeeFinance: boolean;
  /** Personas sin contraseña: es un dato de toda la institución, no de un curso. */
  canSeeAccess: boolean;
};

export type ReportFilters = { periodId: string | null; programId: string | null };
export type ReportFilterOptions = {
  periods: Array<{ id: string; name: string; isActive: boolean }>;
  programs: Array<{ id: string; name: string }>;
};

/**
 * Autoriza en el servidor. Devuelve null si la persona no puede ver reportes.
 * Consultas: 1 (permisos del rol).
 */
export async function resolveReportAccess(actor: ReportActor): Promise<ReportAccess | null> {
  if (!actor.id || !actor.institutionId) return null;
  const capabilities = await getEffectiveCapabilities(actor.institutionId, actor.role);
  if (!capabilities.has("analytics.view")) return null;
  const courseScope = resolveCourseReadScope(actor, capabilities);
  const scope: ReportScope =
    courseScope.kind === "all" ? { kind: "all" } : courseScope.kind === "teacher" ? { kind: "teacher", teacherId: courseScope.teacherId } : { kind: "none" };
  const whole = scope.kind === "all";
  return {
    institutionId: actor.institutionId,
    scope,
    canSeeFinance: whole && capabilities.has("finance.manage"),
    canSeeAccess: whole,
  };
}

/**
 * Opciones de los filtros (solo de la institución de quien mira).
 * Consultas: 2 (períodos y programas).
 */
export async function listReportFilterOptions(access: ReportAccess): Promise<ReportFilterOptions> {
  const [periods, programs] = await Promise.all([
    db.academicPeriod.findMany({
      where: { institutionId: access.institutionId },
      orderBy: { startDate: "desc" },
      take: 100,
      select: { id: true, name: true, isActive: true },
    }),
    db.program.findMany({ where: { institutionId: access.institutionId }, orderBy: { name: "asc" }, take: 200, select: { id: true, name: true } }),
  ]);
  return { periods, programs };
}

/** Un filtro que no pertenece a la institución se ignora: nunca llega a una consulta. */
export function cleanReportFilters(options: ReportFilterOptions, raw: { periodId?: string | null; programId?: string | null }): ReportFilters {
  return {
    periodId: options.periods.some((period) => period.id === raw.periodId) ? raw.periodId! : null,
    programId: options.programs.some((program) => program.id === raw.programId) ? raw.programId! : null,
  };
}

/**
 * Condición SQL (sobre el alias `c` de `courses`) con los cursos que entran en un reporte:
 * de la institución, sin archivar, dentro del alcance de quien mira y de los filtros elegidos.
 */
export function scopedCourseCondition(access: ReportAccess, filters: ReportFilters, options: { includeArchived?: boolean } = {}): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`c."institutionId" = ${access.institutionId}`];
  if (!options.includeArchived) parts.push(Prisma.sql`c."archivedAt" IS NULL`);
  if (access.scope.kind === "none") parts.push(Prisma.sql`FALSE`);
  if (access.scope.kind === "teacher") parts.push(Prisma.sql`c."teacherId" = ${access.scope.teacherId}`);
  if (filters.periodId) parts.push(Prisma.sql`c."periodId" = ${filters.periodId}`);
  if (filters.programId) {
    parts.push(
      Prisma.sql`EXISTS (SELECT 1 FROM program_courses pc WHERE pc."courseId" = c.id AND pc."programId" = ${filters.programId} AND pc."institutionId" = ${access.institutionId})`,
    );
  }
  return Prisma.join(parts, " AND ");
}
