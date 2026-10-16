import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import React, { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const { loadWithStubs } = require("./helpers/load-with-stubs.cjs");
// Match the existing Node TSX test harness; Next supplies its own JSX runtime.
Object.assign(globalThis, { React });

type Role = "ADMIN" | "SUPER_ADMIN" | "COORDINATOR" | "TEACHER" | "STUDENT" | "PARENT";
type Person = {
  id: string; name: string; email: string; phone: string | null; role: Role;
  status: "ACTIVE" | "SUSPENDED"; identity: { passwordHash: string | null } | null;
};
type Where = {
  institutionId: string; status: string; role?: { in: Role[] };
  OR?: Array<{ name?: { contains: string }; email?: { contains: string } }>;
};
type ReadArgs = {
  where: Where; orderBy: Array<{ name?: string; id?: string }>; skip: number; take: number;
};
type Element = ReactElement<Record<string, unknown>>;
type PresentedPerson = {
  id: string; name: string; hasPassword: boolean; hasIdentity?: boolean;
  detailHref?: string; isSelf: boolean;
};
let session: { user: { id: string; institutionId: string; role: Role } } | null;
let capabilities: Set<string>;
let fixtures: Person[];
let countReads: Array<{ where: Where }>;
let directoryReads: ReadArgs[];

function Link({ href, children, ...props }: { href: string; children?: ReactNode }) {
  return React.createElement("a", { ...props, href }, children);
}
function PersonAccess({ person }: { person: PresentedPerson }) {
  return React.createElement("li", { "data-person-id": person.id }, person.name);
}
function AddPerson() { return React.createElement("button", {}, "Agregar persona"); }
function selectPeople(where: Where) {
  return fixtures.filter((person) => person.status === where.status && (!where.role || where.role.in.includes(person.role)) &&
    (!where.OR || where.OR.some((condition) => {
      const text = condition.name?.contains ?? condition.email?.contains ?? "";
      const field = condition.name ? person.name : person.email;
      return field.toLowerCase().includes(text.toLowerCase());
    })));
}

const { default: PeoplePage }: typeof import("../src/app/dashboard/gestion/page") = loadWithStubs(
  "src/app/dashboard/gestion/page.tsx", {
    "next/link": Link,
    "next/navigation": { redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); } },
    "@/lib/auth": { auth: async () => session },
    "@/lib/authorization": { getEffectiveCapabilities: async () => capabilities },
    "@/lib/db": { db: { user: {
      count: async (args: { where: Where }) => { countReads.push(args); return selectPeople(args.where).length; },
      findMany: async (args: ReadArgs) => {
        directoryReads.push(args);
        return selectPeople(args.where).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
          .slice(args.skip, args.skip + args.take);
      },
    } } },
    "./accesos/AccessTools": { PersonAccess },
    "./AddPerson": { AddPerson },
  },
);

function person(index: number, overrides: Partial<Person> = {}): Person {
  return { id: `person-${String(index).padStart(3, "0")}`, name: `Persona ${String(index).padStart(3, "0")}`,
    email: `persona${index}@example.test`, phone: null, role: "STUDENT", status: "ACTIVE", identity: null, ...overrides };
}
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
function presented(tree: ReactNode) {
  return elements(tree).filter((element) => element.type === PersonAccess)
    .map((element) => element.props.person as PresentedPerson);
}
function links(tree: ReactNode) {
  return elements(tree).filter((element) => element.type === Link)
    .map((element) => ({ href: String(element.props.href), children: element.props.children }));
}
async function page(params: Record<string, string> = {}) {
  return await PeoplePage({ searchParams: Promise.resolve(params) });
}

beforeEach(() => {
  session = { user: { id: "admin-self", institutionId: "institution-test", role: "ADMIN" } };
  capabilities = new Set(["people.view", "people.manage"]);
  fixtures = [];
  countReads = [];
  directoryReads = [];
});

test("directory rejects missing sessions and missing view permission before querying data", async () => {
  session = null;
  await assert.rejects(() => page(), /REDIRECT:\/login/);
  session = { user: { id: "person-1", institutionId: "institution-test", role: "STUDENT" } };
  capabilities.clear();
  await assert.rejects(() => page(), /REDIRECT:\/dashboard$/);
  assert.deepEqual(countReads, []);
  assert.deepEqual(directoryReads, []);
});

for (const total of [51, 101]) {
  test(`directory paginates ${total} people without overlaps or omissions and sorts name then id`, async () => {
    fixtures = Array.from({ length: total }, (_, index) => person(index, { name: "Mismo nombre" })).reverse();
    const seen: string[] = [];
    for (let current = 1; current <= Math.ceil(total / 50); current++) {
      const tree = await page({ pagina: String(current) });
      const rows = presented(tree);
      seen.push(...rows.map((row) => row.id));
      assert.equal(rows.length, Math.min(50, total - (current - 1) * 50));
      const query = directoryReads.at(-1)!;
      assert.deepEqual(query.orderBy, [{ name: "asc" }, { id: "asc" }]);
      assert.equal(query.skip, (current - 1) * 50);
      assert.equal(query.take, 50);
      assert.equal(query.where.institutionId, "institution-test");
      assert.equal(query.where.status, "ACTIVE");
      const next = links(tree).find((link) => link.children === "Siguiente");
      const previous = links(tree).find((link) => link.children === "Anterior");
      assert.equal(Boolean(next), current < Math.ceil(total / 50));
      assert.equal(Boolean(previous), current > 1);
    }
    assert.deepEqual(seen, Array.from({ length: total }, (_, index) => person(index).id));
    assert.equal(new Set(seen).size, total);
  });
}

