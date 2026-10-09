"use server";
import { revalidatePath } from "next/cache";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { updatePlatformPlan } from "@/server/platform/plans";
import { changeInstitutionPlan, extendSubscription } from "@/server/platform/subscriptions";
import { generatePlatformInvoice, payPlatformInvoice, voidPlatformInvoice } from "@/server/platform/invoices";

export type BillingActionState = { message: string; ok: boolean };
export async function billingAction(_previous: BillingActionState, form: FormData): Promise<BillingActionState> {
  const operator = await getOperatorEmail();
  if (!operator) return { ok: false, message: "No tienes permiso para hacer esto." };
  const text = (key: string) => String(form.get(key) ?? "");
  const number = (key: string) => Number(text(key));
  const limit = (key: string) => text(key).trim() === "" ? null : number(key);
  const institutionId = text("institutionId");
  try {
    switch (text("operation")) {
      case "plan":
        await updatePlatformPlan(operator, { code: text("code"), name: text("name"), priceCents: number("priceCents"),
          currency: text("currency"), maxStudents: limit("maxStudents"), maxStorageMb: limit("maxStorageMb"),
          aiRequestsPerMonth: limit("aiRequestsPerMonth"), active: form.has("active"),
          features: { catalog: form.has("catalog"), ai: form.has("ai") } }); break;
      case "change":
        await changeInstitutionPlan(operator, institutionId, { planCode: text("planCode"), priceCents: number("priceCents"),
          confirmation: text("confirmation"), notes: text("notes") }); break;
      case "extend": await extendSubscription(operator, institutionId, new Date(text("end"))); break;
      case "invoice": await generatePlatformInvoice(operator, institutionId, {
        periodStart: new Date(text("start")), periodEnd: new Date(text("end")), dueDate: new Date(text("due")) }); break;
      case "pay": await payPlatformInvoice(operator, institutionId, text("invoiceId"), {
        paidAt: new Date(text("paidAt")), paymentMethod: text("paymentMethod"), reference: text("reference") }); break;
      case "void": await voidPlatformInvoice(operator, institutionId, text("invoiceId")); break;
      default: return { ok: false, message: "No reconocemos esa acción." };
    }
  } catch (error) {
    const message = error instanceof Error && !error.message.includes("prisma") ? error.message : "No pudimos guardar. Revisa los datos.";
    return { ok: false, message: message.startsWith("[") ? "Revisa los datos del formulario." : message };
  }
  revalidatePath("/operador/planes"); revalidatePath("/operador/facturacion");
  if (institutionId) revalidatePath(`/operador/${institutionId}`);
  return { ok: true, message: "Cambios guardados." };
}
