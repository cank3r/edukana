import "server-only";

import { db } from "@/lib/db";
import { roleLabel } from "@/lib/ux";
import { chargeBalances } from "@/server/finance/charges";
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

/** Filas de una sección, con encabezados. Null si esa sección no es para quien la pide. Consultas: 1 por sección (cobros: 1 + las de `chargeBalances`). */
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
  // Cobros: totales por estado, con lo pagado real (pagos no anulados). Sin permiso de cobros no se consulta nada.
  if (!access.canSeeFinance) return null;
  const charges = await db.paymentConcept.findMany({
    where: { institutionId: access.institutionId, ...(filters.periodId ? { periodId: filters.periodId } : {}) },
    select: { id: true },
  });
  const balances = await chargeBalances(access.institutionId, charges.map((charge) => charge.id), now);
  const groups = new Map<string, { status: string; currency: string; charges: number; cents: number; paid: number; owed: number }>();
  for (const balance of balances.values()) {
    const key = `${balance.status}|${balance.currency}`;
    const group = groups.get(key) ?? { status: balance.status, currency: balance.currency, charges: 0, cents: 0, paid: 0, owed: 0 };
    group.charges += 1;
    group.cents += balance.amountCents;
    group.paid += balance.paidCents;
    group.owed += balance.balanceCents;
    groups.set(key, group);
  }
  const totals = [...groups.values()].sort((a, b) => a.status.localeCompare(b.status) || a.currency.localeCompare(b.currency));
  return [
    ["Estado", "Moneda", "Cantidad de cobros", "Monto", "Pagado", "Por cobrar"],
    ...totals.map((row) => [PAYMENT_STATUS[row.status] ?? row.status, row.currency, row.charges, row.cents / 100, row.paid / 100, row.owed / 100]),
  ];
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
