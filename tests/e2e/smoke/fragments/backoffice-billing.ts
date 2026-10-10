import { expect, type Page } from "@playwright/test";
import type { BackofficeTarget } from "../shared";

/** The target belongs only to this viewport. Global plan edits preserve the seeded FREE limit. */
export async function backofficeBillingSmoke(page: Page, target: BackofficeTarget) {
  await page.goto("/operador/planes");
  for (const name of ["Gratis", "Inicial", "Profesional", "Empresa"]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  const free = page.locator("section").filter({ has: page.getByRole("heading", { name: "Gratis", exact: true }) });
  await free.getByLabel("Máximo de estudiantes", { exact: true }).fill("30");
  await free.getByRole("button", { name: "Guardar plan", exact: true }).click();
  await expect(free.getByRole("status")).toContainText("Cambios guardados");
  await page.reload();
  await expect(free.getByLabel("Máximo de estudiantes", { exact: true })).toHaveValue("30");
  await page.goto(`/operador/${target.institutionId}`);
  const billing = page.locator("section").filter({ has: page.getByRole("heading", { name: "Plan y facturación", exact: true }) });
  await billing.getByText("Cambiar plan", { exact: true }).click();
  const change = billing.locator("form").filter({ has: page.getByRole("button", { name: "Confirmar cambio de plan" }) });
  await change.getByLabel("Plan", { exact: true }).selectOption("PRO");
  await change.getByLabel("Precio pactado en centavos").fill("5000");
  await change.getByLabel(`Para confirmar, escribe ${target.institutionName}`).fill(target.institutionName);
  await change.getByRole("button", { name: "Confirmar cambio de plan" }).click();
  await expect(change.getByRole("status")).toContainText("Cambios guardados");
  await page.reload();
  await expect(billing).toContainText("Profesional");
  await expect(billing).toContainText("RD$50.00");
  await billing.getByText("Generar factura del período", { exact: true }).click();
  await billing.getByRole("button", { name: "Generar factura", exact: true }).click();
  await expect(billing.getByRole("status")).toContainText("Cambios guardados");
  await page.reload();
  const invoice = billing.locator("article").filter({ hasText: "Abierta" }).first();
  await invoice.getByText("Marcar como pagada", { exact: true }).click();
  await invoice.getByLabel("Método", { exact: true }).selectOption("transferencia");
  await invoice.getByLabel("Referencia", { exact: true }).fill(`smoke-${target.institutionSlug}`);
  await invoice.getByLabel("Fecha del pago", { exact: true }).fill(new Date().toISOString().slice(0, 10));
  await invoice.getByRole("button", { name: "Registrar pago", exact: true }).click();
  // Paying removes the payment form, so the persisted invoice is the success signal.
  await expect(billing.getByText(/^Pagada ·/)).toBeVisible();
  await page.reload();
  await expect(billing).toContainText("Pagada");
  await expect(billing).toContainText("Activo");
  await page.goto("/operador/facturacion?estado=PAID");
  const paid = page.locator("article").filter({ has: page.getByRole("link", { name: target.institutionName, exact: true }) });
  await expect(paid).toContainText("Pagada");
  await expect(paid).toContainText("RD$50.00");
}
