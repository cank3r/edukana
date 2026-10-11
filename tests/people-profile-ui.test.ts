import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import React, { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PersonAccessState, PersonDetail } from "../src/server/people/detail";

const require = createRequire(import.meta.url);
const { loadWithStubs } = require("./helpers/load-with-stubs.cjs");
Object.assign(globalThis, { React });
type Role = "ADMIN" | "SUPER_ADMIN" | "COORDINATOR" | "TEACHER" | "STUDENT";
type Element = ReactElement<Record<string, unknown>>;
type Student = { id: string; name: string; email: string; phone: string | null; enrollments: [] };
// The service returns null at runtime when no token exists; exercise that case explicitly.
type DetailFixture = Omit<PersonDetail, "invitedAt"> & { invitedAt: Date | null };
let session: { user: { id: string; institutionId: string; role: Role } } | null;
let capabilities: Set<string>;
let detail: DetailFixture | null;
let student: Student | null;
let detailReads: unknown[][];
let studentReads: unknown[];
let institutionReads: unknown[];
let paymentReads: unknown[];
const payment = { id: "payment-test", concept: "Cargo privado de prueba", amount: 1250, currency: "DOP", status: "PENDING" };
const directory = "/dashboard/gestion";

function Link({ href, children, ...props }: { href: string; children?: ReactNode }) {
  return React.createElement("a", { ...props, href }, children);
}
function PersonAccess() { return React.createElement("li", {}, "Acciones de prueba"); }
function PersonEditor() { return React.createElement("button", {}, "Editar datos"); }
const stubs = {
  "next/link": Link,
  "next/navigation": {
    redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); },
    notFound: () => { throw new Error("NOT_FOUND"); },
  },
  "@/lib/auth": { auth: async () => session },
  "@/lib/authorization": { getEffectiveCapabilities: async () => capabilities },
  "@/lib/db": { db: {
    user: { findFirst: async (args: unknown) => { studentReads.push(args); return student; } },
    institution: { findUnique: async (args: unknown) => { institutionReads.push(args); return { timezone: "Etc/UTC" }; } },
    paymentConcept: { findMany: async (args: unknown) => { paymentReads.push(args); return [payment]; } },
  } },
  "@/server/people/detail": {
    getPersonDetail: async (...args: unknown[]) => { detailReads.push(args); return detail; },
  },
  "../../accesos/AccessTools": { PersonAccess, PersonEditor },
};
const { default: PersonPage }: typeof import("../src/app/dashboard/gestion/personas/[userId]/page") = loadWithStubs(
  "src/app/dashboard/gestion/personas/[userId]/page.tsx", stubs,
);
const { default: StudentDetailPage }: typeof import("../src/app/dashboard/gestion/estudiantes/[studentId]/page") = loadWithStubs(
  "src/app/dashboard/gestion/estudiantes/[studentId]/page.tsx", stubs,
);
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
function section(tree: ReactNode, label: string) {
  return elements(tree).find((element) => element.type === "section" && element.props["aria-labelledby"] === label)!;
}
function personal(volver = directory) {
  return PersonPage({ params: Promise.resolve({ userId: "student-test" }), searchParams: Promise.resolve({ volver }) });
}
function academic(volver = directory) {
  return StudentDetailPage({ params: Promise.resolve({ studentId: "student-test" }), searchParams: Promise.resolve({ volver }) });
}
beforeEach(() => {
  session = { user: { id: "admin-test", institutionId: "institution-test", role: "ADMIN" } };
  capabilities = new Set(["people.view", "people.manage"]);
  detail = {
    person: { id: "student-test", name: "Estudiante de prueba", email: "student@example.test", phone: null,
      role: "STUDENT", status: "ACTIVE", createdAt: new Date("2026-01-01T12:00:00Z") },
    access: "NOT_INVITED", hasPassword: false, invitedAt: null, teaches: [], enrollments: [], children: [], guardians: [],
  };
  student = { id: "student-test", name: "Estudiante de prueba", email: "student@example.test", phone: null, enrollments: [] };
  detailReads = []; studentReads = []; institutionReads = []; paymentReads = [];
});

test("both profiles reject absent sessions and view permission before any data read", async () => {
  session = null;
  await assert.rejects(() => personal(), /REDIRECT:\/login/);
  await assert.rejects(() => academic(), /REDIRECT:\/login/);
  session = { user: { id: "viewer-test", institutionId: "institution-test", role: "STUDENT" } };
  capabilities.clear();
  await assert.rejects(() => personal(), /REDIRECT:\/dashboard$/);
  await assert.rejects(() => academic(), /REDIRECT:\/dashboard$/);
  assert.deepEqual([detailReads, studentReads, institutionReads, paymentReads], [[], [], [], []]);
});

test("academic profile without finance permission neither queries nor renders financial data", async () => {
  capabilities = new Set(["people.view"]);
  const tree = await academic();
  assert.deepEqual(paymentReads, []);
  assert.equal(section(tree, "estudiante-cuenta"), undefined);
  assert.doesNotMatch(renderToStaticMarkup(tree), /Cargo privado de prueba|estudiante-cuenta|Sin cargos registrados/);
  assert.ok(section(tree, "estudiante-cursos"));
});

test("academic profile with finance permission scopes the query and renders its financial section", async () => {
  capabilities.add("finance.manage");
  const tree = await academic();
  assert.deepEqual(paymentReads, [{
    where: { institutionId: "institution-test", studentId: "student-test" }, orderBy: { dueDate: "desc" }, take: 10,
  }]);
  assert.ok(section(tree, "estudiante-cuenta"));
  assert.match(renderToStaticMarkup(section(tree, "estudiante-cuenta")), /Cargo privado de prueba/);
});

