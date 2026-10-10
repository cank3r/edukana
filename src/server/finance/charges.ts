import { Prisma } from "@prisma/client";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { canViewGuardianArea, type GuardianLink } from "@/lib/guardianship-policy";
import { zonedDateKey } from "@/lib/timezone";
import { deliverEmails, type EmailRequest } from "@/server/notifications";
import { notifyChargeCreated, notifyChargesWithinTransaction } from "@/server/notifications/events";
import type { EdukanaRole } from "@/types/next-auth";
import {
  amountInWords,
  centsToDecimal,
  chargeBalanceOf,
  chargeCents,
  dateKeyToStored,
  dueDateKey,
  formatMoney,
  institutionCurrency,
  receiptNumber,
  shownStatus,
  statusForPaid,
  MAX_CENTS,
  type ChargeStatus,
  type ShownStatus,
} from "./money";

/**
 * Cobros sin pasarela. Todo se calcula en centavos enteros.
 *
 * Cada pago es una fila de `Payment` (tabla `payments`). Lo pagado de un cargo es la suma de sus pagos
 * no anulados; el estado del cargo (PENDING, PARTIAL, PAID) y su `paidAt` se derivan de esa suma y se
 * guardan en la misma transacción que registra o anula el pago, con la fila del cargo bloqueada.
 * Un pago nunca se borra: se anula con motivo (`voidedAt`, `voidReason`) y deja de contar.
 *
 * Compatibilidad con pagos antiguos: antes de existir la tabla, cada pago se guardaba como una fila de
 * `AuditLog` (acción FINANCE_PAYMENT_RECORDED). Esas filas se leen SOLO como respaldo para los cargos
 * que no tienen ninguna fila en `payments`. La primera vez que un cargo así recibe un pago nuevo, sus
 * pagos antiguos se copian a `payments` en la misma transacción, y desde entonces solo cuenta la tabla.
 * Los pagos antiguos que aún no se copiaron se muestran sin recibo y no se pueden anular.
 */

type Actor = { id: string; institutionId: string; role: EdukanaRole };
type Tx = Prisma.TransactionClient;

export type PaymentMethod = "CASH" | "TRANSFER" | "CARD" | "OTHER";
export const PAYMENT_METHODS: readonly PaymentMethod[] = ["CASH", "TRANSFER", "CARD", "OTHER"];

