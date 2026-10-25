import { Prisma } from "@prisma/client";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { isValidTimeZone, zonedDateKey } from "@/lib/timezone";
import { fail, type AcademicActor, type AcademicResult } from "./programs";

/**
 * Períodos académicos de una institución.
 *
 * Regla del período actual: hay como máximo UNO por institución (`isActive`). El inicio del
 * administrador y los avisos de "no hay período en curso" leen ese único período, y la pantalla
 * anterior ya desactivaba los demás al crear uno. Marcar otro como actual desmarca el anterior
 * en la misma transacción. Los cursos no dependen de esa marca: se pueden crear en cualquier período.
 *
 * Las fechas son días de calendario: el inicio se guarda a las 00:00 UTC y el fin a las 23:59 UTC
 * de ese día, y se leen de vuelta como `AAAA-MM-DD` sin pasar por ninguna zona horaria.
 */

const NOT_FOUND = "No encontramos ese período. Actualiza la página.";
const NO_PERMISSION = "No tienes permiso para cambiar los períodos.";
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type PeriodInput = { name: string; startDate: string; endDate: string };
/** Actual: es el período marcado. Próximo: aún no empieza. Terminado: ya pasó su fecha final. Sin marcar: está en fechas pero no es el actual. */
export type PeriodStatus = "CURRENT" | "UPCOMING" | "ENDED" | "UNMARKED";
export type PeriodRow = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  status: PeriodStatus;
  /** Está marcado como actual pero su fecha final ya pasó. */
  currentButEnded: boolean;
  courseCount: number;
  chargeCount: number;
  /** Nombres de otros períodos cuyas fechas se cruzan con este. */
  overlapsWith: string[];
};

/** Valida `AAAA-MM-DD` y rechaza días imposibles (31 de febrero). */
function isRealDay(value: string) {
  const match = DAY_RE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 2000 && year <= 2100 && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export const dayKey = (date: Date) => date.toISOString().slice(0, 10);
const startOfDay = (key: string) => new Date(`${key}T00:00:00.000Z`);
const endOfDay = (key: string) => new Date(`${key}T23:59:59.999Z`);

type Checked = { ok: true; data: PeriodInput } | { ok: false; message: string };

export function checkPeriodInput(input: PeriodInput): Checked {
  const name = String(input.name ?? "").trim();
  const startDate = String(input.startDate ?? "").trim();
  const endDate = String(input.endDate ?? "").trim();
  if (name.length < 3) return fail("Escribe el nombre del período (al menos 3 letras), por ejemplo «Enero–Abril 2027».");
  if (name.length > 100) return fail("El nombre es demasiado largo.");
  if (!isRealDay(startDate)) return fail("Elige la fecha en que empieza el período.");
  if (!isRealDay(endDate)) return fail("Elige la fecha en que termina el período.");
  if (endDate < startDate) return fail("La fecha final no puede ser anterior a la fecha de inicio. Revisa las dos fechas.");
  return { ok: true, data: { name, startDate, endDate } };
}

export function periodStatus(period: { startDate: string; endDate: string; isCurrent: boolean }, today: string): PeriodStatus {
  if (period.isCurrent) return "CURRENT";
  if (period.endDate < today) return "ENDED";
  if (period.startDate > today) return "UPCOMING";
  return "UNMARKED";
}

const overlaps = (a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }) =>
  a.startDate <= b.endDate && b.startDate <= a.endDate;

async function can(actor: AcademicActor) {
  return (await getEffectiveCapabilities(actor.institutionId, actor.role)).has("academic.structure.manage");
}

/** Bloquea la fila de la institución: dos cambios de período simultáneos se hacen uno después del otro. */
async function lockInstitution(tx: Prisma.TransactionClient, institutionId: string) {
  await tx.$queryRaw`SELECT "id" FROM "institutions" WHERE "id" = ${institutionId} FOR UPDATE`;
}

