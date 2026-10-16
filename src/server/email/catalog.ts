import type { EmailBrand } from "@/server/platform/branded-email";
import { transactionalEmail, type TransactionalMessage } from "./layout";

export type CatalogEmailInput = { name: string; course: string } & (
  | { kind: "role-mismatch" }
  | { kind: "pending-order"; number: string; total: string; instructions: string }
  | { kind: "already-enrolled"; loginHref: string }
);

/** Requires the complete email brand, never the public catalog projection. */
export function catalogEmail(brand: EmailBrand | null, message: TransactionalMessage, input: CatalogEmailInput) {
  const summary = [{ label: "Curso", value: input.course }];
  if (input.kind === "pending-order") {
    return transactionalEmail(brand, message, {
      category: "Tu pedido", heading: "Recibimos tu pedido", preheader: "Consulta el resumen y las instrucciones de pago.",
      name: input.name,
      summary: [...summary, { label: "Número de pedido", value: input.number }, { label: "Total a pagar", value: input.total }],
      paragraphs: ["Cómo pagar:", input.instructions],
    });
  }
  if (input.kind === "already-enrolled") {
    return transactionalEmail(brand, message, {
      category: "Tu curso", heading: "Ya tienes acceso a este curso", preheader: "No necesitas pagar este pedido.",
      name: input.name, summary, paragraphs: ["Ya tienes acceso a este curso: no necesitas pagar este pedido."],
      // Retain the existing platform login URL. Do not silently substitute the institution's domain.
      action: { label: "Entrar a la plataforma", href: input.loginHref, origin: "platform" },
    });
  }
  return transactionalEmail(brand, message, {
    category: "Tu solicitud", heading: "Contacta a tu institución", preheader: "Tu institución puede ayudarte con la inscripción.",
    name: input.name, summary,
    paragraphs: [`Pediste entrar a este curso, pero tu cuenta en ${brand?.name ?? "la institución"} no es de estudiante.`,
      "Pide a la institución que te inscriba directamente."],
  });
}
