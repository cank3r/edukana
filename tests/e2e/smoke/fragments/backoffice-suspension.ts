import { expect, type Page } from "@playwright/test";

/** Called by the integrated backoffice tour after its operator and member pages have logged in.
 * The operator MUST belong to another institution. Restore in finally so later tours remain usable.
 */
export async function exerciseInstitutionSuspension(input: {
  operatorPage: Page;
  memberPage: Page;
  institutionId: string;
  institutionName: string;
  institutionSlug: string;
  memberEmail: string;
  password: string;
  screenshotPath?: string;
}) {
  const { operatorPage: page, memberPage, institutionId, institutionName, institutionSlug } = input;
  const activeCatalog = await memberPage.request.get(`/catalogo/${encodeURIComponent(institutionSlug)}`);
  expect(activeCatalog.status()).toBe(200);
  await page.goto(`/operador/${institutionId}`);
  const section = page.getByRole("region", { name: "Acceso a la institución" });
  await expect(section.getByText("Activa", { exact: true })).toBeVisible();
  await section.getByRole("button", { name: "Suspender institución", exact: true }).click();
  await section.getByLabel("Motivo de la suspensión").fill("Revisión de acceso del recorrido");
  await section.getByLabel(`Escribe «${institutionName}» para confirmar`).fill("Nombre incorrecto");
  await section.getByRole("button", { name: "Suspender institución", exact: true }).click();
  await expect(section.getByRole("alert")).toContainText("El nombre no coincide");
  // A rejected confirmation must preserve the reason so the operator can correct only the name.
  await expect(section.getByLabel("Motivo de la suspensión")).toHaveValue("Revisión de acceso del recorrido");
  await section.getByLabel(`Escribe «${institutionName}» para confirmar`).fill(institutionName);
  await section.getByRole("button", { name: "Suspender institución", exact: true }).click();
  try {
    await expect(section.getByText("Suspendida", { exact: true })).toBeVisible();
    if (input.screenshotPath) await page.screenshot({ path: input.screenshotPath, fullPage: true });
    await memberPage.goto("/dashboard");
    await expect(memberPage).toHaveURL(/\/login/);
    await expect(memberPage.getByRole("alert").first()).toContainText(`El acceso de ${institutionName} está pausado`);
    await memberPage.goto(`/login?institucion=${encodeURIComponent(institutionSlug)}`);
    await memberPage.getByLabel("Correo electrónico").fill(input.memberEmail);
    await memberPage.getByLabel("Contraseña", { exact: true }).fill(input.password);
    await memberPage.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(memberPage.getByRole("alert").last()).toContainText(`El acceso de ${institutionName} está pausado`);
    // Public route enforcement is connected by piece D in the integrated branch.
    const catalog = await memberPage.request.get(`/catalogo/${encodeURIComponent(institutionSlug)}`);
    expect(catalog.status()).toBe(404);
  } finally {
    await page.goto(`/operador/${institutionId}`);
    const reactivate = page.getByRole("button", { name: "Reactivar institución", exact: true });
    if (await reactivate.count()) {
      await reactivate.click();
      await section.getByLabel(`Escribe «${institutionName}» para confirmar`).fill(institutionName);
      await section.getByRole("button", { name: "Reactivar institución", exact: true }).click();
      await expect(section.getByText("Activa", { exact: true })).toBeVisible();
    }
  }
  await memberPage.goto("/dashboard");
  await expect(memberPage).toHaveURL(/\/dashboard/);
}
