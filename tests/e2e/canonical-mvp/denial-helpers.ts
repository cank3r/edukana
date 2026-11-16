import { expect, test, type Browser, type Locator, type Page, type Request, type Response } from "@playwright/test";
import { PASSWORD, type PilotUser } from "./fixtures";
import { login } from "./helpers";

const ORIGIN = "http://127.0.0.1:3160";

/** Every session is obtained through the normal login UI; never inject cookies or auth state. */
export async function sessionPage(browser: Browser, user: PilotUser) {
  const context = await browser.newContext({ baseURL: ORIGIN });
  const page = await context.newPage();
  await login(page, user);
  return page;
}

async function liveSession(page: Page) {
  const response = await page.request.get("/api/auth/session", { maxRedirects: 0 });
  expect(response.status(), "La sesión debe responder antes de evaluar permisos").toBe(200);
  const session = await response.json();
  expect(Boolean(session?.user?.id && session?.user?.institutionId), "La sesión autenticada debe seguir viva").toBe(true);
  return { id: String(session.user.id), institutionId: String(session.user.institutionId) };
}

export async function deniedPage(page: Page, path: string, forbiddenHeading?: string) {
  const before = await liveSession(page);
  const response = await page.goto(path);
  await page.waitForLoadState("domcontentloaded");
  const destination = new URL(page.url());
  expect(destination.origin).toBe(ORIGIN);
  // These pages explicitly redirect insufficient permissions to /dashboard. Login/errors are never denials.
  const knownRejection = destination.pathname === "/dashboard" && response?.status() === 200;
  expect(response?.status() === 404 || knownRejection, `La ruta debe denegar ${path} con 404 o rechazo conocido`).toBe(true);
  if (forbiddenHeading) await expect(page.getByRole("heading", { name: forbiddenHeading, exact: true })).toHaveCount(0);
  const after = await liveSession(page);
  expect(after.id === before.id && after.institutionId === before.institutionId, "La denegación no debe ser pérdida o cambio de sesión").toBe(true);
}

export async function assetStatus(page: Page, assetId: string) {
  const response = await page.request.get(`/api/assets/${assetId}`, { maxRedirects: 0 });
  return response.status();
}

/** URLs remain in memory only. Revocation blocks future issuance, while these retain their real TTL. */
export async function issuedLocalUrl(page: Page, assetId: string, seconds: 60 | 300) {
  const issuedAt = Date.now();
  const response = await page.request.get(`/api/assets/${assetId}`, { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  const location = response.headers().location;
  const url = new URL(location);
  expect(url.origin).toBe(ORIGIN);
  expect(url.pathname).toBe("/api/local-storage");
  const expires = Number(url.searchParams.get("expires"));
  expect(expires - issuedAt).toBeGreaterThanOrEqual(seconds * 1000 - 1000);
  expect(expires - issuedAt).toBeLessThanOrEqual(seconds * 1000 + 2000);
  expect((await page.request.get(location)).status()).toBe(200);
  return { location, expires, seconds };
}

export async function waitForRealExpiry(page: Page, issued: Awaited<ReturnType<typeof issuedLocalUrl>>) {
  await expect.poll(async () => (await page.request.get(issued.location)).status(), {
    timeout: Math.max(1000, issued.expires - Date.now() + 8000), intervals: [1000],
    message: `La URL debe vencer tras ${issued.seconds} s reales, sin adelantar el reloj`,
  }).toBe(403);
  expect(Date.now(), "La URL emitida conserva su ventana residual hasta el vencimiento").toBeGreaterThanOrEqual(issued.expires);
  expect(Date.now() - issued.expires, "El vencimiento se debe observar dentro de ocho segundos del TTL").toBeLessThan(8000);
}

/** Capture a genuine UI POST, retaining no cookies, signed URLs or requests on disk. */
export async function captureAction(page: Page, trigger: () => Promise<unknown>) {
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => {
      const request = candidate.request();
      return request.method() === "POST" && Boolean(request.headers()["next-action"]);
    }, { timeout: 20_000 }),
    trigger(),
  ]);
  // RSC responses can keep streaming after the action. Callers assert the resulting UI state.
  expect(response.status(), "La acción de control debe llegar al servidor").toBe(200);
  return response.request();
}

/** Replay the same public action using the other browser's real session, never the source cookie. */
export async function deniedAction(page: Page, original: Request, expected: RegExp, replace?: [string, string]) {
  const source = new URL(original.url());
  expect(source.origin).toBe(ORIGIN);
  let body = original.postDataBuffer();
  if (!body) throw new Error("La acción capturada no contiene datos");
  if (replace) {
    const text = body.toString("utf8");
    expect(text.includes(replace[0]), "El campo que se prueba debe existir en la solicitud real").toBe(true);
    body = Buffer.from(text.replaceAll(replace[0], replace[1]));
  }
  const headers = original.headers();
  const response = await page.request.post(source.pathname, {
    headers: { "next-action": headers["next-action"], "content-type": headers["content-type"], origin: ORIGIN },
    data: body,
    maxRedirects: 0,
    timeout: 20_000,
  });
  const text = await response.text();
  // Assert only booleans so a failed assertion cannot print the entire RSC response/private URLs.
  expect(response.status(), "La acción negativa no debe fallar por transporte").toBe(200);
  expect(text.includes('"ok":false') && expected.test(text), "El servidor debe rechazar el ID ajeno con un error de dominio").toBe(true);
}

