"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  cancelCharge,
  createCharge,
  createGroupCharges,
  deleteCharge,
  recordPayment,
  searchChargeStudents,
  updateCharge,
  voidPayment,
} from "@/server/finance/charges";
import { formatMoney, parseMoneyToCents } from "@/server/finance/money";
import type { EdukanaRole } from "@/types/next-auth";

export type FinanceState = { ok: boolean; message: string; receiptHref?: string };
export type ChargeStudentSearch = { ok: boolean; message: string; students: Array<{ id: string; name: string; email: string }>; more: boolean };

type Actor = { id: string; institutionId: string; role: EdukanaRole };
const SESSION_ENDED = "Tu sesión terminó. Vuelve a iniciar sesión.";
const BAD_AMOUNT = "Escribe el monto solo con números, por ejemplo 3500.00.";

// El permiso de gestionar cobros se comprueba en `src/server/finance/charges.ts` con cada operación.
async function currentActor(): Promise<Actor | null> {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return null;
  return { id: user.id, institutionId: user.institutionId, role: user.role };
}

function failure(name: string, error: unknown): FinanceState {
  const correlationId = crypto.randomUUID();
  console.error(`${name} failed`, { correlationId, error });
  return { ok: false, message: `No se pudo completar. Intenta de nuevo. Código: ${correlationId}` };
}

function refresh() {
  revalidatePath("/dashboard/pagos");
  revalidatePath("/dashboard/mi-cuenta");
  revalidatePath("/dashboard/portal");
}

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

/** Crea un cargo. Campos: `studentId`, `concept`, `amount`, `dueDate`, `periodId` (opcional). */
export async function createChargeAction(_state: FinanceState, formData: FormData): Promise<FinanceState> {
  const actor = await currentActor();
  if (!actor) return { ok: false, message: SESSION_ENDED };
  const amountCents = parseMoneyToCents(text(formData, "amount"));
  if (amountCents === null) return { ok: false, message: BAD_AMOUNT };
  try {
    const result = await createCharge(actor, {
      studentId: text(formData, "studentId"),
      concept: text(formData, "concept"),
      amountCents,
      dueDate: text(formData, "dueDate"),
      periodId: text(formData, "periodId") || null,
    });
    if (!result.ok) return result;
    refresh();
    return { ok: true, message: "Cargo creado." };
  } catch (error) {
    return failure("createChargeAction", error);
  }
}

/** Crea el mismo cargo para un grupo o curso. Campos: `target` («group:ID» o «course:ID»), `concept`, `amount`, `dueDate`, `periodId`, `operationKey`. */
export async function createGroupChargesAction(_state: FinanceState, formData: FormData): Promise<FinanceState> {
  const actor = await currentActor();
  if (!actor) return { ok: false, message: SESSION_ENDED };
  const amountCents = parseMoneyToCents(text(formData, "amount"));
  if (amountCents === null) return { ok: false, message: BAD_AMOUNT };
  const target = text(formData, "target");
  const separator = target.indexOf(":");
  try {
    const result = await createGroupCharges(actor, {
      target: { kind: target.slice(0, Math.max(0, separator)), id: target.slice(separator + 1) },
      concept: text(formData, "concept"),
      amountCents,
      dueDate: text(formData, "dueDate"),
      periodId: text(formData, "periodId") || null,
      operationKey: text(formData, "operationKey"),
    });
    if (!result.ok) return result;
    refresh();
    if (result.repeated) return { ok: true, message: `Estos cargos ya se habían creado para «${result.targetName}». No se duplicó ninguno.` };
    const amount = formatMoney(result.amountCents, result.currency);
    return { ok: true, message: result.created === 1 ? `Listo: se creó 1 cargo de ${amount} para «${result.targetName}».` : `Listo: se crearon ${result.created} cargos de ${amount} para «${result.targetName}».` };
  } catch (error) {
    return failure("createGroupChargesAction", error);
  }
}

