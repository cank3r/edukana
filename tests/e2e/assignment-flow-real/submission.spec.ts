import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

const database = new URL(process.env.DATABASE_URL ?? "file:missing");
if (database.hostname !== "127.0.0.1" || database.pathname !== "/edukana_assignment_test") {
  throw new Error("Refusing to seed or test anything except the isolated assignment database.");
}
const db = new PrismaClient();
const password = "Assignment-local-only-2026";
test.afterAll(() => db.$disconnect());

async function fixture(page: Page) {
  const tag = randomUUID();
  const institution = await db.institution.create({ data: { name: "Instituto de prueba local", slug: `assignment-${tag}` } });
  const email = `student-${tag}@example.test`;
  const identity = await db.identity.create({ data: { email, passwordHash: await bcrypt.hash(password, 10) } });
  const student = await db.user.create({ data: { institutionId: institution.id, identityId: identity.id,
    name: "Estudiante de prueba", email, role: "STUDENT", emailVerified: new Date() } });
  const teacher = await db.user.create({ data: { institutionId: institution.id, name: "Docente de prueba",
    email: `teacher-${tag}@example.test`, role: "TEACHER" } });
  const period = await db.academicPeriod.create({ data: { institutionId: institution.id, name: "Prueba local",
    startDate: new Date(Date.now() - 86_400_000), endDate: new Date(Date.now() + 30 * 86_400_000), isActive: true } });
  const course = await db.course.create({ data: { institutionId: institution.id, teacherId: teacher.id,
    periodId: period.id, name: "Curso para probar entregas", isPublished: true } });
  await db.enrollment.create({ data: { institutionId: institution.id, studentId: student.id, courseId: course.id } });
  const assignment = await db.assignment.create({ data: { institutionId: institution.id, courseId: course.id,
    title: "Tarea de prueba aislada", instructions: "Explica cómo resolviste la suma.", isPublished: true, allowLate: false,
    dueDate: new Date(Date.now() + 86_400_000) } });
  // Only the real login, auth, session, Server Action and database are used. No mocks or bypass.
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  const href = `/dashboard/aula/${course.id}/tareas/${assignment.id}`;
  await page.goto(href);
  return { assignment, student, href };
}

async function prepare(page: Page, answer: string) {
  await page.getByLabel("Tu respuesta", { exact: true }).fill(answer);
  await page.getByRole("button", { name: "Revisar respuesta", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Revisa y entrega", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continuar a entrega", exact: true })).toHaveCount(0);
}

test("success persists through the real action, refresh and reload", async ({ page }, info) => {
  const f = await fixture(page);
  const answer = "27 + 15 = 42. Sumé unidades y decenas.";
  await prepare(page, answer);
  await page.screenshot({ path: info.outputPath("single-confirmation.png"), fullPage: true });
  const response = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === f.href);
  await page.getByRole("button", { name: "Entregar tarea", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect.poll(async () => (await db.submission.findFirst({ where: { assignmentId: f.assignment.id, studentId: f.student.id } }))?.content).toBe(answer);
  const stored = await db.submission.findFirstOrThrow({ where: { assignmentId: f.assignment.id, studentId: f.student.id } });
  expect(stored.status).toBe("SUBMITTED");
  expect(await db.submissionRevision.count({ where: { submissionId: stored.id } })).toBe(0);
  await info.attach("database-receipt", { body: JSON.stringify({ status: stored.status, content: stored.content, submittedAt: stored.submittedAt }), contentType: "application/json" });
  await page.screenshot({ path: info.outputPath("after-real-post.png"), fullPage: true });
  await expect(page.getByRole("heading", { name: "Tarea entregada", exact: true })).toBeVisible();
  await expect(page.getByLabel("Tu respuesta", { exact: true })).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tarea entregada", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Entrega confirmada" }).getByText(answer, { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("delivered-after-reload.png"), fullPage: true });
  await expect(page.getByLabel("Tu respuesta", { exact: true })).not.toBeVisible();
  const success = page.getByRole("region", { name: "Entrega confirmada" });
  const back = success.getByRole("link", { name: "Volver a mis tareas", exact: true });
  await expect(back).toHaveAttribute("href", f.href.slice(0, f.href.lastIndexOf("/")));
  await expect(back).toHaveClass(/bg-\[var\(--blue\)\]/);
  await expect(success.getByRole("button", { name: "Editar entrega", exact: true })).toHaveClass(/bg-white/);
  await expect(success.getByRole("link", { name: "Ver mi entrega", exact: true })).toHaveCount(0);
  await back.click();
  await expect(page).toHaveURL(f.href.slice(0, f.href.lastIndexOf("/")));
  await page.goto(f.href);
  await expect(page.getByRole("heading", { name: "Tarea entregada", exact: true })).toBeVisible();
});

