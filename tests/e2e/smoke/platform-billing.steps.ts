import { expect, type Page } from "@playwright/test";

/** Call with direccion@colegio-nuevo.test operator session, after shared seedPlatformPlans. */
export async function checkPlatformPlans(page: Page) {
  await page.goto("/operador/planes");
  await expect(page.getByRole("heading", { name: "Planes", exact: true })).toBeVisible();
  const free = page.locator("section").filter({ has: page.getByRole("heading", { name: "Gratis", exact: true }) });
  await free.getByLabel("Máximo de estudiantes").fill("30");
  await free.getByRole("button", { name: "Guardar plan" }).click();
  await expect(free.getByRole("status")).toHaveText("Cambios guardados.");
  await page.reload();
  await expect(free.getByLabel("Máximo de estudiantes")).toHaveValue("30");
  await page.goto("/operador/facturacion");
  await expect(page.getByRole("heading", { name: "Facturación", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Por cobrar este mes", exact: true })).toBeVisible();
}

export async function checkInstitutionBilling(page: Page, institutionId: string, institutionName: string) {
  await page.goto(`/operador/${institutionId}`);
  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Plan y facturación", exact: true }) });
  await section.getByText("Cambiar plan", { exact: true }).click();
  await section.getByLabel("Plan", { exact: true }).selectOption("PRO");
  await section.getByLabel("Precio pactado en centavos", { exact: true }).fill("5000");
  await section.getByLabel(`Para confirmar, escribe ${institutionName}`, { exact: true }).fill(institutionName);
  await section.getByRole("button", { name: "Confirmar cambio de plan" }).click();
  await expect(section.getByRole("status").first()).toHaveText("Cambios guardados.");
  await page.reload();
  await expect(section.getByText(/Profesional ·/)).toBeVisible();
  await section.getByText("Generar factura del período", { exact: true }).click();
  await section.getByRole("button", { name: "Generar factura", exact: true }).click();
  await expect(section.getByRole("status").filter({ hasText: "Cambios guardados." })).toHaveCount(1);
  await page.reload();
  await section.getByText("Marcar como pagada", { exact: true }).first().click();
  await section.getByRole("button", { name: "Registrar pago", exact: true }).first().click();
  await expect(section.getByRole("status").filter({ hasText: "Cambios guardados." })).toHaveCount(1);
  await page.reload();
  await expect(section.getByText(/Pagada · Vence/).first()).toBeVisible();
}