export type PaymentEntry = {
  id: string;
  amountCents: number;
  /** Día del pago, `AAAA-MM-DD`. */
  paidOn: string;
  method: PaymentMethod;
  note: string;
  recordedByName: string;
  /** Pago anulado: deja de contar, pero se conserva en el historial. */
  voided: { at: string; reason: string } | null;
  /** Pago antiguo leído del registro de auditoría: no tiene recibo y no se puede anular. */
  legacy: boolean;
};
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
/** Vista de la lista de Cobros. «Por cobrar» incluye lo vencido. */
export type ChargeView = "vencidos" | "por-cobrar" | "pagados" | "todos";
export const CHARGE_VIEWS: readonly ChargeView[] = ["vencidos", "por-cobrar", "pagados", "todos"];
export const CHARGE_PAGE_SIZE = 50;
export type ChargeFilters = {
  query?: string;
  /** Sin vista se listan todos los cargos (lo que se debe primero). */
  view?: ChargeView;
  /** Compatibilidad: un estado que se muestra (OVERDUE, PAID…) se traduce a su vista. */
  status?: string;
  periodId?: string;
  /** Página desde 1, de `CHARGE_PAGE_SIZE` cargos. */
  page?: number;
};
export type ChargeList = {
  currency: string;
  todayKey: string;
  summary: FinanceSummary;
  /** Todos los cargos de la institución. */
  total: number;
  /** Cargos que cumplen la búsqueda, el período y la vista. */
  matching: number;
  /** Cuántos cargos hay en cada vista con la búsqueda y el período actuales. */
  counts: Record<ChargeView, number>;
  view: ChargeView;
  page: number;
  pageSize: number;
  pages: number;
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
export type PaymentResult = { ok: true; paymentId: string } | { ok: false; message: string };
/** Saldo de un cargo según sus pagos reales. Lo comparten cobros, portal, familia y reportes. */
export type ChargeBalance = {
  conceptId: string;
  studentId: string | null;
  currency: string;
  amountCents: number;
  paidCents: number;
  balanceCents: number;
  /** Estado derivado de lo pagado (PENDING, PARTIAL, PAID o CANCELLED; OVERDUE solo si así quedó guardado). */
  status: ChargeStatus;
  /** Estado que se muestra hoy en la zona de la institución (vencido si pasó la fecha). */
  shownStatus: ShownStatus;
  dueKey: string | null;
  /** Dinero recibido por día (`AAAA-MM-DD`), sin pagos anulados. */
  received: Array<{ paidOn: string; amountCents: number }>;
};
export type PaymentReceipt = {
  id: string;
  number: string;
  institution: { name: string };
  student: { id: string; name: string };
  concept: string;
  periodName: string;
  currency: string;
  amountCents: number;
  amountWords: string;
  method: PaymentMethod;
  paidOn: string;
  note: string;
  recordedByName: string;
  /** Día en que se registró, en la zona de la institución. */
  recordedOn: string;
  voided: { on: string; reason: string } | null;
};
export type GroupChargeResult =
  | { ok: true; created: number; repeated: boolean; amountCents: number; currency: string; targetName: string }
  | { ok: false; message: string };

export const FINANCE_AUDIT = {
  created: "FINANCE_CHARGE_CREATED",
  batch: "FINANCE_GROUP_CHARGES_CREATED",
  payment: "FINANCE_PAYMENT_RECORDED",
  voided: "FINANCE_PAYMENT_VOIDED",
  updated: "FINANCE_CHARGE_UPDATED",
  cancelled: "FINANCE_CHARGE_CANCELLED",
  deleted: "FINANCE_CHARGE_DELETED",
} as const;

const ENTITY = "PaymentConcept";
const PAYMENT_ENTITY = "Payment";
const BATCH_ENTITY = "PaymentBatch";
const MAX_GROUP = 1000;
const NO_PERMISSION = "No tienes permiso para gestionar cobros.";
const NOT_FOUND = "No encontramos ese cargo. Puede que alguien lo haya borrado; recarga la página.";
const PAYMENT_NOT_FOUND = "No encontramos ese pago. Recarga la página e inténtalo de nuevo.";
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

const CHUNK = 5000;
const dayKey = (date: Date) => date.toISOString().slice(0, 10);

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += CHUNK) out.push(items.slice(index, index + CHUNK));
  return out;
}

/** Pago antiguo guardado en `AuditLog` (antes de existir la tabla `payments`). */
function readLegacyPayment(log: { id: string; changes: Prisma.JsonValue | null }): PaymentEntry | null {
  const data = log.changes && typeof log.changes === "object" && !Array.isArray(log.changes) ? (log.changes as Record<string, unknown>) : null;
  if (!data) return null;
  const amountCents = data.amountCents;
  if (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents <= 0) return null;
  const method = PAYMENT_METHODS.includes(data.method as PaymentMethod) ? (data.method as PaymentMethod) : "OTHER";
  return {
    id: log.id,
    amountCents,
    paidOn: typeof data.paidOn === "string" ? data.paidOn : "",
    method,
    note: typeof data.note === "string" ? data.note : "",
    recordedByName: "",
    voided: null,
    legacy: true,
  };
}

const sum = (entries: Array<{ amountCents: number }>) => entries.reduce((total, entry) => total + entry.amountCents, 0);
const active = (entries: PaymentEntry[]) => entries.filter((entry) => !entry.voided);

type LoadedPayments = { entries: PaymentEntry[]; fromTable: boolean };

/**
 * Pagos de los cargos indicados (o de toda la institución con `conceptIds = null`), del más antiguo al
 * más nuevo, incluidos los anulados. Los cargos sin ninguna fila en `payments` toman sus pagos antiguos
 * del registro de auditoría (compatibilidad; ver el comentario al inicio del archivo).
 */
