"use server";

import { revalidatePath } from "next/cache";
import { actionFailure, formText, requireAcademicActor, type AcademicActionState } from "@/server/academic/guard";
import { createPeriod, deletePeriod, setCurrentPeriod, updatePeriod } from "@/server/academic/periods";

const periodInput = (formData: FormData) => ({
  name: formText(formData, "name"),
  startDate: formText(formData, "startDate"),
  endDate: formText(formData, "endDate"),
});

function refresh() {
  revalidatePath("/dashboard/configuracion/periodos");
  revalidatePath("/dashboard/configuracion");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/aula");
}

const quoted = (names: string[]) => names.map((name) => `«${name}»`).join(", ");
const overlapNote = (names: string[]) =>
  names.length ? ` Ojo: sus fechas se cruzan con ${quoted(names)}. Se guardó igual; revisa las fechas si no era tu intención.` : "";

/** Crea un período. Campos: `name`, `startDate`, `endDate` (AAAA-MM-DD). */
export async function createPeriodAction(_state: AcademicActionState, formData: FormData): Promise<AcademicActionState> {
  const guard = await requireAcademicActor("academic.structure.manage");
  if (guard.error !== null) return { ok: false, message: guard.error };
  try {
    const result = await createPeriod(guard.actor, periodInput(formData));
    if (!result.ok) return result;
    refresh();
    const current = result.isCurrent
      ? " Como es el primero, quedó marcado como período actual."
      : " El período actual no cambió; si quieres que sea este, usa «Marcar como período actual».";
    return { ok: true, message: `Período creado.${current}${overlapNote(result.overlapsWith)}`, id: result.periodId };
  } catch (error) {
    return actionFailure("createPeriodAction", error);
  }
}

/** Edita nombre y fechas. Campos: `periodId`, `name`, `startDate`, `endDate`. */
export async function updatePeriodAction(_state: AcademicActionState, formData: FormData): Promise<AcademicActionState> {
  const guard = await requireAcademicActor("academic.structure.manage");
  if (guard.error !== null) return { ok: false, message: guard.error };
  try {
    const result = await updatePeriod(guard.actor, formText(formData, "periodId"), periodInput(formData));
    if (!result.ok) return result;
    refresh();
    return { ok: true, message: `Cambios guardados.${overlapNote(result.overlapsWith)}` };
  } catch (error) {
    return actionFailure("updatePeriodAction", error);
  }
}

/** Marca un período como el actual; el que lo era deja de serlo. Campo: `periodId`. */
export async function setCurrentPeriodAction(_state: AcademicActionState, formData: FormData): Promise<AcademicActionState> {
  const guard = await requireAcademicActor("academic.structure.manage");
  if (guard.error !== null) return { ok: false, message: guard.error };
  try {
    const result = await setCurrentPeriod(guard.actor, formText(formData, "periodId"));
    if (!result.ok) return result;
    refresh();
    const replaced = result.replaced.length ? ` ${quoted(result.replaced)} dejó de serlo.` : "";
    return { ok: true, message: `«${result.name}» es ahora el período actual.${replaced}` };
  } catch (error) {
    return actionFailure("setCurrentPeriodAction", error);
  }
}

/** Borra un período sin cursos ni cobros. Campo: `periodId`. */
export async function deletePeriodAction(_state: AcademicActionState, formData: FormData): Promise<AcademicActionState> {
  const guard = await requireAcademicActor("academic.structure.manage");
  if (guard.error !== null) return { ok: false, message: guard.error };
  try {
    const result = await deletePeriod(guard.actor, formText(formData, "periodId"));
    if (!result.ok) return result;
    refresh();
    return { ok: true, message: `Período «${result.name}» borrado.${result.wasCurrent ? " Era el período actual: marca otro como actual." : ""}` };
  } catch (error) {
    return actionFailure("deletePeriodAction", error);
  }
}
