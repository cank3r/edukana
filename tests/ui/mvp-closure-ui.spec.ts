import { test, expect, type Page } from "@playwright/test";
import type {} from "./mvp-closure-fixture";

const origin = "http://127.0.0.1:3153";
const calls = (page: Page) => page.evaluate(() => window.closureFixture.calls);
let errors: string[];
test.beforeEach(async ({page}) => {
  errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => route.request().url().startsWith(`${origin}/`)
    ? route.continue() : route.abort("blockedbyclient"));
});
test.afterEach(() => expect(errors).toEqual([]));

test("respuesta vacía no abre confirmación ni envía", async ({page}) => {
  await page.goto("/");
  await page.getByRole("button", {name:"Entregar tarea",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("adjunta un archivo");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(await calls(page)).toEqual([]);
});

test("quitar archivo pendiente bloquea la entrega hasta terminar la solicitud", async ({page},info) => {
  let release!: () => void;
  let requested!: () => void;
  const entered = new Promise<void>(resolve => {requested = resolve;});
  const held = new Promise<void>(resolve => {release = resolve;});
  await page.route("**/api/uploads/pending-a", async route => {
    expect(route.request().method()).toBe("DELETE");
    requested(); await held; await route.fulfill({status:204});
  });
  await page.goto("/?pending=1");
  await page.getByRole("button", {name:"Quitar pending-a.pdf",exact:true}).click();
  await entered;
  try {
    await page.screenshot({path:info.outputPath("retirada-en-curso.png"),fullPage:true});
    await expect(page.getByRole("button", {name:"Entregar tarea",exact:true})).toBeDisabled({timeout:1000});
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect(await calls(page)).toEqual([]);
  } finally {release();}
  await expect(page.getByLabel("Archivos listos para entregar")).toHaveCount(0);
  await expect(page.getByRole("button", {name:"Entregar tarea",exact:true})).toBeEnabled();
});

test("fallo al quitar conserva el archivo y permite reintentar", async ({page}) => {
  let attempts = 0;
  await page.route("**/api/uploads/pending-a", route => {
    attempts++;
    return route.fulfill({status:attempts === 1 ? 503 : 204});
  });
  await page.goto("/?pending=1");
  const remove = page.getByRole("button", {name:"Quitar pending-a.pdf",exact:true});
  await remove.click();
  await expect(page.getByRole("alert")).toContainText("No se pudo quitar");
  await expect(page.locator('input[name="assetIds"]')).toHaveValue("pending-a");
  await remove.click();
  await expect(page.getByLabel("Archivos listos para entregar")).toHaveCount(0);
  expect(attempts).toBe(2);
  expect(await calls(page)).toEqual([]);
});

test("carga PDF real del cliente, revisión y cancelación conservan los datos", async ({page}) => {
  const methods: string[] = [];
  await page.route("**/api/uploads", async route => {
    methods.push(route.request().method());
    expect(route.request().postDataJSON()).toMatchObject({purpose:"submission",assignmentId:"assignment-fixture"});
    await route.fulfill({status:201,json:{assetId:"uploaded-a",uploadUrl:`${origin}/fixture-upload`}});
  });
  await page.route("**/fixture-upload", async route => {
    methods.push(route.request().method());
    expect(route.request().postDataBuffer()?.toString()).toBe("%PDF-1.4\nArchivo sintetico\n%%EOF");
    await route.fulfill({status:200});
  });
  await page.route("**/api/uploads/uploaded-a", async route => {
    methods.push(route.request().method()); await route.fulfill({status:200,json:{ok:true}});
  });
  await page.goto("/");
  await page.getByLabel("Agregar archivos", {exact:true}).setInputFiles({
    name:"respuesta.pdf",mimeType:"application/pdf",buffer:Buffer.from("%PDF-1.4\nArchivo sintetico\n%%EOF"),
  });
  await expect(page.getByLabel("Archivos listos para entregar")).toContainText("respuesta.pdf");
  expect(methods).toEqual(["POST","PUT","PATCH"]);
  await page.getByRole("button", {name:"Entregar tarea",exact:true}).click();
  await expect(page.getByRole("alertdialog")).toContainText("1 archivo");
  await expect(page.getByRole("button", {name:"Quitar respuesta.pdf",exact:true})).toBeDisabled();
  await page.getByRole("button", {name:"Seguir editando",exact:true}).click();
  expect(await calls(page)).toEqual([]);
  await page.getByRole("button", {name:"Entregar tarea",exact:true}).click();
  await page.getByRole("button", {name:"Sí, entregar",exact:true}).click();
  await expect(page.getByRole("status")).toBeVisible();
  expect((await calls(page))[0].fields).toContainEqual(["assetIds","uploaded-a"]);
});

test("dejar fuera un archivo anterior cambia el payload sin solicitar borrado", async ({page}) => {
  const deletes: string[] = [];
  page.on("request", request => {if (request.method() === "DELETE") deletes.push(request.url());});
  await page.goto("/?current=1");
  await page.getByLabel("Tu respuesta", {exact:true}).fill("Nueva respuesta sintética");
  await page.getByRole("checkbox").uncheck();
  await expect(page.getByText("No se borra: queda guardado", {exact:false})).toBeVisible();
  await page.getByRole("button", {name:"Volver a entregar",exact:true}).click();
  await page.getByRole("button", {name:"Sí, entregar",exact:true}).click();
  await expect(page.getByRole("status")).toBeVisible();
  expect((await calls(page))[0].fields.filter(([name]) => name === "assetIds")).toEqual([]);
  expect(deletes).toEqual([]);
});

test("el período se elige explícitamente y conserva el identificador seleccionado", async ({page}) => {
  await page.goto("/?view=period");
  const period = page.getByRole("combobox");
  await expect(period).toHaveValue("");
  await expect(period.locator("option")).toHaveText(["Elige un período","Primer semestre 2026","Segundo semestre 2026"]);
  await page.getByLabel("Nombre del curso", {exact:true}).fill("Curso sintético de revisión");
  await period.selectOption("current");
  await page.getByRole("button", {name:"Crear curso",exact:true}).click();
  await expect.poll(() => calls(page)).toHaveLength(1);
  expect((await calls(page))[0].fields).toContainEqual(["periodId","current"]);
  await expect.poll(() => page.evaluate(() => window.closureFixture.navigation)).toEqual(["/dashboard/aula/course-fixture"]);
});

test("el selector de período tiene un nombre accesible estable sin incluir sus opciones", async ({page}) => {
  await page.goto("/?view=period");
  await expect(page.getByRole("combobox", {name:"Período",exact:true})).toBeVisible();
});

test("instrucciones de tarea conservan saltos de línea y recurso HTTPS al guardar", async ({page}) => {
  await page.goto("/?view=assignment");
  await page.getByRole("button", {name:"Crear tarea",exact:true}).click();
  await page.getByLabel("Título", {exact:true}).fill("Tarea de demostración");
  const text = "Lee el material de ejemplo.\nRecurso: https://example.test/recurso\nEntrega tu explicación en PDF.";
  await page.getByLabel("Instrucciones", {exact:true}).fill(text);
  await page.getByRole("button", {name:"Guardar tarea",exact:true}).click();
  await expect(page.getByRole("status")).toBeVisible();
  expect((await calls(page))[0].fields).toContainEqual(["instructions",text]);
});

test("controles de adjuntos funcionan con teclado sin desbordamiento", async ({page},info) => {
  await page.goto("/?pending=1&current=1");
  const reply = page.getByLabel("Tu respuesta", {exact:true});
  await reply.fill("Respuesta de prueba");
  await page.getByRole("button", {name:"Volver a entregar",exact:true}).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alertdialog")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator("button:visible").evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().height >= 44))).toBe(true);
  await page.screenshot({path:info.outputPath("adjuntos-confirmacion.png"),fullPage:true});
});
