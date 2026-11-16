import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import React, { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const { loadWithStubs } = require("./helpers/load-with-stubs.cjs");
Object.assign(globalThis, { React });
type Element = ReactElement<Record<string, unknown>>;
let session: { user: { id: string; institutionId: string; role: string } } | null;
let capabilities: Set<string>;
let capabilityReads: unknown[][];
let counts: string[];
let pending: number;
let databaseReads: number;
function Link({ href, children, ...props }: { href: string; children?: ReactNode }) {
  return React.createElement("a", { ...props, href }, children);
}
function ImportPeople() { return React.createElement("div", {}, "Fixture importación"); }
function InvitePending({ pending }: { pending: number }) { return React.createElement("div", {}, `Pendientes: ${pending}`); }
const { default: AccessPage }: typeof import("../src/app/dashboard/gestion/accesos/page") = loadWithStubs(
  "src/app/dashboard/gestion/accesos/page.tsx", {
    "next/link": Link,
    "next/navigation": { redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } },
    "@/lib/auth": { auth: async () => session },
    "@/lib/authorization": { getEffectiveCapabilities: async (...args: unknown[]) => {
      capabilityReads.push(args); return capabilities;
    } },
    "@/lib/db": { db: new Proxy({}, { get() {
      databaseReads++; throw new Error("Access page must not query a duplicate people directory");
    } }) },
    "@/server/people/invitations": { countPendingInvitations: async (institutionId: string) => {
      counts.push(institutionId); return pending;
    } },
    "./AccessTools": { ImportPeople, InvitePending },
  },
);
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
function links(tree: ReactNode) {
  return elements(tree).filter((element) => element.type === Link);
}
function page(params: { q?: string | string[]; volver?: string | string[] } = {}) {
  return AccessPage({ searchParams: Promise.resolve(params) });
}
beforeEach(() => {
  session = { user: { id: "admin-test", institutionId: "institution-test", role: "ADMIN" } };
  capabilities = new Set(["people.manage"]);
  capabilityReads = []; counts = []; pending = 3; databaseReads = 0;
});

test("access page requires a session and people.manage before reading pending invitations", async () => {
  session = null;
  await assert.rejects(() => page(), /REDIRECT:\/login/);
  assert.deepEqual(capabilityReads, []);
  session = { user: { id: "coordinator-test", institutionId: "institution-test", role: "COORDINATOR" } };
  capabilities = new Set(["people.view"]);
  await assert.rejects(() => page(), /REDIRECT:\/dashboard$/);
  assert.deepEqual(counts, []);
  assert.equal(databaseReads, 0);
});

test("access page counts pending for the current institution and renders each workflow once without another directory", async () => {
  const tree = await page();
  const nodes = elements(tree);
  assert.deepEqual(capabilityReads, [["institution-test", "ADMIN"]]);
  assert.deepEqual(counts, ["institution-test"]);
  assert.equal(databaseReads, 0);
  assert.equal(nodes.filter((element) => element.type === ImportPeople).length, 1);
  const invitation = nodes.filter((element) => element.type === InvitePending);
  assert.equal(invitation.length, 1);
  assert.equal(invitation[0].props.pending, 3);
  assert.equal(nodes.some((element) => element.type === "form" && element.props.role === "search"), false);
  assert.equal(links(tree).some((link) => String(link.props.href).includes("/personas/")), false);
});

test("zero pending still reaches the invitation component as zero without a success claim", async () => {
  pending = 0;
  const tree = await page();
  const invitation = elements(tree).find((element) => element.type === InvitePending)!;
  assert.equal(invitation.props.pending, 0);
  assert.doesNotMatch(renderToStaticMarkup(tree), /Todos pueden entrar|Correos entregados|Invitaciones recibidas/);
});

test("back to the directory retains all allowed filters and drops unexpected query fields", async () => {
  const context = "/dashboard/gestion?q=Ana&rol=estudiantes&estado=suspendidos&pagina=3&agregar=1";
  const tree = await page({ volver: context });
  const back = links(tree).find((link) => String(link.props.children).includes("Volver a Personas"))!;
  assert.ok(back);
  assert.equal(back.props.href, "/dashboard/gestion?q=Ana&rol=estudiantes&estado=suspendidos&pagina=3");
});

test("unsafe or repeated return query values cannot redirect away from the people directory", async () => {
  for (const volver of ["https://example.test/private", "//example.test", ["/dashboard/gestion", "https://example.test"]]) {
    const tree = await page({ volver });
    const back = links(tree).find((link) => String(link.props.children).includes("Volver a Personas"))!;
    assert.equal(back.props.href, "/dashboard/gestion");
  }
});

test("legacy search sends the user to the single directory rather than querying or rendering another list", async () => {
  const tree = await page({ q: " Ana Pérez " });
  const search = links(tree).find((link) => link.props.children === "Buscar en Personas")!;
  assert.ok(search);
  assert.equal(new URL(String(search.props.href), "https://local.test").searchParams.get("q"), "Ana Pérez");
  assert.equal(databaseReads, 0);
  assert.deepEqual(counts, ["institution-test"]);
});

test("suspended people have an explicit directory destination and CSV template uses fictitious contact data", async () => {
  const tree = await page();
  assert.ok(links(tree).some((link) => link.props.href === "/dashboard/gestion?estado=suspendidos"));
  const template = elements(tree).find((element) => element.type === "a" && element.props.download)!;
  assert.ok(template);
  const csv = decodeURIComponent(String(template.props.href).split(",").slice(1).join(","));
  assert.match(csv, /Nombre,Correo,Rol/);
  assert.match(csv, /@ejemplo\.invalid|@example\.invalid/);
});