export async function createForeignSpace(page: Page) {
  const tag = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const user = { name: `Administrador externo ${tag}`, email: `external-${tag}@canonical.example.test`, institutionName: `Institución externa ${tag}` };
  await page.goto("/ensenar");
  await page.getByLabel("Tu nombre", { exact: true }).fill(user.name);
  await page.getByLabel("Correo electrónico", { exact: true }).fill(user.email);
  await page.getByLabel("Contraseña", { exact: false }).fill(PASSWORD);
  await page.locator('input[name="spaceName"]').fill(user.institutionName);
  await page.getByRole("button", { name: "Crear mi espacio de docente", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/dashboard/perfil");
  await expect(page.getByRole("heading", { name: "Mi perfil", exact: true })).toBeVisible();
  const account = page.getByRole("region", { name: "Mi acceso", exact: true });
  await expect(account.getByText(user.email, { exact: true })).toBeVisible();
  await expect(account.getByText(user.institutionName, { exact: true })).toBeVisible();
  await liveSession(page);
  return user;
}

export function guardianCard(page: Page, guardianId: string) {
  return page.locator("article").filter({ has: page.locator(`input[name="id"][value="${guardianId}"]`) });
}

export async function setGuardianFlag(card: Locator, label: string, enabled: boolean) {
  // A fresh render is essential: a prior success message or local checkbox is not persistence.
  await card.page().reload();
  const checkbox = card.getByRole("checkbox", { name: label, exact: true });
  if (await checkbox.isChecked() === enabled) return;
  await checkbox.setChecked(enabled);
  await captureAction(card.page(), () => card.getByRole("button", { name: "Guardar permisos", exact: true }).click());
  await expect(card.getByRole("status")).toContainText("Permisos del vínculo actualizados");
  await expect(card.getByRole("button", { name: "Guardar permisos", exact: true })).toBeDisabled();
  await card.page().reload();
  await expect(checkbox, `El permiso ${label} debe persistir tras recargar`).toBeChecked({ checked: enabled });
}

export async function setTeacherCourseAccess(page: Page, enabled: boolean) {
  await page.goto("/dashboard/configuracion/roles");
  await page.getByLabel("Rol institucional", { exact: true }).selectOption("TEACHER");
  const row = page.locator("label").filter({ has: page.getByText("Ver cursos", { exact: true }) });
  await row.getByRole("checkbox").setChecked(enabled);
  await page.getByRole("button", { name: "Guardar permisos", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Permisos guardados para esta institución");
}

/** Generate an actual WebM in Chromium; no third-party fixture or application data is read. */
async function syntheticVideo(page: Page) {
  const bytes = await page.evaluate(async () => {
    const mimeType = "video/webm;codecs=vp8";
    if (!MediaRecorder.isTypeSupported(mimeType)) throw new Error("Chromium no puede generar el vídeo WebM ficticio.");
    const canvas = document.createElement("canvas");
    canvas.width = 16; canvas.height = 16;
    const drawing = canvas.getContext("2d")!;
    drawing.fillStyle = "#1768ac"; drawing.fillRect(0, 0, 16, 16);
    const stream = canvas.captureStream(5);
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    const recorded = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => reject(new Error("Falló la grabación ficticia."));
      recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
    });
    recorder.start();
    drawing.fillRect(0, 0, 16, 16);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    recorder.stop();
    const video = await recorded;
    stream.getTracks().forEach((track) => track.stop());
    const element = document.createElement("video");
    const objectUrl = URL.createObjectURL(video);
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("El vídeo ficticio no terminó de decodificarse.")), 10_000);
        element.onloadeddata = () => { clearTimeout(timeout); resolve(); };
        element.onerror = () => { clearTimeout(timeout); reject(new Error("El vídeo ficticio no se puede decodificar.")); };
        element.preload = "auto"; element.src = objectUrl;
      });
      if (element.videoWidth !== 16 || element.videoHeight !== 16) throw new Error("El vídeo ficticio tiene dimensiones inesperadas.");
    } finally { element.removeAttribute("src"); URL.revokeObjectURL(objectUrl); }
    return Array.from(new Uint8Array(await video.arrayBuffer()));
  });
  expect(bytes.length, "El vídeo válido debe contener datos").toBeGreaterThan(100);
  return Buffer.from(bytes);
}