async function overlappingNames(tx: Prisma.TransactionClient, institutionId: string, range: PeriodInput, exceptId?: string) {
  const rows = await tx.academicPeriod.findMany({
    where: {
      institutionId,
      ...(exceptId ? { id: { not: exceptId } } : {}),
      startDate: { lte: endOfDay(range.endDate) },
      endDate: { gte: startOfDay(range.startDate) },
    },
    orderBy: { startDate: "asc" },
    select: { name: true },
  });
  return rows.map((row) => row.name);
}

/** Períodos de la institución, del más reciente al más antiguo, con su estado a día de hoy. */
export async function listPeriods(institutionId: string, now: Date = new Date()): Promise<PeriodRow[]> {
  const [institution, periods] = await Promise.all([
    db.institution.findUnique({ where: { id: institutionId }, select: { timezone: true } }),
    db.academicPeriod.findMany({
      where: { institutionId },
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
      select: { id: true, name: true, startDate: true, endDate: true, isActive: true, _count: { select: { courses: true, paymentConcepts: true } } },
    }),
  ]);
  const timeZone = institution && isValidTimeZone(institution.timezone) ? institution.timezone : "UTC";
  const today = zonedDateKey(now, timeZone);
  const rows = periods.map((period) => ({
    id: period.id,
    name: period.name,
    startDate: dayKey(period.startDate),
    endDate: dayKey(period.endDate),
    isCurrent: period.isActive,
    courseCount: period._count.courses,
    chargeCount: period._count.paymentConcepts,
  }));
  return rows.map((row) => ({
    ...row,
    status: periodStatus(row, today),
    currentButEnded: row.isCurrent && row.endDate < today,
    overlapsWith: rows.filter((other) => other.id !== row.id && overlaps(row, other)).map((other) => other.name),
  }));
}

/**
 * Crea un período. Si es el primero de la institución queda marcado como actual;
 * si ya hay otros, no cambia cuál es el actual.
 */
export async function createPeriod(actor: AcademicActor, input: PeriodInput): Promise<AcademicResult<{ periodId: string; isCurrent: boolean; overlapsWith: string[] }>> {
  if (!(await can(actor))) return fail(NO_PERMISSION);
  const checked = checkPeriodInput(input);
  if (!checked.ok) return checked;
  const data = checked.data;
  return db.$transaction(async (tx) => {
    await lockInstitution(tx, actor.institutionId);
    const existing = await tx.academicPeriod.count({ where: { institutionId: actor.institutionId } });
    const overlapsWith = await overlappingNames(tx, actor.institutionId, data);
    const isCurrent = existing === 0;
    const period = await tx.academicPeriod.create({
      data: { institutionId: actor.institutionId, name: data.name, startDate: startOfDay(data.startDate), endDate: endOfDay(data.endDate), isActive: isCurrent },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: { institutionId: actor.institutionId, userId: actor.id, action: "ACADEMIC_PERIOD_CREATED", entity: "AcademicPeriod", entityId: period.id, changes: { ...data, active: isCurrent } },
    });
    return { ok: true, periodId: period.id, isCurrent, overlapsWith } as const;
  });
}

/** Cambia nombre y fechas. No cambia cuál es el período actual ni toca los cursos. */
export async function updatePeriod(actor: AcademicActor, periodId: string, input: PeriodInput): Promise<AcademicResult<{ overlapsWith: string[] }>> {
  if (!(await can(actor))) return fail(NO_PERMISSION);
  const checked = checkPeriodInput(input);
  if (!checked.ok) return checked;
  const data = checked.data;
  return db.$transaction(async (tx) => {
    const before = await tx.academicPeriod.findFirst({ where: { id: periodId, institutionId: actor.institutionId }, select: { id: true, name: true, startDate: true, endDate: true } });
    if (!before) return fail(NOT_FOUND);
    await tx.academicPeriod.update({ where: { id: before.id }, data: { name: data.name, startDate: startOfDay(data.startDate), endDate: endOfDay(data.endDate) } });
    await tx.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        userId: actor.id,
        action: "ACADEMIC_PERIOD_UPDATED",
        entity: "AcademicPeriod",
        entityId: before.id,
        changes: { before: { name: before.name, startDate: dayKey(before.startDate), endDate: dayKey(before.endDate) }, after: data },
      },
    });
    return { ok: true, overlapsWith: await overlappingNames(tx, actor.institutionId, data, before.id) } as const;
  });
}

