"use server";

import { revalidatePath } from "next/cache";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { savePlatformAnnouncement, endPlatformAnnouncement } from "@/server/platform/announcements";

export async function saveAnnouncementAction(form: FormData) {
  const operator = await getOperatorEmail();
  if (!operator) return { ok: false as const, message: "No tienes permiso para administrar estos avisos." };
  if (form.get("confirmed") !== "yes") return { ok: false as const, message: "Confirma a quién se mostrará el aviso." };
  const result = await savePlatformAnnouncement(operator, {
    title: form.get("title"), body: form.get("body"), level: form.get("level"), audience: form.get("audience"),
    startsAt: form.get("startsAt"), endsAt: form.get("endsAt"),
  }, String(form.get("id") || "") || undefined);
  if (result.ok) { revalidatePath("/operador/avisos"); revalidatePath("/dashboard", "layout"); }
  return result;
}
export async function endAnnouncementAction(form: FormData) {
  const operator = await getOperatorEmail();
  if (!operator) return { ok: false as const, message: "No tienes permiso para administrar estos avisos." };
  const result = await endPlatformAnnouncement(operator, String(form.get("id") || ""), String(form.get("confirmation") || ""));
  if (result.ok) { revalidatePath("/operador/avisos"); revalidatePath("/dashboard", "layout"); }
  return result;
}