test("real rejection preserves the draft; explicit correction succeeds", async ({ page }, info) => {
  const f = await fixture(page);
  await page.locator('input[type="file"]').setInputFiles({ name: "respuesta.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% Isolated assignment fixture\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF") });
  await expect(page.getByRole("list", { name: "Archivos listos para entregar" })).toContainText("respuesta.pdf");
  await page.getByLabel("Enlace a tu trabajo (opcional)").fill("https://localhost");
  await prepare(page, "Mi borrador se conserva si el servidor rechaza el enlace.");
  await page.getByRole("button", { name: "Entregar tarea", exact: true }).click();
  const alert = page.getByRole("alert").filter({ hasText: "El enlace no es válido" });
  await expect(alert).toBeVisible();
  await expect(alert).toBeFocused();
  expect(await db.submission.count({ where: { assignmentId: f.assignment.id } })).toBe(0);
  expect(await db.storageAsset.count({ where: { assignmentId: f.assignment.id, submissionId: null, confirmedAt: { not: null } } })).toBe(1);
  await page.screenshot({ path: info.outputPath("server-rejection-draft-preserved.png"), fullPage: true });
  await page.getByRole("button", { name: "Volver a mi respuesta", exact: true }).click();
  await expect(page.getByLabel("Tu respuesta", { exact: true })).toHaveValue("Mi borrador se conserva si el servidor rechaza el enlace.");
  await expect(page.getByLabel("Enlace a tu trabajo (opcional)")).toHaveValue("https://localhost");
  await expect(page.getByRole("list", { name: "Archivos listos para entregar" })).toContainText("respuesta.pdf");
  await page.getByLabel("Enlace a tu trabajo (opcional)").fill("");
  await page.getByRole("button", { name: "Revisar respuesta", exact: true }).click();
  await page.getByRole("button", { name: "Entregar tarea", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tarea entregada", exact: true })).toBeVisible();
  expect(await db.submission.count({ where: { assignmentId: f.assignment.id, status: "SUBMITTED" } })).toBe(1);
  expect(await db.storageAsset.count({ where: { assignmentId: f.assignment.id, submissionId: { not: null } } })).toBe(1);
});

test("double click and repeated submit while the real transaction waits write only once", async ({ page }) => {
  const f = await fixture(page);
  await prepare(page, "Una sola entrega aunque pulse dos veces.");
  let requests = 0;
  page.on("request", r => { if (r.method() === "POST" && new URL(r.url()).pathname === f.href) requests++; });
  let unlock!: () => void, locked!: () => void;
  const release = new Promise<void>(r => { unlock = r; });
  const acquired = new Promise<void>(r => { locked = r; });
  const transaction = db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "assignments" WHERE "id" = ${f.assignment.id} FOR UPDATE`;
    locked();
    await release;
  }, { timeout: 30_000 });
  await acquired;
  try {
    const button = page.getByRole("button", { name: "Entregar tarea", exact: true });
    await button.evaluate((element: HTMLButtonElement) => { element.click(); element.click(); element.form!.requestSubmit(); });
    await expect(page.getByRole("button", { name: "Entregando…", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Entregando…", exact: true }).evaluate((element: HTMLButtonElement) => element.form!.requestSubmit());
    await expect.poll(() => requests).toBe(1);
    expect(await db.submission.count({ where: { assignmentId: f.assignment.id } })).toBe(0);
  } finally {
    unlock();
    await transaction;
  }
  await expect(page.getByRole("heading", { name: "Tarea entregada", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tarea entregada", exact: true })).toBeVisible();
  const stored = await db.submission.findFirstOrThrow({ where: { assignmentId: f.assignment.id } });
  expect(await db.submissionRevision.count({ where: { submissionId: stored.id } })).toBe(0);
  expect(requests).toBe(1);
});

test("editing is explicit; cancel does not write and updating creates one revision", async ({ page }, info) => {
  const f = await fixture(page);
  await prepare(page, "Respuesta original.");
  await page.getByRole("button", { name: "Entregar tarea", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tarea entregada", exact: true })).toBeVisible();
  const original = await db.submission.findFirstOrThrow({ where: { assignmentId: f.assignment.id } });
  await page.getByRole("button", { name: "Editar entrega", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edita tu entrega", exact: true })).toBeFocused();
  await page.getByLabel("Tu respuesta", { exact: true }).fill("Cambio cancelado.");
  await page.getByRole("button", { name: "Cancelar edición", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tarea entregada", exact: true })).toBeVisible();
  expect((await db.submission.findUniqueOrThrow({ where: { id: original.id } })).content).toBe("Respuesta original.");
  expect(await db.submissionRevision.count({ where: { submissionId: original.id } })).toBe(0);
  await page.getByRole("button", { name: "Editar entrega", exact: true }).click();
  await expect(page.getByLabel("Tu respuesta", { exact: true })).toHaveValue("Respuesta original.");
  await prepare(page, "Respuesta corregida.");
  await expect(page.getByRole("button", { name: "Entregar tarea", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Actualizar entrega", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tarea entregada", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tarea entregada", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Entrega confirmada" }).getByText("Respuesta corregida.", { exact: true })).toBeVisible();
  expect((await db.submission.findUniqueOrThrow({ where: { id: original.id } })).content).toBe("Respuesta corregida.");
  const revisions = await db.submissionRevision.findMany({ where: { submissionId: original.id } });
  expect(revisions.map(r => r.content)).toEqual(["Respuesta original."]);
  await page.screenshot({ path: info.outputPath("updated-delivery.png"), fullPage: true });
});

test("a saved link closes editing; review remains read-only and the main CTA leaves the task", async ({ page }, info) => {
  const f = await fixture(page);
  await page.getByLabel("Enlace a tu trabajo (opcional)").fill("https://example.test/respuesta");
  await prepare(page, "Respuesta con enlace.");
  await page.getByRole("button", { name: "Entregar tarea", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tarea entregada", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Editar entrega", exact: true })).toHaveCount(0);
  const review = page.getByRole("link", { name: "Revisar entrega", exact: true });
  await expect(review).toHaveClass(/bg-white/);
  await review.click();
  await expect(page.getByRole("heading", { name: "Tarea entregada", exact: true })).toBeVisible();
  await expect(page.getByLabel("Tu respuesta", { exact: true })).not.toBeVisible();
  await expect(page.getByRole("link", { name: "https://example.test/respuesta", exact: true })).toHaveAttribute("rel", "noopener noreferrer");
  await page.screenshot({ path: info.outputPath("read-only-delivery.png"), fullPage: true });
  const stored = await db.submission.findFirstOrThrow({ where: { assignmentId: f.assignment.id } });
  expect(stored.fileUrls).toEqual(["https://example.test/respuesta"]);
  expect(await db.submissionRevision.count({ where: { submissionId: stored.id } })).toBe(0);
  await page.getByRole("link", { name: "Volver a mis tareas", exact: true }).click();
  await expect(page).toHaveURL(f.href.slice(0, f.href.lastIndexOf("/")));
});

test("cancel and reopen retain uploaded files and do not resurrect a discarded file", async ({ page }) => {
  const f = await fixture(page);
  await prepare(page, "Entrega original sin archivo.");
  await page.getByRole("button", { name: "Entregar tarea", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tarea entregada", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Editar entrega", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "borrador.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% Isolated cancelled-edit fixture\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF") });
  const ready = page.getByRole("list", { name: "Archivos listos para entregar" });
  await expect(ready).toContainText("borrador.pdf");
  await page.getByRole("button", { name: "Cancelar edición", exact: true }).click();
  await page.getByRole("button", { name: "Editar entrega", exact: true }).click();
  await expect(ready).toContainText("borrador.pdf");
  await page.getByRole("button", { name: "Quitar borrador.pdf", exact: true }).click();
  await expect(ready).toHaveCount(0);
  await page.getByRole("button", { name: "Cancelar edición", exact: true }).click();
  await page.getByRole("button", { name: "Editar entrega", exact: true }).click();
  await expect(ready).toHaveCount(0);
  await prepare(page, "Entrega actualizada sin archivo eliminado.");
  await page.getByRole("button", { name: "Actualizar entrega", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tarea entregada", exact: true })).toBeVisible();
  const stored = await db.submission.findFirstOrThrow({ where: { assignmentId: f.assignment.id } });
  expect(stored.content).toBe("Entrega actualizada sin archivo eliminado.");
  expect(await db.storageAsset.count({ where: { submissionId: stored.id } })).toBe(0);
  expect(await db.submissionRevision.count({ where: { submissionId: stored.id } })).toBe(1);
});
