import { Prisma } from "@prisma/client";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { canViewGuardianArea, type GuardianLink } from "@/lib/guardianship-policy";
import { zonedDateKey } from "@/lib/timezone";
import { notifyChargeCreated, notifyChargesWithinTransaction } from "@/server/notifications/events";
import type { EdukanaRole } from "@/types/next-auth";
import {
  centsToDecimal,
  chargeCents,
  dateKeyToStored,
  dueDateKey,
  formatMoney,
  institutionCurrency,
  paidCentsOf,
  shownStatus,
  statusForPaid,
  MAX_CENTS,
  type ChargeStatus,
  type ShownStatus,
} from "./money";

/**
 * Cobros sin pasarela. Todo se calcula en centavos enteros.
 *
 * El modelo `PaymentConcept` no tiene dónde guardar cada pago ni el total pagado, así que cada pago
 * se registra como una fila de `AuditLog` (acción FINANCE_PAYMENT_RECORDED) y lo pagado de un cargo
 * es la suma de esas filas. El estado del cargo (PENDING, PARTIAL, PAID) se actualiza con cada pago.
 */

type Actor = { id: string; institutionId: string; role: EdukanaRole };
type Tx = Prisma.TransactionClient;

export type PaymentMethod = "CASH" | "TRANSFER" | "CARD" | "OTHER";
export const PAYMENT_METHODS: readonly PaymentMethod[] = ["CASH", "TRANSFER", "CARD", "OTHER"];

export type PaymentEntry = { id: string; amountCents: number; paidOn: string; method: PaymentMethod; note: string };
export type ChargeRow = {
  id: string;
  studentId: string | null;
  studentName: string;
  concept: string;
  periodId: string | null;
  periodName: string;
  currency: string;
  amountCents: number;
  paidCents: number;
  balanceCents: number;
  dueKey: string | null;
  status: ShownStatus;
  cancelReason: string;
  payments: PaymentEntry[];
};
export type FinanceSummary = { receivableCents: number; overdueCents: number; collectedThisMonthCents: number };
export type ChargeFilters = { query?: string; status?: string; periodId?: string };
export type ChargeList = {
  currency: string;
  todayKey: string;
  summary: FinanceSummary;
  total: number;
  matching: number;
  charges: ChargeRow[];
};
export type StudentAccount = {
  student: { id: string; name: string };
  currency: string;
  owedCents: number;
  overdueCents: number;
  paidCents: number;
  charges: ChargeRow[];
};
export type ChargeTarget = { kind: "group" | "course"; id: string; name: string; students: number };
export type FinanceResult = { ok: true } | { ok: false; message: string };
export type GroupChargeResult =
  | { ok: true; created: number; repeated: boolean; amountCents: number; currency: string; targetName: string }
  | { ok: false; message: string };

export const FINANCE_AUDIT = {
  created: "FINANCE_CHARGE_CREATED",
  batch: "FINANCE_GROUP_CHARGES_CREATED",
  payment: "FINANCE_PAYMENT_RECORDED",
  updated: "FINANCE_CHARGE_UPDATED",
  cancelled: "FINANCE_CHARGE_CANCELLED",
  deleted: "FINANCE_CHARGE_DELETED",
} as const;

const ENTITY = "PaymentConcept";
const BATCH_ENTITY = "PaymentBatch";
const LIST_LIMIT = 200;
const MAX_GROUP = 1000;
const NO_PERMISSION = "No tienes permiso para gestionar cobros.";
const NOT_FOUND = "No encontramos ese cargo. Puede que alguien lo haya borrado; recarga la página.";
// El bloqueo de la fila del cargo (FOR UPDATE) serializa los pagos; READ COMMITTED basta.
const rowLocked = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted } as const;

const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export async function canManageFinance(actor: Actor): Promise<boolean> {
  if (!actor.institutionId) return false;
  return (await getEffectiveCapabilities(actor.institutionId, actor.role)).has("finance.manage");
}

async function institutionContext(institutionId: string, now: Date) {
  const institution = await db.institution.findUnique({ where: { id: institutionId }, select: { timezone: true, settings: true } });
  const timeZone = institution?.timezone || "America/Santo_Domingo";
  let todayKey: string;
  try {
    todayKey = zonedDateKey(now, timeZone);
  } catch {
    todayKey = zonedDateKey(now, "America/Santo_Domingo");
  }
  return { currency: institutionCurrency(institution?.settings), todayKey };
}