/** Marca un período como el actual y desmarca cualquier otro de la institución, todo junto. */
export async function setCurrentPeriod(actor: AcademicActor, periodId: string): Promise<AcademicResult<{ name: string; replaced: string[] }>> {
  if (!(await can(actor))) return fail(NO_PERMISSION);
  return db.$transaction(async (tx) => {
    await lockInstitution(tx, actor.institutionId);
    const period = await tx.academicPeriod.findFirst({ where: { id: periodId, institutionId: actor.institutionId }, select: { id: true, name: true } });
    if (!period) return fail(NOT_FOUND);
    const others = await tx.academicPeriod.findMany({ where: { institutionId: actor.institutionId, isActive: true, id: { not: period.id } }, select: { name: true } });
    await tx.academicPeriod.updateMany({ where: { institutionId: actor.institutionId, isActive: true, id: { not: period.id } }, data: { isActive: false } });
    await tx.academicPeriod.update({ where: { id: period.id }, data: { isActive: true } });
    const replaced = others.map((other) => other.name);
    await tx.auditLog.create({
      data: { institutionId: actor.institutionId, userId: actor.id, action: "ACADEMIC_PERIOD_ACTIVATED", entity: "AcademicPeriod", entityId: period.id, changes: { name: period.name, replaced } },
    });
    return { ok: true, name: period.name, replaced } as const;
  });
}

const count = (value: number, one: string, many: string) => (value === 1 ? `1 ${one}` : `${value} ${many}`);

/** Por qué no se puede borrar un período con cursos o cobros, y qué hacer. Null si sí se puede. */
export function deleteBlockedReason(courseCount: number, chargeCount: number): string | null {
  if (courseCount === 0 && chargeCount === 0) return null;
  const parts = [courseCount > 0 ? count(courseCount, "curso", "cursos") : "", chargeCount > 0 ? count(chargeCount, "cobro", "cobros") : ""].filter(Boolean);
  return `No se puede borrar: este período tiene ${parts.join(" y ")}. Borrarlo dejaría esos datos sin período. Si ya terminó, déjalo como está: queda guardado como historial y no estorba. Si lo creaste por error, cambia primero sus cursos a otro período y vuelve a intentarlo.`;
}

/** Borra un período solo si no tiene cursos ni cobros. */
export async function deletePeriod(actor: AcademicActor, periodId: string): Promise<AcademicResult<{ name: string; wasCurrent: boolean }>> {
  if (!(await can(actor))) return fail(NO_PERMISSION);
  return db.$transaction(async (tx) => {
    await lockInstitution(tx, actor.institutionId);
    const period = await tx.academicPeriod.findFirst({
      where: { id: periodId, institutionId: actor.institutionId },
      select: { id: true, name: true, isActive: true, _count: { select: { courses: true, paymentConcepts: true, gradingPeriods: true } } },
    });
    if (!period) return fail(NOT_FOUND);
    const blocked = deleteBlockedReason(period._count.courses, period._count.paymentConcepts);
    if (blocked) return fail(blocked);
    if (period._count.gradingPeriods > 0) return fail("No se puede borrar: hay cursos que todavía usan este período para organizar sus calificaciones.");
    await tx.academicPeriod.delete({ where: { id: period.id } });
    await tx.auditLog.create({
      data: { institutionId: actor.institutionId, userId: actor.id, action: "ACADEMIC_PERIOD_DELETED", entity: "AcademicPeriod", entityId: period.id, changes: { name: period.name, wasCurrent: period.isActive } },
    });
    return { ok: true, name: period.name, wasCurrent: period.isActive } as const;
  });
}