/** Registra un pago. Campos: `chargeId`, `amount`, `paidOn`, `method`, `note`. */
export async function recordPaymentAction(_state: FinanceState, formData: FormData): Promise<FinanceState> {
  const actor = await currentActor();
  if (!actor) return { ok: false, message: SESSION_ENDED };
  const amountCents = parseMoneyToCents(text(formData, "amount"));
  if (amountCents === null) return { ok: false, message: BAD_AMOUNT };
  try {
    const result = await recordPayment(actor, {
      chargeId: text(formData, "chargeId"),
      amountCents,
      paidOn: text(formData, "paidOn"),
      method: text(formData, "method"),
      note: text(formData, "note"),
    });
    if (!result.ok) return result;
    refresh();
    return { ok: true, message: "Pago registrado.", receiptHref: `/dashboard/pagos/recibo/${encodeURIComponent(result.paymentId)}` };
  } catch (error) {
    return failure("recordPaymentAction", error);
  }
}

/** Anula un pago (no lo borra) y recalcula el cargo. Campos: `paymentId`, `reason`. */
export async function voidPaymentAction(_state: FinanceState, formData: FormData): Promise<FinanceState> {
  const actor = await currentActor();
  if (!actor) return { ok: false, message: SESSION_ENDED };
  try {
    const result = await voidPayment(actor, { paymentId: text(formData, "paymentId"), reason: text(formData, "reason") });
    if (!result.ok) return result;
    refresh();
    return { ok: true, message: "Pago anulado. Sigue en el historial y ya no cuenta como pagado." };
  } catch (error) {
    return failure("voidPaymentAction", error);
  }
}

/** Edita un cargo. Campos: `chargeId`, `concept`, `amount`, `dueDate`. */
export async function updateChargeAction(_state: FinanceState, formData: FormData): Promise<FinanceState> {
  const actor = await currentActor();
  if (!actor) return { ok: false, message: SESSION_ENDED };
  const amountCents = parseMoneyToCents(text(formData, "amount"));
  if (amountCents === null) return { ok: false, message: BAD_AMOUNT };
  try {
    const result = await updateCharge(actor, {
      chargeId: text(formData, "chargeId"),
      concept: text(formData, "concept"),
      amountCents,
      dueDate: text(formData, "dueDate"),
    });
    if (!result.ok) return result;
    refresh();
    return { ok: true, message: "Cargo actualizado." };
  } catch (error) {
    return failure("updateChargeAction", error);
  }
}

/** Anula un cargo. Campos: `chargeId`, `reason`. */
export async function cancelChargeAction(_state: FinanceState, formData: FormData): Promise<FinanceState> {
  const actor = await currentActor();
  if (!actor) return { ok: false, message: SESSION_ENDED };
  try {
    const result = await cancelCharge(actor, text(formData, "chargeId"), text(formData, "reason"));
    if (!result.ok) return result;
    refresh();
    return { ok: true, message: "Cargo anulado. Su historial se conserva." };
  } catch (error) {
    return failure("cancelChargeAction", error);
  }
}

/** Borra un cargo sin pagos. Campo: `chargeId`. */
export async function deleteChargeAction(_state: FinanceState, formData: FormData): Promise<FinanceState> {
  const actor = await currentActor();
  if (!actor) return { ok: false, message: SESSION_ENDED };
  try {
    const result = await deleteCharge(actor, text(formData, "chargeId"));
    if (!result.ok) return result;
    refresh();
    return { ok: true, message: "Cargo borrado." };
  } catch (error) {
    return failure("deleteChargeAction", error);
  }
}

/** Busca estudiantes activos para el formulario «Crear cargo». */
export async function searchChargeStudentsAction(query: string): Promise<ChargeStudentSearch> {
  const actor = await currentActor();
  if (!actor) return { ok: false, message: SESSION_ENDED, students: [], more: false };
  try {
    const result = await searchChargeStudents(actor, String(query ?? ""));
    if (!result) return { ok: false, message: "No tienes permiso para gestionar cobros.", students: [], more: false };
    return { ok: true, message: "", ...result };
  } catch (error) {
    return { ...failure("searchChargeStudentsAction", error), students: [], more: false };
  }
}