async function loadPayments(client: Tx | typeof db, institutionId: string, conceptIds: string[] | null): Promise<Map<string, LoadedPayments>> {
  const byConcept = new Map<string, LoadedPayments>();
  for (const ids of conceptIds === null ? [null] : chunks(conceptIds)) {
    const rows = await client.payment.findMany({
      where: { institutionId, ...(ids ? { conceptId: { in: ids } } : {}) },
      select: { id: true, conceptId: true, amountCents: true, method: true, paidOn: true, note: true, voidedAt: true, voidReason: true, recordedBy: { select: { name: true } } },
      orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
    });
    for (const row of rows) {
      const entry: PaymentEntry = {
        id: row.id,
        amountCents: row.amountCents,
        paidOn: dayKey(row.paidOn),
        method: PAYMENT_METHODS.includes(row.method as PaymentMethod) ? (row.method as PaymentMethod) : "OTHER",
        note: row.note ?? "",
        recordedByName: row.recordedBy.name,
        voided: row.voidedAt ? { at: row.voidedAt.toISOString(), reason: row.voidReason ?? "" } : null,
        legacy: false,
      };
      const current = byConcept.get(row.conceptId);
      if (current) current.entries.push(entry);
      else byConcept.set(row.conceptId, { entries: [entry], fromTable: true });
    }
  }

  const missing = conceptIds === null ? null : conceptIds.filter((id) => !byConcept.has(id));
  for (const ids of missing === null ? [null] : chunks(missing)) {
    const logs = await client.auditLog.findMany({
      where: { institutionId, entity: ENTITY, action: FINANCE_AUDIT.payment, ...(ids ? { entityId: { in: ids } } : {}) },
      select: { id: true, entityId: true, changes: true },
      orderBy: { createdAt: "asc" },
    });
    for (const log of logs) {
      if (!log.entityId) continue;
      const current = byConcept.get(log.entityId);
      if (current?.fromTable) continue; // Con filas en la tabla, los registros antiguos ya no cuentan.
      const entry = readLegacyPayment(log);
      if (!entry) continue;
      if (current) current.entries.push(entry);
      else byConcept.set(log.entityId, { entries: [entry], fromTable: false });
    }
  }
  return byConcept;
}

type BalanceSource = {
  id: string;
  studentId: string | null;
  amount: number;
  amountCents: number | null;
  currency: string;
  dueDate: Date | null;
  paidAt: Date | null;
  status: string;
};
const BALANCE_SELECT = { id: true, studentId: true, amount: true, amountCents: true, currency: true, dueDate: true, paidAt: true, status: true } as const;

function balanceOf(charge: BalanceSource, loaded: LoadedPayments | undefined, todayKey: string): ChargeBalance {
  const amountCents = chargeCents(charge);
  const current = active(loaded?.entries ?? []);
  const activeCents = sum(current);
  const { paidCents, balanceCents, status } = chargeBalanceOf(charge.status as ChargeStatus, amountCents, activeCents, loaded?.fromTable ?? false);
  const received = current.map((entry) => ({ paidOn: entry.paidOn, amountCents: entry.amountCents }));
  // Cargo antiguo guardado como pagado sin todos sus pagos registrados: la diferencia cuenta el día de `paidAt`.
  if (paidCents > activeCents && charge.paidAt) received.push({ paidOn: dayKey(charge.paidAt), amountCents: paidCents - activeCents });
  const dueKey = dueDateKey(charge.dueDate);
  return {
    conceptId: charge.id,
    studentId: charge.studentId,
    currency: charge.currency,
    amountCents,
    paidCents,
    balanceCents,
    status,
    shownStatus: shownStatus(status, dueKey, todayKey),
    dueKey,
    received,
  };
}

/**
 * Saldo real de cada cargo pedido, según sus pagos no anulados. Solo devuelve cargos de la institución
 * indicada (un id ajeno simplemente no aparece).
 *
 * Es la función compartida para leer lo pagado: la usan el portal del estudiante, el estado de cuenta del
 * hijo y los reportes, en vez del estado guardado o del decimal antiguo. Consultas: 4 (más una por cada
 * 5000 cargos).
 */
