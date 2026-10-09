"use server";

import { revalidatePath } from "next/cache";
import { actionFailure, formText, requireAcademicActor, type AcademicActionState } from "@/server/academic/guard";
import { updateInstitutionSettings } from "@/server/platform/institution-settings";

/** Guarda los datos de la institución de quien está en sesión. Campos: `name`, `type`, `timezone`, `language`. */
export async function updateInstitutionSettingsAction(_state: AcademicActionState, formData: FormData): Promise<AcademicActionState> {
  const guard = await requireAcademicActor("tenant.settings.manage");
  if (guard.error !== null) return { ok: false, message: guard.error };
  try {
    const result = await updateInstitutionSettings(guard.actor, {
      name: formText(formData, "name"),
      type: formText(formData, "type"),
      timezone: formText(formData, "timezone"),
      language: formText(formData, "language"),
    });
    if (!result.ok) return result;
    revalidatePath("/dashboard", "layout");
    return {
      ok: true,
      message: result.timezoneChanged
        ? "Datos guardados. Desde ahora las horas de clases y las fechas límite se muestran con la nueva zona horaria."
        : "Datos guardados.",
    };
  } catch (error) {
    return actionFailure("updateInstitutionSettingsAction", error);
  }
}
