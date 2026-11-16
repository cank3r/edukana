import { expect, type Page } from "@playwright/test";

/** Requires an authenticated platform operator and the integrator-mounted FeatureSection. */
export async function checkPlatformFeatures(page: Page, institutionId: string, slug: string) {
  await page.goto(`/operador/${institutionId}`);
  await expect(page.getByRole("heading", { name: "Funciones", exact: true })).toBeVisible();
  await page.getByLabel("Asistente de IA", { exact: true }).uncheck();
  await page.getByLabel("Catálogo público y venta de cursos").uncheck();
  await page.getByLabel("Comisión (%)").fill("12.5");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Guardar funciones" }).click();
  await expect(page.getByRole("status")).toHaveText("Funciones guardadas.");
  await page.reload();
  await expect(page.getByLabel("Asistente de IA", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("Comisión (%)")).toHaveValue("12.5");
  const response = await page.request.get(`/catalogo/${slug}`);
  expect(response?.status()).toBe(404);
  await page.goto(`/operador/${institutionId}`);
  await page.getByLabel("Asistente de IA", { exact: true }).check();
  await page.getByLabel("Catálogo público y venta de cursos").check();
  await page.getByLabel("Comisión (%)").fill("0");
  await page.getByRole("button", { name: "Guardar funciones" }).click();
  await expect(page.getByRole("status")).toHaveText("Funciones guardadas.");
}