function readPayment(log: { id: string; changes: Prisma.JsonValue | null }): PaymentEntry | null {
  const data = log.changes && typeof log.changes === "object" && !Array.isArray(log.changes) ? (log.changes as Record<string, unknown>) : null;
  if (!data) return null;
  const amountCents = data.amountCents;
  if (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents <= 0) return null;
  const method = PAYMENT_METHODS.includes(data.method as PaymentMethod) ? (data.method as PaymentMethod) : "OTHER";
  return { id: log.id, amountCents, paidOn: typeof data.paidOn === "string" ? data.paidOn : "", method, note: typeof data.note === "string" ? data.note : "" };
}

const sum = (entries: PaymentEntry[]) => entries.reduce((total, entry) => total + entry.amountCents, 0);

async function recordedPayments(client: Tx | typeof db, institutionId: string, chargeId: string) {
  const logs = await client.auditLog.findMany({
    where: { institutionId, entity: ENTITY, entityId: chargeId, action: FINANCE_AUDIT.payment },
    select: { id: true, changes: true },
    orderBy: { createdAt: "asc" },
  });
  return logs.map(readPayment).filter((entry): entry is PaymentEntry => entry !== null);
}

/** Cargos con lo pagado y el estado que se muestra. `where` ya debe traer la institución. */
async function loadRows(institutionId: string, where: Prisma.PaymentConceptWhereInput, todayKey: string, allLogs: boolean) {
  const charges = await db.paymentConcept.findMany({
    where: { AND: [{ institutionId }, where] },
    select: {
      id: true,
      studentId: true,
      periodId: true,
      concept: true,
      amount: true,
      amountCents: true,
      currency: true,
      dueDate: true,
      paidAt: true,
      status: true,
      student: { select: { name: true } },
      period: { select: { name: true } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });
  const logs = charges.length
    ? await db.auditLog.findMany({
        where: {
          institutionId,
          entity: ENTITY,
          action: { in: [FINANCE_AUDIT.payment, FINANCE_AUDIT.cancelled] },
          ...(allLogs ? {} : { entityId: { in: charges.map((charge) => charge.id) } }),
        },
        select: { id: true, entityId: true, action: true, changes: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const paymentsBy = new Map<string, PaymentEntry[]>();
  const reasonBy = new Map<string, string>();
  for (const log of logs) {
    if (!log.entityId) continue;
    if (log.action === FINANCE_AUDIT.cancelled) {
      const reason = (log.changes as Record<string, unknown> | null)?.reason;
      if (typeof reason === "string") reasonBy.set(log.entityId, reason);
      continue;
    }
    const entry = readPayment(log);
    if (entry) paymentsBy.set(log.entityId, [...(paymentsBy.get(log.entityId) ?? []), entry]);
  }

  const rows = charges.map((charge) => {
    const amountCents = chargeCents(charge);
    const payments = paymentsBy.get(charge.id) ?? [];
    const stored = charge.status as ChargeStatus;
    const paidCents = paidCentsOf(stored, amountCents, sum(payments));
    const dueKey = dueDateKey(charge.dueDate);
    const row: ChargeRow = {
      id: charge.id,
      studentId: charge.studentId,
      studentName: charge.studentId ? charge.student?.name ?? "Estudiante no disponible" : "Cargo general",
      concept: charge.concept,
      periodId: charge.periodId,
      periodName: charge.period?.name ?? "",
      currency: charge.currency,
      amountCents,
      paidCents,
      balanceCents: stored === "CANCELLED" ? 0 : Math.max(0, amountCents - paidCents),
      dueKey,
      status: shownStatus(stored, dueKey, todayKey),
      cancelReason: stored === "CANCELLED" ? reasonBy.get(charge.id) ?? "" : "",
      payments,
    };
    // Cargo antiguo marcado como pagado sin pagos registrados: se cuenta en el mes de `paidAt`.
    const legacyPaidAt = stored === "PAID" && payments.length === 0 ? charge.paidAt : null;
    return { row, legacyPaidAt };
  });
  return rows;
}

function totals(rows: ChargeRow[]) {
  let owed = 0;
  let overdue = 0;
  let paid = 0;
  for (const row of rows) {
    owed += row.balanceCents;
    if (row.status === "OVERDUE") overdue += row.balanceCents;
    paid += row.status === "CANCELLED" ? row.payments.reduce((total, entry) => total + entry.amountCents, 0) : row.paidCents;
  }
  return { owed, overdue, paid };
}

/** Resumen y lista de cargos de la institución. Null si quien pide no gestiona cobros. */
export async function listCharges(actor: Actor, filters: ChargeFilters = {}, now = new Date()): Promise<ChargeList | null> {
  if (!(await canManageFinance(actor))) return null;
  const { currency, todayKey } = await institutionContext(actor.institutionId, now);
  const loaded = await loadRows(actor.institutionId, {}, todayKey, true);
  const rows = loaded.map((item) => item.row);

  const month = todayKey.slice(0, 7);
  let collected = 0;
  for (const { row, legacyPaidAt } of loaded) {
    for (const entry of row.payments) if (entry.paidOn.startsWith(month)) collected += entry.amountCents;
    if (legacyPaidAt && legacyPaidAt.toISOString().startsWith(month)) collected += row.amountCents;
  }
  const { owed, overdue } = totals(rows);

  const needle = plain((filters.query ?? "").trim());
  const matching = rows.filter(
    (row) =>
      (!needle || plain(row.studentName).includes(needle)) &&
      (!filters.status || row.status === filters.status) &&
      (!filters.periodId || row.periodId === filters.periodId),
  );
  return {
    currency,
    todayKey,
    summary: { receivableCents: owed, overdueCents: overdue, collectedThisMonthCents: collected },
    total: rows.length,
    matching: matching.length,
    charges: matching.slice(0, LIST_LIMIT),
  };
}

/** Períodos, grupos y cursos para los formularios. Null si quien pide no gestiona cobros. */
export async function listChargeOptions(actor: Actor): Promise<{ periods: Array<{ id: string; name: string }>; targets: ChargeTarget[] } | null> {
  if (!(await canManageFinance(actor))) return null;
  const institutionId = actor.institutionId;
  const activeStudent = { institutionId, role: "STUDENT" as const, status: "ACTIVE" as const };
  const [periods, groups, courses] = await Promise.all([
    db.academicPeriod.findMany({ where: { institutionId }, select: { id: true, name: true }, orderBy: { startDate: "desc" } }),
    db.studentGroup.findMany({
      where: { institutionId },
      select: { id: true, name: true, _count: { select: { members: { where: { institutionId, user: activeStudent } } } } },
      orderBy: { name: "asc" },
    }),
    db.course.findMany({
      where: { institutionId, archivedAt: null },
      select: { id: true, name: true, _count: { select: { enrollments: { where: { status: "ACTIVE", student: activeStudent } } } } },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    periods,
    targets: [
      ...groups.map((group) => ({ kind: "group" as const, id: group.id, name: group.name, students: group._count.members })),
      ...courses.map((course) => ({ kind: "course" as const, id: course.id, name: course.name, students: course._count.enrollments })),
    ],
  };
}

/** Estudiantes activos de la institución para el buscador de «Crear cargo». */
export async function searchChargeStudents(actor: Actor, query: string) {
  if (!(await canManageFinance(actor))) return null;
  const text = query.trim().slice(0, 80);
  const found = await db.user.findMany({
    where: {
      institutionId: actor.institutionId,
      role: "STUDENT",
      status: "ACTIVE",
      ...(text ? { OR: [{ name: { contains: text, mode: "insensitive" as const } }, { email: { contains: text, mode: "insensitive" as const } }] } : {}),
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
    take: 21,
  });
  return { students: found.slice(0, 20), more: found.length > 20 };
}

type ChargeFields = { concept: string; amountCents: number; dueDate: string; periodId?: string | null };

async function validFields(institutionId: string, input: ChargeFields) {
  const concept = input.concept.trim();
  if (concept.length < 2) return { ok: false, message: "Escribe el concepto del cargo, por ejemplo «Mensualidad de octubre»." } as const;
  if (concept.length > 160) return { ok: false, message: "El concepto es muy largo. Usa 160 letras o menos." } as const;
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) return { ok: false, message: "Escribe un monto mayor que cero, por ejemplo 3500.00." } as const;
  if (input.amountCents > MAX_CENTS) return { ok: false, message: "El monto es demasiado grande. Revísalo." } as const;
  const dueDate = dateKeyToStored(input.dueDate);
  if (!dueDate) return { ok: false, message: "Elige la fecha de vencimiento." } as const;
  let periodId: string | null = null;
  if (input.periodId) {
    const period = await db.academicPeriod.findFirst({ where: { id: input.periodId, institutionId }, select: { id: true } });
    if (!period) return { ok: false, message: "No encontramos ese período. Elige otro o déjalo vacío." } as const;
    periodId = period.id;
  }
  return { ok: true, concept, amountCents: input.amountCents, dueDate, periodId } as const;
}

/** Crea un cargo para un estudiante de la institución. */
export async function createCharge(actor: Actor, input: ChargeFields & { studentId: string }): Promise<FinanceResult & { chargeId?: string }> {
  if (!(await canManageFinance(actor))) return { ok: false, message: NO_PERMISSION };
  const institutionId = actor.institutionId;
  const fields = await validFields(institutionId, input);
  if (!fields.ok) return fields;
  const student = input.studentId
    ? await db.user.findFirst({ where: { id: input.studentId, institutionId, role: "STUDENT" }, select: { id: true } })
    : null;
  if (!student) return { ok: false, message: "Elige a un estudiante de la lista." };
  const { currency } = await institutionContext(institutionId, new Date());

  const chargeId = await db.$transaction(async (tx) => {
    const charge = await tx.paymentConcept.create({
      data: {
        institutionId,
        studentId: student.id,
        periodId: fields.periodId,
        concept: fields.concept,
        amount: centsToDecimal(fields.amountCents),
        amountCents: fields.amountCents,
        currency,
        dueDate: fields.dueDate,
        status: "PENDING",
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        institutionId,
        userId: actor.id,
        action: FINANCE_AUDIT.created,
        entity: ENTITY,
        entityId: charge.id,
        changes: { studentId: student.id, concept: fields.concept, amountCents: fields.amountCents, currency, dueDate: input.dueDate, periodId: fields.periodId },
      },
    });
    return charge.id;
  });
  await notifyChargeCreated(institutionId, { studentIds: [student.id], concept: fields.concept, amountCents: fields.amountCents, currency, dueDate: input.dueDate });
  return { ok: true, chargeId };
}

/**
 * Crea el mismo cargo para cada estudiante activo de un grupo o de un curso.
 * `operationKey` identifica la operación: repetirla (doble clic, reintento) no crea nada nuevo.
 */
export async function createGroupCharges(
  actor: Actor,
  input: ChargeFields & { target: { kind: string; id: string }; operationKey: string },
): Promise<GroupChargeResult> {
  if (!(await canManageFinance(actor))) return { ok: false, message: NO_PERMISSION };
  const institutionId = actor.institutionId;
  const key = input.operationKey;
  if (!/^[A-Za-z0-9-]{16,64}$/.test(key)) return { ok: false, message: "No se pudo confirmar la operación. Recarga la página e inténtalo de nuevo." };
  const fields = await validFields(institutionId, input);
  if (!fields.ok) return fields;

  const activeStudent = { institutionId, role: "STUDENT" as const, status: "ACTIVE" as const };
  let targetName: string;
  let studentIds: string[];
  if (input.target.kind === "group") {
    const group = await db.studentGroup.findFirst({ where: { id: input.target.id, institutionId }, select: { id: true, name: true } });
    if (!group) return { ok: false, message: "No encontramos ese grupo. Elige otro." };
    targetName = group.name;
    const members = await db.studentGroupMember.findMany({ where: { groupId: group.id, institutionId, user: activeStudent }, select: { userId: true } });
    studentIds = members.map((member) => member.userId);
  } else if (input.target.kind === "course") {
    const course = await db.course.findFirst({ where: { id: input.target.id, institutionId }, select: { id: true, name: true } });
    if (!course) return { ok: false, message: "No encontramos ese curso. Elige otro." };
    targetName = course.name;
    const enrollments = await db.enrollment.findMany({ where: { courseId: course.id, status: "ACTIVE", student: activeStudent }, select: { studentId: true } });
    studentIds = enrollments.map((enrollment) => enrollment.studentId);
  } else {
    return { ok: false, message: "Elige un grupo o un curso." };
  }
  studentIds = [...new Set(studentIds)];
  if (studentIds.length === 0) return { ok: false, message: `«${targetName}» no tiene estudiantes activos. No se creó ningún cargo.` };
  if (studentIds.length > MAX_GROUP) return { ok: false, message: `Son demasiados estudiantes para una sola operación (máximo ${MAX_GROUP}).` };
  const { currency } = await institutionContext(institutionId, new Date());

  return db.$transaction(async (tx) => {
    // Serializa las repeticiones de la misma operación: la segunda espera y encuentra el registro de la primera.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`finance-batch:${institutionId}:${key}`}))`;
    const previous = await tx.auditLog.findFirst({
      where: { institutionId, entity: BATCH_ENTITY, entityId: key, action: FINANCE_AUDIT.batch },
      select: { changes: true },
    });
    if (previous) {
      const data = (previous.changes ?? {}) as Record<string, unknown>;
      return {
        ok: true,
        created: 0,
        repeated: true,
        amountCents: typeof data.amountCents === "number" ? data.amountCents : fields.amountCents,
        currency: typeof data.currency === "string" ? data.currency : currency,
        targetName: typeof data.targetName === "string" ? data.targetName : targetName,
      } as const;
    }
    const rows = studentIds.map((studentId) => ({
      id: crypto.randomUUID(),
      institutionId,
      studentId,
      periodId: fields.periodId,
      concept: fields.concept,
      amount: centsToDecimal(fields.amountCents),
      amountCents: fields.amountCents,
      currency,
      dueDate: fields.dueDate,
      status: "PENDING" as const,
    }));
    await tx.paymentConcept.createMany({ data: rows });
    await tx.auditLog.create({
      data: {
        institutionId,
        userId: actor.id,
        action: FINANCE_AUDIT.batch,
        entity: BATCH_ENTITY,
        entityId: key,
        changes: {
          targetKind: input.target.kind,
          targetId: input.target.id,
          targetName,
          concept: fields.concept,
          amountCents: fields.amountCents,
          currency,
          dueDate: input.dueDate,
          periodId: fields.periodId,
          count: rows.length,
          chargeIds: rows.map((row) => row.id),
        },
      },
    });
    await notifyChargesWithinTransaction(tx, institutionId, { studentIds, concept: fields.concept, amountCents: fields.amountCents, currency, dueDate: input.dueDate });
    return { ok: true, created: rows.length, repeated: false, amountCents: fields.amountCents, currency, targetName } as const;
  }, rowLocked);
}

async function lockCharge(tx: Tx, institutionId: string, chargeId: string) {
  if (!chargeId) return null;
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "payment_concepts"
    WHERE "id" = ${chargeId} AND "institutionId" = ${institutionId}
    FOR UPDATE`;
  if (!locked[0]) return null;
  const charge = await tx.paymentConcept.findUnique({
    where: { id: chargeId },
    select: { id: true, studentId: true, concept: true, amount: true, amountCents: true, currency: true, dueDate: true, paidAt: true, status: true },
  });
  if (!charge) return null;
  const amountCents = chargeCents(charge);
  const payments = await recordedPayments(tx, institutionId, chargeId);
  const status = charge.status as ChargeStatus;
  return { ...charge, status, amountCents, payments, paidCents: paidCentsOf(status, amountCents, sum(payments)) };
}

/** Registra un pago: suma a lo pagado y deja el cargo con pago parcial o pagado. Nunca más de lo que se debe. */
export async function recordPayment(
  actor: Actor,
  input: { chargeId: string; amountCents: number; paidOn: string; method: string; note?: string },
  now = new Date(),
): Promise<FinanceResult> {
  if (!(await canManageFinance(actor))) return { ok: false, message: NO_PERMISSION };
  const institutionId = actor.institutionId;
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) return { ok: false, message: "Escribe un monto mayor que cero, por ejemplo 1500.00." };
  const paidDate = dateKeyToStored(input.paidOn);
  if (!paidDate) return { ok: false, message: "Elige la fecha en que se recibió el pago." };
  const { todayKey } = await institutionContext(institutionId, now);
  if (input.paidOn > todayKey) return { ok: false, message: "La fecha del pago no puede ser futura." };
  if (!PAYMENT_METHODS.includes(input.method as PaymentMethod)) return { ok: false, message: "Elige la forma de pago." };
  const note = (input.note ?? "").trim();
  if (note.length > 300) return { ok: false, message: "La nota es muy larga. Usa 300 letras o menos." };

  return db.$transaction(async (tx) => {
    const charge = await lockCharge(tx, institutionId, input.chargeId);
    if (!charge) return { ok: false, message: NOT_FOUND } as const;
    if (charge.status === "CANCELLED") return { ok: false, message: "Este cargo está anulado y no recibe pagos." } as const;
    const balance = charge.amountCents - charge.paidCents;
    if (balance <= 0) return { ok: false, message: "Este cargo ya está pagado por completo." } as const;
    if (input.amountCents > balance) {
      return { ok: false, message: `El pago no puede ser mayor que lo que se debe: ${formatMoney(balance, charge.currency)}.` } as const;
    }
    const paidCents = charge.paidCents + input.amountCents;
    const status = statusForPaid(charge.amountCents, paidCents);
    await tx.paymentConcept.update({ where: { id: charge.id }, data: { status, paidAt: status === "PAID" ? paidDate : null } });
    await tx.auditLog.create({
      data: {
        institutionId,
        userId: actor.id,
        action: FINANCE_AUDIT.payment,
        entity: ENTITY,
        entityId: charge.id,
        changes: { studentId: charge.studentId, amountCents: input.amountCents, paidOn: input.paidOn, method: input.method, note, paidCentsAfter: paidCents, statusAfter: status },
      },
    });
    return { ok: true } as const;
  }, rowLocked);
}

/** Cambia concepto, monto y vencimiento. El monto no puede quedar por debajo de lo ya pagado. */
export async function updateCharge(actor: Actor, input: ChargeFields & { chargeId: string }): Promise<FinanceResult> {
  if (!(await canManageFinance(actor))) return { ok: false, message: NO_PERMISSION };
  const institutionId = actor.institutionId;
  const fields = await validFields(institutionId, { ...input, periodId: null });
  if (!fields.ok) return fields;

  return db.$transaction(async (tx) => {
    const charge = await lockCharge(tx, institutionId, input.chargeId);
    if (!charge) return { ok: false, message: NOT_FOUND } as const;
    if (charge.status === "CANCELLED") return { ok: false, message: "Este cargo está anulado y ya no se puede cambiar." } as const;
    if (fields.amountCents < charge.paidCents) {
      return { ok: false, message: `El monto no puede ser menor que lo ya pagado: ${formatMoney(charge.paidCents, charge.currency)}.` } as const;
    }
    const status = statusForPaid(fields.amountCents, charge.paidCents);
    await tx.paymentConcept.update({
      where: { id: charge.id },
      data: {
        concept: fields.concept,
        amount: centsToDecimal(fields.amountCents),
        amountCents: fields.amountCents,
        dueDate: fields.dueDate,
        status,
        paidAt: status === "PAID" ? charge.paidAt ?? new Date() : null,
      },
    });
    await tx.auditLog.create({
      data: {
        institutionId,
        userId: actor.id,
        action: FINANCE_AUDIT.updated,
        entity: ENTITY,
        entityId: charge.id,
        changes: {
          before: { concept: charge.concept, amountCents: charge.amountCents, dueDate: dueDateKey(charge.dueDate) },
          after: { concept: fields.concept, amountCents: fields.amountCents, dueDate: input.dueDate },
        },
      },
    });
    return { ok: true } as const;
  }, rowLocked);
}

/** Anula un cargo con motivo. El cargo y sus pagos se conservan. */
export async function cancelCharge(actor: Actor, chargeId: string, reason: string): Promise<FinanceResult> {
  if (!(await canManageFinance(actor))) return { ok: false, message: NO_PERMISSION };
  const institutionId = actor.institutionId;
  const cleanReason = reason.trim();
  if (!cleanReason) return { ok: false, message: "Escribe el motivo de la anulación." };
  if (cleanReason.length > 300) return { ok: false, message: "El motivo es muy largo. Usa 300 letras o menos." };

  return db.$transaction(async (tx) => {
    const charge = await lockCharge(tx, institutionId, chargeId);
    if (!charge) return { ok: false, message: NOT_FOUND } as const;
    if (charge.status === "CANCELLED") return { ok: false, message: "Este cargo ya estaba anulado." } as const;
    await tx.paymentConcept.update({ where: { id: charge.id }, data: { status: "CANCELLED" } });
    await tx.auditLog.create({
      data: {
        institutionId,
        userId: actor.id,
        action: FINANCE_AUDIT.cancelled,
        entity: ENTITY,
        entityId: charge.id,
        changes: { studentId: charge.studentId, reason: cleanReason, statusBefore: charge.status, paidCents: charge.paidCents },
      },
    });
    return { ok: true } as const;
  }, rowLocked);
}

/** Borra un cargo solo si nunca recibió pagos. Con pagos, lo que corresponde es anularlo. */
export async function deleteCharge(actor: Actor, chargeId: string): Promise<FinanceResult> {
  if (!(await canManageFinance(actor))) return { ok: false, message: NO_PERMISSION };
  const institutionId = actor.institutionId;

  return db.$transaction(async (tx) => {
    const charge = await lockCharge(tx, institutionId, chargeId);
    if (!charge) return { ok: false, message: NOT_FOUND } as const;
    if (charge.paidCents > 0 || charge.payments.length > 0) {
      return { ok: false, message: "Este cargo tiene pagos registrados y no se puede borrar. Si ya no corresponde, anúlalo." } as const;
    }
    await tx.paymentConcept.delete({ where: { id: charge.id } });
    await tx.auditLog.create({
      data: {
        institutionId,
        userId: actor.id,
        action: FINANCE_AUDIT.deleted,
        entity: ENTITY,
        entityId: charge.id,
        changes: { studentId: charge.studentId, concept: charge.concept, amountCents: charge.amountCents, dueDate: dueDateKey(charge.dueDate), statusBefore: charge.status },
      },
    });
    return { ok: true } as const;
  }, rowLocked);
}

/**
 * Estudiantes cuya cuenta puede ver quien pregunta: el estudiante, la suya; el tutor, las de los hijos
 * cuyo vínculo activo permite ver finanzas (y solo si su rol conserva ese permiso).
 */
export async function accountStudentsFor(viewer: Actor): Promise<Array<{ id: string; name: string }>> {
  if (!viewer.id || !viewer.institutionId) return [];
  if (viewer.role === "STUDENT") {
    const self = await db.user.findFirst({ where: { id: viewer.id, institutionId: viewer.institutionId, role: "STUDENT" }, select: { id: true, name: true } });
    return self ? [self] : [];
  }
  if (viewer.role !== "PARENT") return [];
  const capabilities = await getEffectiveCapabilities(viewer.institutionId, viewer.role);
  const links = await db.guardianship.findMany({
    where: {
      institutionId: viewer.institutionId,
      parentId: viewer.id,
      status: "ACTIVE",
      canViewFinance: true,
      student: { institutionId: viewer.institutionId, role: "STUDENT", status: "ACTIVE" },
    },
    select: {
      id: true,
      institutionId: true,
      parentId: true,
      studentId: true,
      status: true,
      canViewAcademics: true,
      canViewAttendance: true,
      canViewSchedule: true,
      canViewAnnouncements: true,
      canViewFinance: true,
      student: { select: { id: true, name: true } },
    },
    orderBy: { student: { name: "asc" } },
  });
  return links.filter((link) => canViewGuardianArea(link as GuardianLink, capabilities, "finance")).map((link) => link.student);
}

/**
 * Estado de cuenta de un estudiante, solo lectura. Lo ven el propio estudiante, su tutor autorizado
 * y quien gestiona cobros. Null si quien pregunta no puede verlo.
 */
export async function getStudentAccount(viewer: Actor, studentId: string, now = new Date()): Promise<StudentAccount | null> {
  if (!studentId || !viewer.institutionId) return null;
  let student = (await accountStudentsFor(viewer)).find((candidate) => candidate.id === studentId) ?? null;
  if (!student && (await canManageFinance(viewer))) {
    student = await db.user.findFirst({ where: { id: studentId, institutionId: viewer.institutionId, role: "STUDENT" }, select: { id: true, name: true } });
  }
  if (!student) return null;
  const { currency, todayKey } = await institutionContext(viewer.institutionId, now);
  const rows = (await loadRows(viewer.institutionId, { studentId: student.id }, todayKey, false)).map((item) => item.row);
  // Un cargo anulado que nunca recibió pagos no le dice nada al estudiante.
  const charges = rows.filter((row) => row.status !== "CANCELLED" || row.payments.length > 0);
  const { owed, overdue, paid } = totals(charges);
  return { student, currency, owedCents: owed, overdueCents: overdue, paidCents: paid, charges };
}
