import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url);
const { loadWithStubs } = require("./helpers/load-with-stubs.cjs");
// The node TSX runner uses classic JSX; Next compiles the production files with the automatic runtime.
Object.assign(globalThis, { React });
const { BrandingForm } = loadWithStubs("src/components/platform/BrandingForm.tsx", {
  "@/server/actions/platform-branding": { saveOperatorBrandAction: async () => ({ ok: true, message: "" }) },
});
const { AnnouncementForm } = loadWithStubs("src/app/operador/avisos/AnnouncementForm.tsx", {
  "next/navigation": { useRouter: () => ({ push() {}, refresh() {} }) },
  "./actions": { saveAnnouncementAction: async () => ({ ok: true }), endAnnouncementAction: async () => ({ ok: true }) },
});
function explicitLabel(html: string, name: string) {
  const labels = [...html.matchAll(/<label\b[^>]*for="([^"]+)"[^>]*>([^<]*)<\/label>/g)];
  const target = labels.find((label) => label[2] === name);
  assert.ok(target, `Expected standalone exact label: ${name}`);
  const id = target[1];
  assert.match(html, new RegExp(`<(?:input|textarea|select)\\b[^>]*id="${id}"`));
  return id;
}
test("branding renders concise labels with help linked as descriptions, not label content", () => {
  const html = renderToStaticMarkup(React.createElement(BrandingForm, { institutionId: "a", values: {
    name: "Institución A", logoUrl: null, brandColor: "#123456", domain: null, hideEdukanaBrand: false,
  } }));
  for (const name of ["Logo", "Color principal", "Dominio de entrada", "Confirmar cambio de dominio"]) {
    const id = explicitLabel(html, name);
    assert.ok(html.includes(`aria-describedby="${id}-help"`));
    assert.ok(html.includes(`id="${id}-help"`));
  }
});
test("announcement editing retains exact labels independently of textarea content and option names", () => {
  const html = renderToStaticMarkup(React.createElement(AnnouncementForm, { initial: {
    id: "notice", title: "Aviso", body: "Texto anterior", level: "INFO", audience: "ALL",
    startsAt: "2026-10-10T00:00:00.000Z", endsAt: null,
  } }));
  for (const name of ["Mensaje", "Importancia", "Quién lo verá"]) explicitLabel(html, name);
  assert.ok(html.includes("Texto anterior"));
});

const { BillingSection } = loadWithStubs("src/components/platform/BillingSection.tsx", {
  "next/navigation": { notFound: () => { throw new Error("Not found"); } },
  "@/server/platform/operator-session": { getOperatorEmail: async () => "operator@example.test" },
  "@/server/platform/limits": { getInstitutionBilling: async () => ({ institution: { name: "Institución A" }, usage: null,
    invoices: [{ id: "invoice", status: "OPEN", periodStart: new Date("2026-10-01"), periodEnd: new Date("2026-11-01"),
      dueDate: new Date("2026-11-01"), amountCents: 100, currency: "DOP" }] }) },
  "@/server/platform/plans": { listPlatformPlans: async () => [{ code: "PRO", name: "Profesional", active: true }] },
  "@/app/operador/planes/actions": { billingAction: async () => ({ ok: true, message: "" }) },
});
test("billing renders Plan and Método labels outside their selectable option text", async () => {
  const html = renderToStaticMarkup(await BillingSection({ institutionId: "a" }));
  explicitLabel(html, "Plan"); explicitLabel(html, "Método");
  assert.ok(html.includes("Profesional")); assert.ok(html.includes("transferencia"));
});
