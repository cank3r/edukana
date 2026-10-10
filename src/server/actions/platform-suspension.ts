"use server";

import { revalidatePath } from "next/cache";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { setInstitutionSuspension, type SuspensionResult } from "@/server/platform/suspension";

export async function setInstitutionSuspensionAction(_previous: SuspensionResult, form: FormData): Promise<SuspensionResult> {
  const result = await setInstitutionSuspension(await getOperatorEmail(), {
    institutionId: form.get("institutionId"),
    status: form.get("status"),
    confirmation: form.get("confirmation"),
    reason: form.get("reason") ?? "",
  });
  if (result.ok) {
    revalidatePath("/operador");
    revalidatePath(`/operador/${encodeURIComponent(String(form.get("institutionId")))}`);
    revalidatePath("/catalogo", "layout");
  }
  return result;
}
