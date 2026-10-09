import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { roleLabel } from "@/lib/ux";
import type { EdukanaRole } from "@/types/next-auth";
import { cleanReportFilters, listReportFilterOptions, resolveReportAccess, type ReportAccess, type ReportActor, type ReportFilters } from "./access";
import { reportCsv, type CsvValue } from "./csv";
import {
  EXPORT_ROWS,
  getCourseReport,
  getGroupReport,
  getProgramReport,
  getRiskReport,
  getTeacherReport,
  listPeopleWithoutAccess,
  riskReasons,
} from "./queries";

export const REPORT_SECTIONS = ["cursos", "riesgo", "docentes", "acceso", "grupos", "programas", "cobros"] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number];
export const isReportSection = (value: string | null | undefined): value is ReportSection => REPORT_SECTIONS.includes(value as ReportSection);

const one = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);
const date = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);
const PAYMENT_STATUS: Record<string, string> = { PAID: "Cobrado", PENDING: "Por cobrar", OVERDUE: "Vencido", PARTIAL: "Pago parcial", CANCELLED: "Anulado" };

/** Filas de una sección, con encabezados. Null si esa sección no es para quien la pide. Consultas: 1 por sección. */
export async function reportSectionRows(access: ReportAccess, filters: ReportFilters, section: ReportSection, now = new Date()): Promise<CsvValue[][] | null> {
  const all = { limit: EXPORT_ROWS };
  if (section === "cursos") {
    const { rows } = await getCourseReport(access, filters, { ...all, sort: { key: "nombre", desc: false } });
    return [
      ["Curso", "Código", "Docente", "Inscritos", "Retirados", "Avance promedio (%)", "Entregas por calificar", "Nota promedio (sobre 100)", "Avance bajo"],
      ...rows.map((row) => [row.name, row.code, row.teacherName, row.enrolled, row.withdrawn, one(row.averageProgress), row.pendingGrading, one(row.averageGrade), row.lowProgress ? "Sí" : "No"]),
    ];
  }
  if (section === "riesgo") {
    const { rows } = await getRiskReport(access, filters, { ...all, now });
    return [
      ["Estudiante", "Correo", "Motivo", "Cursos", "Avance promedio (%)", "Asistencia (%)", "Tareas vencidas", "Última actividad"],
      ...rows.map((row) => [
        row.name,
        row.email,
        riskReasons(row, now).join("; "),
        row.courses,
        one(row.averageProgress),
        row.classes > 0 ? one((row.attended / row.classes) * 100) : null,
        row.overdueTasks,
        date(row.lastActivityAt),
      ]),
    ];
  }
  if (section === "docentes") {
    const { rows } = await getTeacherReport(access, filters, { ...all, sort: { key: "nombre", desc: false } });
    return [
      ["Docente", "Cursos", "Estudiantes", "Entregas por calificar", "La más antigua espera desde"],
      ...rows.map((row) => [row.name, row.courses, row.students, row.pendingGrading, date(row.oldestPendingAt)]),
    ];
  }
  if (section === "acceso") {
    const people = await listPeopleWithoutAccess(access);
    if (!people) return null;
    return [["Nombre", "Correo", "Rol"], ...people.map((person) => [person.name, person.email, roleLabel(person.role as EdukanaRole)])];
  }
  if (section === "grupos") {
    const { rows } = await getGroupReport(access, filters, { ...all, sort: { key: "nombre", desc: false } });
    return [["Grupo", "Programa", "Estudiantes", "Cupo", "Avance promedio (%)"], ...rows.map((row) => [row.name, row.programName, row.members, row.capacity, one(row.averageProgress)])];
  }
  if (section === "programas") {
    const { rows } = await getProgramReport(access, filters, { ...all, sort: { key: "nombre", desc: false } });
    return [["Programa", "Cursos", "Estudiantes", "Avance promedio (%)"], ...rows.map((row) => [row.name, row.courses, row.students, one(row.averageProgress)])];
  }
  // Cobros: totales por estado. Sin permiso de cobros no se consulta nada.
  if (!access.canSeeFinance) return null;
  const totals = await db.$queryRaw<Array<{ status: string; currency: string; charges: number; cents: number }>>(Prisma.sql`
    SELECT status::text AS status, currency, COUNT(*)::int AS charges, SUM(COALESCE("amountCents", ROUND(amount * 100))::bigint)::float8 AS cents
    FROM payment_concepts
    WHERE "institutionId" = ${access.institutionId} ${filters.periodId ? Prisma.sql`AND "periodId" = ${filters.periodId}` : Prisma.empty}
    GROUP BY status, currency
    ORDER BY status, currency
  `);
  return [["Estado", "Moneda", "Cantidad de cobros", "Monto"], ...totals.map((row) => [PAYMENT_STATUS[row.status] ?? row.status, row.currency, row.charges, Math.round(row.cents) / 100])];
}

/**
 * Archivo CSV de una sección. Autoriza aquí mismo (permiso de reportes e institución de quien pide):
 * devuelve null si la persona no puede ver reportes o esa sección.
 * Consultas: 1 de permisos + 2 de filtros + 1 de la sección.
 */
export async function reportCsvFile(
  actor: ReportActor,
  section: ReportSection,
  rawFilters: { periodId?: string | null; programId?: string | null },
  now = new Date(),
): Promise<{ filename: string; content: string } | null> {
  const access = await resolveReportAccess(actor);
  if (!access) return null;
  const filters = cleanReportFilters(await listReportFilterOptions(access), rawFilters);
  const rows = await reportSectionRows(access, filters, section, now);
  if (!rows) return null;
  return { filename: `reporte-${section}-${now.toISOString().slice(0, 10)}.csv`, content: reportCsv(rows) };
}
