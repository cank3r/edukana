"use server";

import { revalidatePath } from "next/cache";
import { actionFailure, formText, requireAcademicActor } from "@/server/academic/guard";
import { updateBrandColor } from "@/server/platform/branding";

export type BrandColorActionState = { ok: boolean; message: string; color?: string | null };

/**
 * Guarda el color principal de la institución en sesión. Campos: `brandColor`, o `reset` para volver
 * al color de Edukana (también vale `brandColor` vacío).
 */
export async function updateBrandColorAction(_state: BrandColorActionState, formData: FormData): Promise<BrandColorActionState> {
  const guard = await requireAcademicActor("tenant.settings.manage");
  if (guard.error !== null) return { ok: false, message: guard.error };
  try {
    const result = await updateBrandColor(guard.actor, formText(formData, "reset") ? "" : formText(formData, "brandColor"));
    if (!result.ok) return result;
    revalidatePath("/dashboard", "layout");
    return { ok: true, message: result.message, color: result.color };
  } catch (error) {
    return actionFailure("updateBrandColorAction", error);
  }
}
