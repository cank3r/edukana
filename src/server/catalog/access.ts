import { getEffectiveCapabilities } from "@/lib/authorization";
import type { EdukanaRole } from "@/types/next-auth";

export type SalesActor = { id: string; institutionId: string; role: EdukanaRole };
export type SalesResult = { ok: true; message: string } | { ok: false; message: string };

export const NO_PERMISSION = "No tienes permiso para gestionar las ventas de cursos.";

/** Ventas, cupones y catálogo son de quien gestiona cobros en su institución. */
export async function canManageSales(actor: SalesActor) {
  if (!actor?.id || !actor.institutionId) return false;
  return (await getEffectiveCapabilities(actor.institutionId, actor.role)).has("finance.manage");
}
