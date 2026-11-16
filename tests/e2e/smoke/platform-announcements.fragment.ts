import { expect, type Page } from "@playwright/test";

/** Integrator calls after logging in as the allowlisted operator. Namespace per project/run. */
export async function platformAnnouncementsSmoke(page: Page, tag: string) {
  const title = `Aviso Edukana ${tag}`;
  await page.goto("/operador/avisos");
  await page.getByRole("link", { name: "Crear aviso", exact: true }).click();
  await page.getByLabel("Título", { exact: true }).fill(title);
  await page.getByLabel("Mensaje", { exact: true }).fill("Mensaje de prueba de la plataforma.");
  await page.getByLabel("Inicio (UTC)", { exact: true }).fill("2026-01-01T00:00");
  await page.getByLabel(/Confirmo que el mensaje/).check();
  await page.getByRole("button", { name: "Crear aviso", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Aviso guardado.");
  await page.getByRole("link", { name: `Editar o terminar ${title}`, exact: true }).click();
  await page.getByLabel("Mensaje", { exact: true }).fill("Mensaje corregido de la plataforma.");
  await page.getByLabel(/Confirmo que el mensaje/).check();
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByRole("status")).toHaveText("Aviso guardado.");
  await page.goto("/dashboard");
  const banner = page.getByRole("complementary", { name: "Aviso de Edukana" }).filter({ hasText: title });
  await expect(banner).toContainText("Mensaje corregido");
  await banner.getByRole("button", { name: `Cerrar aviso: ${title}` }).click();
  await page.reload(); await expect(banner).toHaveCount(0);
  await page.goto("/operador/avisos");
  await page.getByRole("link", { name: `Editar o terminar ${title}`, exact: true }).click();
  await page.getByLabel(`Escribe el título para confirmar: ${title}`).fill(title);
  await page.getByRole("button", { name: "Terminar aviso", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Aviso terminado.");
}
/** Call in a non-operator session; each entry point must return Next's 404. */
export async function platformAnnouncementsDeniedSmoke(page: Page) {
  for (const path of ["/operador/avisos", "/operador/avisos/nuevo", "/operador/avisos/forged"]) {
    const response = await page.goto(path); expect(response?.status()).toBe(404);
  }
}