test("directory clamps out-of-range pages after filtering and uses identical count/list scope", async () => {
  fixtures = Array.from({ length: 51 }, (_, index) => person(index, { role: "TEACHER", status: "SUSPENDED" }));
  fixtures.push(person(100, { role: "STUDENT", status: "SUSPENDED" }), person(101, { role: "TEACHER" }));
  const tree = await page({ q: " Persona ", rol: "docentes", estado: "suspendidos", pagina: "999" });
  assert.equal(presented(tree).length, 1);
  assert.equal(directoryReads[0].skip, 50);
  assert.deepEqual(countReads[0].where, directoryReads[0].where);
  assert.deepEqual(directoryReads[0].where.role, { in: ["TEACHER"] });
  assert.equal(directoryReads[0].where.status, "SUSPENDED");
  assert.equal(directoryReads[0].where.OR?.[0].name?.contains, "Persona");
});

test("directory profile and paging links preserve filters; search form resets pagination", async () => {
  fixtures = Array.from({ length: 101 }, (_, index) => person(index, { status: "SUSPENDED" }));
  const tree = await page({ q: "Persona", rol: "estudiantes", estado: "suspendidos", pagina: "2" });
  const destination = new URL(presented(tree)[0].detailHref!, "https://local.test");
  const returned = new URL(destination.searchParams.get("volver")!, "https://local.test");
  assert.equal(returned.pathname, "/dashboard/gestion");
  assert.deepEqual(Object.fromEntries(returned.searchParams), {
    q: "Persona", rol: "estudiantes", estado: "suspendidos", pagina: "2",
  });
  for (const link of links(tree).filter((entry) => ["Anterior", "Siguiente"].includes(String(entry.children)))) {
    const url = new URL(link.href, "https://local.test");
    assert.equal(url.searchParams.get("q"), "Persona");
    assert.equal(url.searchParams.get("rol"), "estudiantes");
    assert.equal(url.searchParams.get("estado"), "suspendidos");
  }
  const search = elements(tree).find((element) => element.type === "form" && element.props.role === "search")!;
  assert.ok(search);
  assert.equal(String(search.props.method ?? "get").toLowerCase(), "get");
  assert.equal(elements(search).some((element) => element.props.name === "pagina"), false);
});

test("directory passes identity presence and password presence separately without passing hashes", async () => {
  fixtures = [person(1), person(2, { identity: { passwordHash: null } }),
    person(3, { id: "admin-self", identity: { passwordHash: "fixture-hash-only" } })];
  const rows = presented(await page());
  assert.deepEqual(rows.map((row) => [row.hasIdentity, row.hasPassword]), [[false, false], [true, false], [true, true]]);
  assert.equal(rows[2].isSelf, true);
  assert.equal(JSON.stringify(rows).includes("fixture-hash-only"), false);
});

test("coordinator sees read-only profile links and no management controls or false access promise", async () => {
  session!.user.role = "COORDINATOR";
  capabilities = new Set(["people.view"]);
  fixtures = [person(1), person(2, { identity: { passwordHash: "fixture-hash-only" } })];
  const tree = await page();
  const html = renderToStaticMarkup(tree);
  assert.equal(presented(tree).length, 0);
  assert.equal(elements(tree).some((element) => element.type === AddPerson), false);
  assert.equal(links(tree).filter((link) => link.href.startsWith("/dashboard/gestion/personas/")).length, 2);
  assert.doesNotMatch(html, /Puede entrar|Invitar|Suspender|Editar datos|Importar e invitar|fixture-hash-only/);
});

test("teacher directory only links self when the current query cannot prove course relationships", async () => {
  session = { user: { id: "teacher-self", institutionId: "institution-test", role: "TEACHER" } };
  capabilities = new Set(["people.view"]);
  fixtures = [person(1, { id: "teacher-self", role: "TEACHER" }), person(2), person(3, { role: "TEACHER" })];
  const tree = await page();
  const profiles = links(tree).filter((link) => link.href.startsWith("/dashboard/gestion/personas/"));
  assert.equal(profiles.length, 1);
  assert.match(profiles[0].href, /\/personas\/teacher-self\?/);
  assert.equal(presented(tree).length, 0);
});

test("empty filtered results offer a recovery path without inventing matching people", async () => {
  const tree = await page({ q: "Nadie", rol: "docentes" });
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Sin resultados|0 personas/);
  assert.match(html, /Nadie coincide|No hay resultados/);
  assert.ok(links(tree).some((link) => link.href === "/dashboard/gestion"));
  assert.equal(presented(tree).length, 0);
});

test("read-only directory renders long names and emails in full without claiming access", async () => {
  capabilities = new Set(["people.view"]);
  const name = "Persona con nombre muy largo ".repeat(8).trim();
  const email = `${"apellido".repeat(16)}@example.test`;
  fixtures = [person(1, { name, email })];
  const html = renderToStaticMarkup(await page());
  assert.ok(html.includes(name));
  assert.ok(html.includes(email));
  assert.doesNotMatch(html, /Puede entrar/);
});