test("academic teacher scope restricts both student eligibility and included enrollments to own institution and courses", async () => {
  session!.user = { id: "teacher-test", institutionId: "institution-test", role: "TEACHER" };
  capabilities = new Set(["people.view"]);
  await academic();
  assert.deepEqual(studentReads, [{
    where: { id: "student-test", institutionId: "institution-test", role: "STUDENT",
      enrollments: { some: { course: { teacherId: "teacher-test", institutionId: "institution-test" } } } },
    include: { enrollments: {
      where: { course: { institutionId: "institution-test", teacherId: "teacher-test" } },
      include: { course: { select: { id: true, name: true, code: true } }, attendances: { select: { status: true } } },
      orderBy: { enrolledAt: "desc" },
    } },
  }]);
  assert.deepEqual(paymentReads, []);
});

test("missing or out-of-scope profiles stop before downstream institution or finance reads", async () => {
  capabilities.add("finance.manage");
  detail = null; student = null;
  await assert.rejects(() => personal(), /NOT_FOUND/);
  await assert.rejects(() => academic(), /NOT_FOUND/);
  assert.deepEqual(institutionReads, []);
  assert.deepEqual(paymentReads, []);
});

const accessCases: Array<{ state: PersonAccessState; text: RegExp }> = [
  { state: "HAS_PASSWORD", text: /Contraseña creada/ },
  { state: "INVITED", text: /Enlace vigente/ },
  { state: "EXPIRED", text: /Enlace no vigente/ },
  { state: "NOT_INVITED", text: /Sin contraseña/ },
  { state: "SUSPENDED", text: /Acceso suspendido/ },
];
for (const { state, text } of accessCases) {
  test(`personal profile presents ${state} without claiming login eligibility or delivered email`, async () => {
    detail!.access = state;
    detail!.hasPassword = state === "HAS_PASSWORD";
    detail!.invitedAt = state === "INVITED" ? new Date("2026-10-01T12:00:00Z") : null;
    const tree = await personal();
    const html = renderToStaticMarkup(section(tree, "ficha-acceso"));
    assert.match(html, text);
    assert.doesNotMatch(html, /Puede entrar|Correo entregado|Invitación recibida|Correo enviado/);
    if (state === "INVITED") {
      assert.match(html, /Esto no confirma que el correo haya llegado/);
      assert.match(html, /Enlace creado el/);
    }
    if (state === "SUSPENDED") {
      assert.match(html, /Cambiar el estado institucional no reactiva la cuenta/);
      const access = elements(tree).find((element) => element.type === PersonAccess)!;
      assert.equal((access.props.person as { accessRestricted: boolean }).accessRestricted, true);
    }
  });
}

test("personal profile places editing within Data and leaves access actions without a duplicate editor", async () => {
  const tree = await personal();
  const data = section(tree, "ficha-datos");
  const access = section(tree, "ficha-acceso");
  assert.equal(elements(data).filter((element) => element.type === PersonEditor).length, 1);
  assert.equal(elements(access).filter((element) => element.type === PersonEditor).length, 0);
  const actions = elements(access).find((element) => element.type === PersonAccess)!;
  assert.equal(actions.props.showEdit, false);
  assert.equal(actions.props.showSummary, false);
  const person = actions.props.person as { hasIdentity?: boolean };
  assert.equal(person.hasIdentity, undefined);
});

for (const role of ["ADMIN", "SUPER_ADMIN", "COORDINATOR"] as const) {
  test(`personal profile propagates ${role} actor role authority without changing a SUPER_ADMIN target`, async () => {
    session!.user.role = role;
    detail!.person.role = "SUPER_ADMIN";
    const tree = await personal();
    for (const component of [PersonEditor, PersonAccess]) {
      const props = elements(tree).find((element) => element.type === component)!.props;
      const person = props.person as { role: string; canManageAdminRoles: boolean };
      assert.equal(person.role, "SUPER_ADMIN");
      assert.equal(person.canManageAdminRoles, role === "ADMIN" || role === "SUPER_ADMIN");
    }
  });
}

test("personal readonly teacher delegates exact viewer scope and renders neither management nor family controls", async () => {
  session!.user = { id: "teacher-test", institutionId: "institution-test", role: "TEACHER" };
  capabilities = new Set(["people.view"]);
  detail!.guardians = [{ id: "link-test", relationship: "MOTHER", status: "ACTIVE",
    person: { id: "guardian-test", name: "Tutor privado" } }];
  const tree = await personal();
  assert.deepEqual(detailReads, [[{ id: "teacher-test", institutionId: "institution-test", role: "TEACHER" }, "student-test"]]);
  assert.equal(elements(tree).some((element) => element.type === PersonEditor || element.type === PersonAccess), false);
  assert.doesNotMatch(renderToStaticMarkup(tree), /Tutor privado|Gestionar vínculos/);
});

test("both profile back links preserve canonical filters and reject external return destinations", async () => {
  const context = `${directory}?q=Ana&rol=estudiantes&estado=suspendidos&pagina=2`;
  for (const provided of [context, "https://example.test/private"]) {
    const expected = provided === context ? context : directory;
    const personalTree = await personal(provided);
    const personalLinks = elements(personalTree).filter((element) => element.type === Link);
    assert.equal(personalLinks[0].props.href, expected);
    const academicLink = personalLinks.find((element) => String(element.props.href).includes("/gestion/estudiantes/"))!;
    assert.equal(new URL(String(academicLink.props.href), "https://local.test").searchParams.get("volver"), expected);
    const academicTree = await academic(provided);
    const back = elements(academicTree).find((element) => element.type === Link)!;
    const url = new URL(String(back.props.href), "https://local.test");
    assert.equal(url.pathname, "/dashboard/gestion/personas/student-test");
    assert.equal(url.searchParams.get("volver"), expected);
  }
});
