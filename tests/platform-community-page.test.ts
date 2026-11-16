import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { loadWithStubs } = createRequire(import.meta.url)("./helpers/load-with-stubs.cjs");
Object.assign(globalThis, { React });
let role: "ADMIN" | "STUDENT";
let empty: boolean;
let detailReads: number;
const announcement = {
  id: "notice-fixture", authorId: "author-fixture", title: "Aviso de prueba", content: "Mensaje visible",
  externalUrl: "javascript:alert(1)", audienceInstitution: false, audience: "ROLE", isPinned: true,
  publishedAt: new Date("2026-10-01T12:00:00Z"), author: { name: "Autor de prueba", role: "TEACHER" },
  mentions: [], assets: [],
};
const pageModule = loadWithStubs("src/app/dashboard/comunidad/page.tsx", {
  "@/lib/auth": { auth: async () => ({ user: { id: "viewer-fixture", institutionId: "institution-fixture", role } }) },
  "@/lib/authorization": { getEffectiveCapabilities: async () => new Set(role === "ADMIN" ? ["announcement.manage"] : []) },
  "@/lib/announcement-data": { getCommunityAnnouncementWhere: async () => ({ institutionId: "institution-fixture" }) },
  "@/lib/db": { db: {
    announcement: { findMany: async ({ select }: { select: Record<string, unknown> }) => {
      if (select.roleTargets) {
        detailReads++;
        return [{ id: announcement.id, roleTargets: [], courseTargets: [], unitTargets: [],
          userTargets: [{ user: { name: "Destinatario reservado" } }] }];
      }
      return empty ? [] : [announcement];
    } },
    announcementRelatedCourse: { findMany: async () => [] },
  } },
  "@/components/dashboard/AnnouncementComposer": { AnnouncementComposer: () => null },
  "@/components/dashboard/AnnouncementFlash": { AnnouncementFlash: () => null },
  "./AnnouncementOwnerTools": { AnnouncementOwnerTools: () => React.createElement("button", null, "Editar aviso") },
});
beforeEach(() => { role = "STUDENT"; empty = false; detailReads = 0; });

test("Community exposes only the route component, without unsupported page exports", () => {
  assert.deepEqual(Object.keys(pageModule), ["default"]);
  assert.equal(typeof pageModule.default, "function");
});

test("Community still renders its local card without exposing audience details or unsafe links", async () => {
  const html = renderToStaticMarkup(await pageModule.default());
  assert.match(html, /<article\b/);
  assert.match(html, /Aviso de prueba/);
  assert.match(html, /Mensaje visible/);
  assert.match(html, /Para ti/);
  assert.doesNotMatch(html, /Destinatario reservado|Editar aviso|javascript:|Abrir enlace/);
  assert.equal(detailReads, 0);
});

test("Community preserves manager audience details and edit controls", async () => {
  role = "ADMIN";
  const html = renderToStaticMarkup(await pageModule.default());
  assert.match(html, /Destinatario reservado/);
  assert.match(html, /Editar aviso/);
  assert.equal(detailReads, 1);
});

test("Community preserves its recipient empty state", async () => {
  empty = true;
  const html = renderToStaticMarkup(await pageModule.default());
  assert.match(html, /Todavía no hay avisos/);
  assert.doesNotMatch(html, /<article\b|Editar aviso/);
  assert.equal(detailReads, 0);
});