export async function attachTeacherFile(page: Page, courseId: string, lessonTitle: string, kind: "document" | "video" = "document") {
  await page.goto(`/dashboard/aula/${courseId}/contenido`);
  const lesson = page.locator("li").filter({ has: page.getByRole("button", { name: `Editar lección ${lessonTitle}`, exact: true }) }).last();
  await lesson.locator("summary").filter({ hasText: /^Archivos/ }).click();
  const filename = `capability-revocation-${Date.now()}.${kind === "video" ? "webm" : "txt"}`;
  const buffer = kind === "video" ? await syntheticVideo(page) : Buffer.from("Documento privado ficticio del docente.");
  await lesson.getByLabel("Adjuntar un archivo", { exact: true }).setInputFiles({
    name: filename, mimeType: kind === "video" ? "video/webm" : "text/plain", buffer,
  });
  const exchange: Array<{ method: string; path: string; status: number }> = [];
  const record = (response: Response) => {
    const url = new URL(response.url());
    const method = response.request().method();
    if (url.origin !== ORIGIN) return;
    if ((method === "POST" && url.pathname === "/api/assets") ||
      (method === "PUT" && url.pathname === "/api/local-storage") ||
      (method === "PATCH" && /^\/api\/assets\/[^/]+$/.test(url.pathname))) {
      exchange.push({ method, path: url.pathname.replace(/^(\/api\/assets)\/[^/]+$/, "$1/:assetId"), status: response.status() });
    }
  };
  page.on("response", record);
  try {
    const [confirmation] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === "PATCH" &&
        new URL(response.url()).origin === ORIGIN && /^\/api\/assets\/[^/]+$/.test(new URL(response.url()).pathname), { timeout: 20_000 }),
      lesson.getByRole("button", { name: "Subir archivo", exact: true }).click(),
    ]);
    expect(confirmation.status(), "La confirmación de la carga debe aceptar los bytes enviados por la UI").toBe(200);
    await expect(lesson.getByRole("status")).toContainText("Archivo adjuntado");
  } finally {
    page.off("response", record);
    await test.info().attach(`teacher-${kind}-upload-http`, {
      body: Buffer.from(JSON.stringify(exchange)), contentType: "application/json",
    });
  }
  const href = await lesson.getByRole("link", { name: filename, exact: true }).getAttribute("href");
  expect(href).toMatch(/^\/api\/assets\/[a-z0-9]+$/i);
  const retrieval = await page.request.get(href!, { maxRedirects: 0 });
  expect(retrieval.status()).toBe(302);
  expect(new URL(retrieval.headers().location).origin).toBe(ORIGIN);
  const downloaded = await page.request.get(retrieval.headers().location);
  expect(downloaded.status()).toBe(200);
  expect(await downloaded.body(), "La UI debe conservar exactamente los bytes del archivo ficticio").toEqual(buffer);
  return href!.split("/").pop()!;
}

export async function createOpenAssignment(page: Page, courseId: string) {
  const title = `Tarea para probar cierre ${Date.now()}`;
  await page.goto(`/dashboard/aula/${courseId}/tareas`);
  await page.getByRole("button", { name: "Crear tarea", exact: true }).click();
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Guardar tarea", exact: true }) });
  await form.getByLabel("Título", { exact: true }).fill(title);
  await form.getByLabel("Instrucciones", { exact: true }).fill("Escribe una respuesta antes de que termine tu matrícula.");
  const category = form.locator('select[name="categoryId"]');
  if (await category.count()) await category.selectOption("");
  await form.locator('input[name="publish"]').check();
  await form.getByRole("button", { name: "Guardar tarea", exact: true }).click();
  const link = page.getByRole("link", { name: title, exact: true });
  await expect(link).toBeVisible();
  return (await link.getAttribute("href"))!;
}

export async function createOpenExam(page: Page, courseId: string) {
  const question = `La matrícula debe estar activa para enviar este examen (${Date.now()}).`;
  await page.goto(`/dashboard/aula/${courseId}/preguntas/nueva`);
  await page.locator('input[type="radio"][value="TRUE_FALSE"]').check();
  await page.getByLabel("Pregunta", { exact: true }).fill(question);
  await page.getByRole("radio", { name: "Verdadero", exact: true }).check();
  await page.getByRole("button", { name: "Agregar pregunta", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/aula/${courseId}/preguntas$`));
  await page.goto(`/dashboard/aula/${courseId}/examenes/nuevo`);
  await page.getByLabel("Título", { exact: true }).fill("Examen para probar cierre");
  await page.locator("li").filter({ hasText: question }).getByRole("button", { name: "Agregar", exact: true }).click();
  await page.getByRole("button", { name: "Guardar borrador", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/aula/${courseId}/examenes/(?!nuevo$)[a-z0-9]+$`));
  const examId = new URL(page.url()).pathname.split("/").pop()!;
  expect(examId, "El identificador debe proceder del examen guardado, no de la ruta de creación").not.toBe("nuevo");
  await page.getByRole("button", { name: "Publicar examen", exact: true }).click();
  await page.getByRole("button", { name: "Sí, publicar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ocultar examen", exact: true })).toBeVisible();
  return examId;
}
