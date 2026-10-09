import { expect, type Page } from "@playwright/test";

/** Call after authenticating a seeded operator; no extra account or environment writes here. */
export async function supportSmoke(page: Page, institutionId: string, institutionName: string, operatorEmail: string) {
  await page.goto(`/operador/${institutionId}`);
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Ver como administrador" }) });
  await form.getByLabel(/Escribe/).fill("Nombre incorrecto");
  await form.getByRole("button", { name: "Ver como administrador" }).click();
  await expect(form.getByRole("alert")).toContainText("nombre completo");
  await form.getByLabel(/Escribe/).fill(institutionName);
  await form.getByRole("button", { name: "Ver como administrador" }).click();
  await page.waitForURL(`**/operador/${institutionId}/vista`);
  await expect(page.getByRole("complementary", { name: "Modo soporte" })).toContainText("Solo lectura");
  await expect(page.getByRole("heading", { name: institutionName })).toBeVisible();
  await expect(page.getByRole("button", { name: /Crear|Guardar|Publicar|Inscribir|Eliminar/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await page.waitForURL(`**/operador/${institutionId}`);
  await page.goto(`/operador/${institutionId}/vista`);
  await expect(page.getByRole("heading", { name: "La vista de soporte no está activa" })).toBeVisible();
  await page.goto(`/operador/bitacora?institutionId=${encodeURIComponent(institutionId)}&operator=${encodeURIComponent(operatorEmail)}`);
  await expect(page.locator("ol").getByText("PLATFORM_SUPPORT_ENTERED", { exact: true }).first()).toBeVisible();
  await expect(page.locator("ol").getByText("PLATFORM_SUPPORT_EXITED", { exact: true }).first()).toBeVisible();
}