export async function chargeBalances(institutionId: string, conceptIds: readonly string[], now = new Date()): Promise<Map<string, ChargeBalance>> {
  const ids = [...new Set(conceptIds.filter(Boolean))];
  if (!institutionId || ids.length === 0) return new Map();
  const charges: BalanceSource[] = [];
  for (const part of chunks(ids)) {
    charges.push(...(await db.paymentConcept.findMany({ where: { institutionId, id: { in: part } }, select: BALANCE_SELECT })));
  }
  if (charges.length === 0) return new Map();
  const [{ todayKey }, payments] = await Promise.all([
    institutionContext(institutionId, now),
    loadPayments(db, institutionId, charges.map((charge) => charge.id)),
  ]);
  return new Map(charges.map((charge) => [charge.id, balanceOf(charge, payments.get(charge.id), todayKey)]));
}

/** Cargos con lo pagado y el estado que se muestra. `where` ya debe traer la institución. */
async function loadRows(institutionId: string, where: Prisma.PaymentConceptWhereInput, todayKey: string, wholeInstitution: boolean) {
  const charges = await db.paymentConcept.findMany({
    where: { AND: [{ institutionId }, where] },
    select: { ...BALANCE_SELECT, periodId: true, concept: true, student: { select: { name: true } }, period: { select: { name: true } } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });
  if (charges.length === 0) return [];
  const ids = charges.map((charge) => charge.id);
  const [payments, cancellations] = await Promise.all([
    loadPayments(db, institutionId, wholeInstitution ? null : ids),
    db.auditLog.findMany({
      where: { institutionId, entity: ENTITY, action: FINANCE_AUDIT.cancelled, ...(wholeInstitution ? {} : { entityId: { in: ids } }) },
      select: { entityId: true, changes: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const reasonBy = new Map<string, string>();
  for (const log of cancellations) {
    const reason = (log.changes as Record<string, unknown> | null)?.reason;
    if (log.entityId && typeof reason === "string") reasonBy.set(log.entityId, reason);
  }

  return charges.map((charge) => {
    const loaded = payments.get(charge.id);
    const balance = balanceOf(charge, loaded, todayKey);
    const row: ChargeRow = {
      id: charge.id,
      studentId: charge.studentId,
      studentName: charge.studentId ? charge.student?.name ?? "Estudiante no disponible" : "Cargo general",
      concept: charge.concept,
      periodId: charge.periodId,
      periodName: charge.period?.name ?? "",
      currency: charge.currency,
      amountCents: balance.amountCents,
      paidCents: balance.paidCents,
      balanceCents: balance.balanceCents,
      dueKey: balance.dueKey,
      status: balance.shownStatus,
      cancelReason: balance.status === "CANCELLED" ? reasonBy.get(charge.id) ?? "" : "",
      payments: loaded?.entries ?? [],
    };
    return { row, balance };
  });
}

function totals(rows: ChargeRow[]) {
  let owed = 0;
  let overdue = 0;
  let paid = 0;
  for (const row of rows) {
    owed += row.balanceCents;
    if (row.status === "OVERDUE") overdue += row.balanceCents;
    paid += row.paidCents;
  }
  return { owed, overdue, paid };
}

/**
 * Resumen de cobros de toda la institución: por cobrar (incluye lo vencido), vencido y cobrado en el mes
 * de hoy. Sale de `chargeBalances`, la misma función del tablero de la dirección, el portal y los
 * reportes, para que todas las pantallas den la misma cifra.
 */
async function financeSummary(institutionId: string, todayKey: string, now: Date): Promise<FinanceSummary> {
  const ids = await db.paymentConcept.findMany({ where: { institutionId }, select: { id: true } });
  const balances = await chargeBalances(institutionId, ids.map((row) => row.id), now);
  const month = todayKey.slice(0, 7);
  const summary: FinanceSummary = { receivableCents: 0, overdueCents: 0, collectedThisMonthCents: 0 };
  for (const balance of balances.values()) {
    // «Cobrado este mes»: pagos no anulados cuyo día de pago cae en el mes de hoy.
    for (const entry of balance.received) if (entry.paidOn.startsWith(month)) summary.collectedThisMonthCents += entry.amountCents;
    if (balance.status === "CANCELLED") continue;
    summary.receivableCents += balance.balanceCents;
    if (balance.shownStatus === "OVERDUE") summary.overdueCents += balance.balanceCents;
  }
  return summary;
}

type Bucket = { where: Prisma.PaymentConceptWhereInput; orderBy: Prisma.PaymentConceptOrderByWithRelationInput[] };

/**
 * Grupos de la lista, en el orden en que se muestran: vencido (el más antiguo primero), por vencer (el más
 * próximo primero), pagado (el más reciente primero) y anulado. Se filtran en la base con el estado guardado
 * (que registrar y anular pagos mantienen al día) y la fecha de vencimiento: un cargo abierto cuyo día de
 * vencimiento es anterior a hoy (`AAAA-MM-DD` en la zona de la institución) está vencido, igual que en `shownStatus`.
 */
function buckets(todayKey: string): Record<"overdue" | "upcoming" | "paid" | "cancelled", Bucket> {
  // Las fechas de vencimiento se leen en UTC: antes de la medianoche UTC de hoy es un día anterior.
  const todayStart = new Date(`${todayKey}T00:00:00.000Z`);
  const open = { status: { in: ["PENDING", "PARTIAL", "OVERDUE"] as ChargeStatus[] } };
  const tie: Prisma.PaymentConceptOrderByWithRelationInput[] = [{ createdAt: "desc" }, { id: "asc" }];
  return {
    overdue: {
      where: { AND: [open, { OR: [{ status: "OVERDUE" }, { dueDate: { lt: todayStart } }] }] },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, ...tie],
    },
    upcoming: {
      where: { status: { in: ["PENDING", "PARTIAL"] }, OR: [{ dueDate: null }, { dueDate: { gte: todayStart } }] },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, ...tie],
    },
    paid: { where: { status: "PAID" }, orderBy: [{ paidAt: { sort: "desc", nulls: "last" } }, ...tie] },
    cancelled: { where: { status: "CANCELLED" }, orderBy: tie },
  };
}

const VIEW_BUCKETS: Record<ChargeView, Array<keyof ReturnType<typeof buckets>>> = {
  vencidos: ["overdue"],
  "por-cobrar": ["overdue", "upcoming"],
  pagados: ["paid"],
  todos: ["overdue", "upcoming", "paid", "cancelled"],
};
const STATUS_VIEW: Record<string, ChargeView> = { OVERDUE: "vencidos", PENDING: "por-cobrar", PARTIAL: "por-cobrar", PAID: "pagados" };

/** Condición de búsqueda por estudiante (sin distinguir mayúsculas ni tildes) y período. */
async function searchWhere(institutionId: string, filters: ChargeFilters): Promise<Prisma.PaymentConceptWhereInput> {
  const and: Prisma.PaymentConceptWhereInput[] = [];
  if (filters.periodId) and.push({ periodId: filters.periodId });
  const needle = plain((filters.query ?? "").trim().slice(0, 80));
  if (needle) {
    // Solo los estudiantes con cargos en esta institución (uno por persona), no los cargos.
    const students = await db.paymentConcept.findMany({
      where: { institutionId, studentId: { not: null } },
      distinct: ["studentId"],
      select: { studentId: true, student: { select: { name: true } } },
    });
    const ids = students.filter((row) => row.studentId && plain(row.student?.name ?? "").includes(needle)).map((row) => row.studentId as string);
    const general = plain("Cargo general").includes(needle);
    and.push({ OR: [{ studentId: { in: ids } }, ...(general ? [{ studentId: null }] : [])] });
  }
  return { AND: and };
}

/**
 * Resumen y una página de cargos de la institución. Null si quien pide no gestiona cobros.
 *
 * La lista se pagina en la base (`CHARGE_PAGE_SIZE` por página): solo los cargos de la página se leen
 * con su estudiante, sus pagos y su anulación. Primero lo que se debe (vencido y luego por vencer), después
 * lo pagado y al final lo anulado.
 */
export async function listCharges(actor: Actor, filters: ChargeFilters = {}, now = new Date()): Promise<ChargeList | null> {
  if (!(await canManageFinance(actor))) return null;
  const institutionId = actor.institutionId;
  const { currency, todayKey } = await institutionContext(institutionId, now);
  const view: ChargeView = filters.view && CHARGE_VIEWS.includes(filters.view)
    ? filters.view
    : (filters.status && STATUS_VIEW[filters.status]) || "todos";
  const groups = buckets(todayKey);
  const base = await searchWhere(institutionId, filters);
  const scoped = (where: Prisma.PaymentConceptWhereInput) => ({ AND: [{ institutionId }, base, where] });

  const [summary, total, overdue, upcoming, paid, cancelled] = await Promise.all([
    financeSummary(institutionId, todayKey, now),
    db.paymentConcept.count({ where: { institutionId } }),
    db.paymentConcept.count({ where: scoped(groups.overdue.where) }),
    db.paymentConcept.count({ where: scoped(groups.upcoming.where) }),
    db.paymentConcept.count({ where: scoped(groups.paid.where) }),
    db.paymentConcept.count({ where: scoped(groups.cancelled.where) }),
  ]);
  const sizes = { overdue, upcoming, paid, cancelled };
  const counts: Record<ChargeView, number> = {
    vencidos: overdue,
    "por-cobrar": overdue + upcoming,
    pagados: paid,
    todos: overdue + upcoming + paid + cancelled,
  };
  const matching = counts[view];
  const pages = Math.max(1, Math.ceil(matching / CHARGE_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(filters.page ?? 1) || 1), pages);

  // Recorre los grupos de la vista en orden y toma la parte de cada uno que cae en la página.
  let skip = (page - 1) * CHARGE_PAGE_SIZE;
  let take = CHARGE_PAGE_SIZE;
  const pageIds: string[] = [];
  for (const key of VIEW_BUCKETS[view]) {
    if (take <= 0) break;
    if (skip >= sizes[key]) { skip -= sizes[key]; continue; }
    const rows = await db.paymentConcept.findMany({ where: scoped(groups[key].where), orderBy: groups[key].orderBy, skip, take, select: { id: true } });
    pageIds.push(...rows.map((row) => row.id));
    take -= rows.length;
    skip = 0;
  }

  const loaded = pageIds.length ? await loadRows(institutionId, { id: { in: pageIds } }, todayKey, false) : [];
  const byId = new Map(loaded.map((item) => [item.row.id, item.row]));
  const charges = pageIds.map((id) => byId.get(id)).filter((row): row is ChargeRow => Boolean(row));
  return { currency, todayKey, summary, total, matching, counts, view, page, pageSize: CHARGE_PAGE_SIZE, pages, charges };
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

  // El correo sale solo después de confirmar la transacción (si se deshace, no se envía nada).
  const pending: { email: EmailRequest | null } = { email: null };
  const result = await db.$transaction(async (tx) => {
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
    pending.email = await notifyChargesWithinTransaction(tx, institutionId, { studentIds, concept: fields.concept, amountCents: fields.amountCents, currency, dueDate: input.dueDate });
    return { ok: true, created: rows.length, repeated: false, amountCents: fields.amountCents, currency, targetName } as const;
  }, rowLocked);
  await deliverEmails(pending.email);
  return result;
}

/** Bloquea la fila del cargo (FOR UPDATE) y lee sus pagos con la fila ya bloqueada. */
async function lockCharge(tx: Tx, institutionId: string, chargeId: string) {
  if (!chargeId) return null;
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "payment_concepts"
    WHERE "id" = ${chargeId} AND "institutionId" = ${institutionId}
    FOR UPDATE`;
  if (!locked[0]) return null;
  const charge = await tx.paymentConcept.findUnique({
    where: { id: chargeId },
    select: { ...BALANCE_SELECT, concept: true },
  });
  if (!charge) return null;
  const loaded = (await loadPayments(tx, institutionId, [chargeId])).get(chargeId);
  const balance = balanceOf(charge, loaded, "");
  return {
    ...charge,
    status: charge.status as ChargeStatus,
    amountCents: balance.amountCents,
    paidCents: balance.paidCents,
    payments: loaded?.entries ?? [],
    fromTable: loaded?.fromTable ?? false,
  };
}

/**
 * Copia a `payments` los pagos antiguos (registro de auditoría) de un cargo que aún no tiene filas, para
 * que el pago nuevo no los deje de contar. Si quien registró el pago antiguo ya no existe, se atribuye a
 * quien hace la copia y la nota lo dice.
 */
async function copyLegacyPayments(tx: Tx, institutionId: string, conceptId: string, actorId: string) {
  const logs = await tx.auditLog.findMany({
    where: { institutionId, entity: ENTITY, entityId: conceptId, action: FINANCE_AUDIT.payment },
    select: { id: true, userId: true, changes: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const userIds = [...new Set(logs.map((log) => log.userId).filter((id): id is string => Boolean(id)))];
  const known = new Set(
    (await tx.user.findMany({ where: { id: { in: userIds }, institutionId }, select: { id: true } })).map((user) => user.id),
  );
  const data = logs.flatMap((log) => {
    const entry = readLegacyPayment(log);
    if (!entry) return [];
    const recorder = log.userId && known.has(log.userId) ? log.userId : null;
    const note = [entry.note, recorder ? "" : "Pago anterior copiado al historial nuevo."].filter(Boolean).join(" · ");
    return [{
      institutionId,
      conceptId,
      amountCents: entry.amountCents,
      method: entry.method,
      paidOn: dateKeyToStored(entry.paidOn) ?? log.createdAt,
      note: note || null,
      recordedById: recorder ?? actorId,
      createdAt: log.createdAt,
    }];
  });
  if (data.length) await tx.payment.createMany({ data });
}

/** Registra un pago: suma a lo pagado y deja el cargo con pago parcial o pagado. Nunca más de lo que se debe. */
export async function recordPayment(
  actor: Actor,
  input: { chargeId: string; amountCents: number; paidOn: string; method: string; note?: string },
  now = new Date(),
): Promise<PaymentResult> {
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
    if (!charge.fromTable && charge.payments.length > 0) await copyLegacyPayments(tx, institutionId, charge.id, actor.id);
    const payment = await tx.payment.create({
      data: { institutionId, conceptId: charge.id, amountCents: input.amountCents, method: input.method, paidOn: paidDate, note: note || null, recordedById: actor.id },
      select: { id: true },
    });
    const after = chargeBalanceOf(charge.status, charge.amountCents, charge.paidCents + input.amountCents, true);
    await tx.paymentConcept.update({ where: { id: charge.id }, data: { status: after.status, paidAt: after.status === "PAID" ? paidDate : null } });
    await tx.auditLog.create({
      data: {
        institutionId,
        userId: actor.id,
        action: FINANCE_AUDIT.payment,
        entity: PAYMENT_ENTITY,
        entityId: payment.id,
        changes: { conceptId: charge.id, studentId: charge.studentId, amountCents: input.amountCents, paidOn: input.paidOn, method: input.method, note, paidCentsAfter: after.paidCents, statusAfter: after.status },
      },
    });
    return { ok: true, paymentId: payment.id } as const;
  }, rowLocked);
}

/**
 * Anula un pago con motivo: deja de contar y el cargo se recalcula en la misma transacción. El pago no se
 * borra; sigue en el historial y su recibo queda marcado como anulado.
 */
export async function voidPayment(actor: Actor, input: { paymentId: string; reason: string }, now = new Date()): Promise<FinanceResult> {
  if (!(await canManageFinance(actor))) return { ok: false, message: NO_PERMISSION };
  const institutionId = actor.institutionId;
  const reason = input.reason.trim();
  if (!reason) return { ok: false, message: "Escribe el motivo por el que se anula el pago." };
  if (reason.length > 300) return { ok: false, message: "El motivo es muy largo. Usa 300 letras o menos." };
  const target = input.paymentId
    ? await db.payment.findFirst({ where: { id: input.paymentId, institutionId }, select: { conceptId: true } })
    : null;
  if (!target) return { ok: false, message: PAYMENT_NOT_FOUND };

  return db.$transaction(async (tx) => {
    const charge = await lockCharge(tx, institutionId, target.conceptId);
    if (!charge) return { ok: false, message: NOT_FOUND } as const;
    const payment = charge.payments.find((entry) => entry.id === input.paymentId && !entry.legacy);
    if (!payment) return { ok: false, message: PAYMENT_NOT_FOUND } as const;
    if (payment.voided) return { ok: false, message: "Este pago ya estaba anulado." } as const;
    await tx.payment.update({ where: { id: payment.id }, data: { voidedAt: now, voidReason: reason } });
    const stillPaid = sum(active(charge.payments)) - payment.amountCents;
    const after = chargeBalanceOf(charge.status, charge.amountCents, stillPaid, true);
    if (charge.status !== "CANCELLED") {
      await tx.paymentConcept.update({ where: { id: charge.id }, data: { status: after.status, paidAt: after.status === "PAID" ? charge.paidAt : null } });
    }
    await tx.auditLog.create({
      data: {
        institutionId,
        userId: actor.id,
        action: FINANCE_AUDIT.voided,
        entity: PAYMENT_ENTITY,
        entityId: payment.id,
        changes: { conceptId: charge.id, studentId: charge.studentId, amountCents: payment.amountCents, paidOn: payment.paidOn, reason, paidCentsAfter: after.paidCents, statusAfter: after.status },
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

/**
 * Recibo de un pago, solo lectura. Lo ve quien gestiona cobros en la institución, el estudiante dueño
 * del cargo y su tutor con permiso de finanzas y vínculo activo. Null en cualquier otro caso (incluido
 * un pago de otra institución), sin decir si existe.
 */
export async function getPaymentReceipt(viewer: Actor, paymentId: string): Promise<PaymentReceipt | null> {
  if (!paymentId || !viewer.id || !viewer.institutionId) return null;
  const payment = await db.payment.findFirst({
    where: { id: paymentId, institutionId: viewer.institutionId },
    select: {
      id: true,
      amountCents: true,
      method: true,
      paidOn: true,
      note: true,
      createdAt: true,
      voidedAt: true,
      voidReason: true,
      recordedBy: { select: { name: true } },
      institution: { select: { name: true, timezone: true } },
      concept: { select: { concept: true, currency: true, studentId: true, student: { select: { id: true, name: true } }, period: { select: { name: true } } } },
    },
  });
  if (!payment) return null;
  const studentId = payment.concept.studentId;
  const allowed =
    (await canManageFinance(viewer)) ||
    (studentId !== null && (await accountStudentsFor(viewer)).some((student) => student.id === studentId));
  if (!allowed) return null;

  const localDay = (instant: Date) => {
    try {
      return zonedDateKey(instant, payment.institution.timezone || "America/Santo_Domingo");
    } catch {
      return zonedDateKey(instant, "America/Santo_Domingo");
    }
  };
  const currency = payment.concept.currency;
  return {
    id: payment.id,
    number: receiptNumber(payment.id),
    institution: { name: payment.institution.name },
    student: { id: payment.concept.student?.id ?? "", name: payment.concept.student?.name ?? "Cargo general" },
    concept: payment.concept.concept,
    periodName: payment.concept.period?.name ?? "",
    currency,
    amountCents: payment.amountCents,
    amountWords: amountInWords(payment.amountCents, currency),
    method: PAYMENT_METHODS.includes(payment.method as PaymentMethod) ? (payment.method as PaymentMethod) : "OTHER",
    paidOn: dayKey(payment.paidOn),
    note: payment.note ?? "",
    recordedByName: payment.recordedBy.name,
    recordedOn: localDay(payment.createdAt),
    voided: payment.voidedAt ? { on: localDay(payment.voidedAt), reason: payment.voidReason ?? "" } : null,
  };
}
