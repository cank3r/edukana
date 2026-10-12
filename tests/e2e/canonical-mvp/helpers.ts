import { expect, type Locator, type Page } from "@playwright/test";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { BASE_URL, IMAGE, NAMES, PASSWORD, type PilotManifest, type PilotUser } from "./fixtures";

export function privateDir() {
  const value = process.env.CANONICAL_MVP_PRIVATE_DIR;
  if (!value || !isAbsolute(value)) throw new Error("CANONICAL_MVP_PRIVATE_DIR must be an absolute private scratch path.");
  return value;
}
export async function saveManifest(value: PilotManifest) {
  await mkdir(privateDir(), { recursive: true });
  await writeFile(join(privateDir(), "manifest.json"), JSON.stringify(value, null, 2), { mode: 0o600 });
}
export async function readManifest(): Promise<PilotManifest> {
  return JSON.parse(await readFile(join(privateDir(), "manifest.json"), "utf8"));
}
export const coursePath = (id: string, suffix = "") => `/dashboard/aula/${id}${suffix ? `/${suffix}` : ""}`;
export const formWith = (page: Page, button: string) =>
  page.locator("form").filter({ has: page.getByRole("button", { name: button, exact: true }) });
export async function open(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status(), `Application route ${path}`).toBeLessThan(500);
}
export async function login(page: Page, user: PilotUser) {
  // Reuse the login document reached by signOut instead of interrupting its navigation.
  if (page.url() !== `${BASE_URL}/login`) await open(page, "/login");
  await expect(page).toHaveURL(`${BASE_URL}/login`);
  await expect(page.getByLabel("Correo electrónico")).toBeVisible();
  await page.getByLabel("Correo electrónico").fill(user.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await page.waitForURL(/\/(dashboard|elegir-institucion)(?:\/|\?|$)/);
  if (new URL(page.url()).pathname === "/elegir-institucion") {
    await page.getByRole("button").filter({ hasText: user.institutionName ?? NAMES.institution }).click();
  }
  await expect(page).toHaveURL(/\/dashboard(?:\/|\?|$)/);
}
export async function logout(page: Page) {
  // Pace the canonical UI journey after navigation/prefetch has settled. Security with a
  // immediate versus quiescent logout remains a separate strict gate in logout-race.spec.ts.
  await page.waitForLoadState("networkidle");
  const [response] = await Promise.all([
    page.waitForResponse((result) => new URL(result.url()).pathname === "/api/auth/signout"
      && result.request().method() === "POST"),
    page.getByRole("button", { name: "Cerrar sesión", exact: true }).click(),
  ]);
  expect(response.ok(), "The UI sign-out request succeeded").toBe(true);
  await response.finished();
  // A URL change alone can occur before the destination document has settled.
  // Seeing the server-rendered form also proves LoginLayout no longer sees a session.
  await expect(page).toHaveURL(`${BASE_URL}/login`);
  await expect(page.getByLabel("Correo electrónico")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ingresar", exact: true })).toBeVisible();
}
export async function freshLogin(page: Page, user: PilotUser) {
  await open(page, "/dashboard");
  await logout(page);
  await login(page, user);
}
export async function createPerson(page: Page, user: PilotUser, role: string) {
  await open(page, "/dashboard/gestion");
  await page.getByRole("button", { name: "Agregar persona", exact: true }).click();
  await page.getByLabel("Nombre completo", { exact: true }).fill(user.name);
  await page.getByLabel("Correo", { exact: true }).fill(user.email);
  await page.getByLabel("Rol en esta institución").selectOption(role);
  await page.getByLabel("Enviarle la invitación al agregar").check();
  await page.getByRole("button", { name: "Revisar", exact: true }).click();
  await page.getByRole("button", { name: "Agregar y enviar invitación", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Persona agregada. Le enviamos la invitación" })).toBeVisible();
  const link = page.locator('a[href*="/gestion/personas/"]').filter({ hasText: user.name }).first();
  await expect(link).toBeVisible();
  return idFromPath((await link.getAttribute("href"))!, "/gestion/personas/");
}
export function idFromPath(path: string, marker: string) {
  const id = new URL(path, BASE_URL).pathname.split(marker)[1]?.split("/")[0];
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`UI did not expose a valid ID after ${marker}`);
  return id;
}
async function invitationPath(email: string) {
  const directory = join(privateDir(), "mailbox");
  for (const file of (await readdir(directory).catch(() => [])).filter((name) => name.endsWith(".json")).sort().reverse()) {
    const message = JSON.parse(await readFile(join(directory, file), "utf8"));
    const recipients = Array.isArray(message.to) ? message.to : [message.to];
    if (!recipients.includes(email)) continue;
    const match = `${message.text ?? ""}\n${message.html ?? ""}`.match(/https?:\/\/[^\s"<>]+\/restablecer\/[A-Za-z0-9_-]+/);
    if (!match) continue;
    const url = new URL(match[0]);
    if (url.origin !== BASE_URL) throw new Error("Invitation points outside the isolated application.");
    return url.pathname;
  }
  return "";
}
export async function activateInvitation(page: Page, email: string) {
  let path = "";
  await expect.poll(async () => { path = await invitationPath(email); return Boolean(path); },
    { message: "Fictitious invitation was captured by the local mailbox", timeout: 30_000 }).toBe(true);
  // Do not attach the one-use invitation URL to reports or persist authentication state.
  await page.goto(path);
  await page.getByLabel("Contraseña nueva").fill(PASSWORD);
  await page.getByLabel("Escríbela otra vez").fill(PASSWORD);
  await page.getByRole("button", { name: "Guardar contraseña", exact: true }).click();
  await expect(page.getByRole("link", { name: "Iniciar sesión", exact: true })).toBeVisible();
}
export async function assetBytes(page: Page, assetId: string) {
  const response = await page.request.get(`/api/assets/${assetId}`, { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  const location = response.headers().location;
  expect(new URL(location).origin).toBe(BASE_URL);
  expect(new URL(location).pathname).toBe("/api/local-storage");
  const result = await page.request.get(location);
  expect(result.status()).toBe(200);
  expect(await result.body()).toEqual(IMAGE);
}
export async function announcementPersists(page: Page, assetId: string) {
  await open(page, "/dashboard/comunidad");
  const card = page.locator("article").filter({ has: page.getByRole("heading", { name: NAMES.announcement, exact: true }) });
  await expect(card).toBeVisible();
  await expect(card.locator("strong")).toHaveText("Información importante");
  await expect(card.locator("li")).toHaveCount(2);
  await expect(card.getByRole("link", { name: "Abrir enlace", exact: true })).toHaveAttribute("href", "https://example.test/piloto");
  await expect(card.getByAltText(NAMES.image)).toBeVisible();
  await assetBytes(page, assetId);
}
export async function hiddenId(container: Locator, name: string) {
  const field = container.locator(`input[name="${name}"]`).first();
  await expect(field).toBeAttached();
  const value = await field.inputValue();
  expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
  return value;
}
