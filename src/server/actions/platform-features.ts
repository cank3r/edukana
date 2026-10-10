"use server";

import { revalidatePath } from "next/cache";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { updateInstitutionFeatures, type FeatureResult } from "@/server/platform/features";

export async function updateInstitutionFeaturesAction(_state: FeatureResult, data: FormData): Promise<FeatureResult> {
  const operator = await getOperatorEmail();
  if (!operator) return { ok: false, message: "No tienes permiso para cambiar estas funciones." };
  const institutionId = String(data.get("institutionId") ?? "");
  const rawCommission = String(data.get("commissionPercent") ?? "").trim();
  try {
    const result = await updateInstitutionFeatures(operator, institutionId, {
      ai: data.get("ai") === "on", catalog: data.get("catalog") === "on",
      commissionPercent: rawCommission ? Number(rawCommission) : NaN,
    });
    if (result.ok) {
      revalidatePath(`/operador/${institutionId}`);
      revalidatePath("/operador/ventas");
      revalidatePath("/dashboard/configuracion/institucion");
      revalidatePath("/catalogo", "layout");
    }
    return result;
  } catch {
    return { ok: false, message: "No se pudieron guardar las funciones. Intenta de nuevo." };
  }
}
