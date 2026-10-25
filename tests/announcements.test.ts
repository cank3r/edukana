import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { announcementAudienceLabel, announcementRecipientWhere, announcementVisibilityWhere, canOpenRelatedCourse, canSeeAnnouncementAudienceDetails, canTargetAnnouncementPeople, externalAnnouncementUrlSchema, isMentionInsideAudience, recipientCourseIds, safeAnnouncementHref, validateAnnouncementUpload } from "../src/lib/announcements";
import { courseWhereForScope, resolveCourseWriteScope } from "../src/lib/course-scope";
import { assertOrganizationalUnitTenantBoundary, organizationalUnitMembershipWhere, organizationalUnitWhere, OrganizationalUnitPolicyError } from "../src/lib/organizational-units";
import type { Capability } from "../src/lib/capabilities";


const root = process.cwd();

test("solo acepta enlaces https y mailto", () => {
  for (const value of ["https://edukana.com/aviso", "mailto:soporte@edukana.com", ""]) assert.equal(externalAnnouncementUrlSchema.safeParse(value).success, true);
  for (const value of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "http://inseguro.test", "//evil.test"]) {
    assert.equal(externalAnnouncementUrlSchema.safeParse(value).success, false);
    assert.equal(safeAnnouncementHref(value), null);
  }
});

test("el render de anuncios no ejecuta HTML arbitrario", () => {
  const renderer = readFileSync(join(root, "src", "components", "dashboard", "AnnouncementContent.tsx"), "utf8");
  assert.doesNotMatch(renderer, /dangerouslySetInnerHTML|innerHTML\s*=/);
  assert.match(renderer, /safeAnnouncementHref/);
});

test("restringe fotos y videos por MIME y tamaño", () => {
  assert.equal(validateAnnouncementUpload({ name: "foto.jpg", type: "image/jpeg", size: 1024 }), null);
  assert.equal(validateAnnouncementUpload({ name: "video.mp4", type: "video/mp4", size: 1024 }), null);
  assert.match(validateAnnouncementUpload({ name: "x.svg", type: "image/svg+xml", size: 1024 }) ?? "", /no permitido/);
  assert.match(validateAnnouncementUpload({ name: "x.mp4", type: "video/mp4", size: 101 * 1024 * 1024 }) ?? "", /100 MB/);
});

test("construye filtros cerrados al tenant y a todos los tipos de destinatario", () => {
  const where = announcementRecipientWhere({ institutionId: "tenant-a", userIds: ["user-a"], roles: ["STUDENT"], courseIds: ["course-a"], unitIds: ["unit-a"] });
  assert.equal(where.institutionId, "tenant-a");
  const serialized = JSON.stringify(where);
  for (const value of ["user-a", "STUDENT", "course-a", "unit-a"]) assert.match(serialized, new RegExp(value));
  assert.doesNotMatch(serialized, /tenant-b/);
});

test("rechaza menciones fuera de la audiencia", () => {
  const mentioned = { id: "user-b", role: "TEACHER" as const, courseIds: ["course-b"], unitIds: ["unit-b"] };
  assert.equal(isMentionInsideAudience(mentioned, { institution: false, roles: ["STUDENT"], courseIds: ["course-a"], userIds: ["user-a"], unitIds: ["unit-a"] }), false);
  assert.equal(isMentionInsideAudience(mentioned, { institution: false, roles: [], courseIds: [], userIds: ["user-b"], unitIds: [] }), true);
});

test("las rutas y la acción validan tenant, confirmación y propiedad", () => {
  const action = readFileSync(join(root, "src", "app", "dashboard", "actions.ts"), "utf8");
  const upload = readFileSync(join(root, "src", "app", "api", "announcement-assets", "route.ts"), "utf8");
  const asset = readFileSync(join(root, "src", "app", "api", "assets", "[assetId]", "route.ts"), "utf8");
  assert.match(action, /institutionId: user\.institutionId/);
  assert.match(action, /confirmedAt: \{ not: null \}/);
  assert.match(action, /uploaderId: user\.id/);
  assert.match(upload, /userHasCapability\(user, "announcement\.publish"\)/);
  assert.match(asset, /objectPath\.startsWith\(`\$\{user\.institutionId\}\//);
});


test("publisher docente solo ve anuncios propios o dirigidos y cursos asignados", () => {
  const recipient = { institutionId: "tenant-a", userIds: ["teacher-a"], roles: ["TEACHER" as const], courseIds: ["course-a"], unitIds: [] };
  const where = announcementVisibilityWhere(recipient, "teacher-a", { canManage: false, canPublish: true });
  assert.equal(where.institutionId, "tenant-a");
  const serialized = JSON.stringify(where);
  assert.match(serialized, /"authorId":"teacher-a"/);
  assert.match(serialized, /"course-a"/);
  assert.notDeepEqual(where, { institutionId: "tenant-a" });

  const scope = resolveCourseWriteScope({ id: "teacher-a", role: "TEACHER" }, new Set<Capability>(["course.view", "course.manage", "announcement.publish"]));
  assert.deepEqual(courseWhereForScope("tenant-a", scope), { institutionId: "tenant-a", teacherId: "teacher-a" });
});

test("destinatario común nunca recibe el desglose de co-destinatarios", () => {
  assert.equal(canSeeAnnouncementAudienceDetails({ id: "recipient", canManage: false }, "author"), false);
  assert.equal(announcementAudienceLabel(["Persona Uno", "Curso Privado", "Unidad Confidencial"], false), "Para ti");
  assert.equal(canSeeAnnouncementAudienceDetails({ id: "author", canManage: false }, "author"), true);
});

test("targeting individual exige publicar y ver personas", () => {
  assert.equal(canTargetAnnouncementPeople(new Set<Capability>(["announcement.publish"])), false);
  assert.equal(canTargetAnnouncementPeople(new Set<Capability>(["people.view"])), false);
  assert.equal(canTargetAnnouncementPeople(new Set<Capability>(["announcement.publish", "people.view"])), true);
});

test("un manager conserva vista completa dentro de su tenant", () => {
  const recipient = { institutionId: "tenant-a", userIds: ["admin"], roles: ["ADMIN" as const], courseIds: [], unitIds: [] };
  assert.deepEqual(announcementVisibilityWhere(recipient, "admin", { canManage: true, canPublish: true }), { institutionId: "tenant-a" });
  assert.equal(canSeeAnnouncementAudienceDetails({ id: "admin", canManage: true }, "other-author"), true);
  assert.equal(announcementAudienceLabel(["Docentes", "Ciencias"], true), "Docentes · Ciencias");
});

test("política de unidades bloquea entidades cross-tenant", () => {
  assert.deepEqual(organizationalUnitWhere("tenant-a", "unit-from-request"), { id: "unit-from-request", institutionId: "tenant-a" });
  assert.deepEqual(organizationalUnitMembershipWhere("tenant-a", "unit-b", "user-b"), { institutionId: "tenant-a", unitId: "unit-b", userId: "user-b", unit: { institutionId: "tenant-a" }, user: { institutionId: "tenant-a" } });
  assert.doesNotThrow(() => assertOrganizationalUnitTenantBoundary("tenant-a", [{ id: "unit-a", institutionId: "tenant-a" }, { id: "user-a", institutionId: "tenant-a" }]));
  assert.throws(() => assertOrganizationalUnitTenantBoundary("tenant-a", [{ id: "unit-b", institutionId: "tenant-b" }]), OrganizationalUnitPolicyError);
});

test("destinatarios incluyen matrículas y cursos impartidos del mismo tenant", () => {
  assert.deepEqual(recipientCourseIds([
    { enrollments: [{ courseId: "enrolled-a" }, { courseId: "shared" }], taughtCourses: [{ id: "taught-a" }, { id: "shared" }] },
  ]), ["enrolled-a", "shared", "taught-a"]);
  const source = readFileSync(join(root, "src", "lib", "announcement-data.ts"), "utf8");
  assert.match(source, /taughtCourses: \{ where: \{ institutionId: identity\.institutionId \}/);
  assert.match(source, /courseIds: recipientCourseIds\(people\)/);
});

test("solo cursos realmente legibles generan enlaces y PARENT nunca enlaza Aula", () => {
  const readable = new Set(["course-readable"]);
  assert.equal(canOpenRelatedCourse("TEACHER", readable, "course-readable"), true);
  assert.equal(canOpenRelatedCourse("TEACHER", readable, "course-private"), false);
  assert.equal(canOpenRelatedCourse("PARENT", readable, "course-readable"), false);
  const parentPortal = readFileSync(join(root, "src", "app", "dashboard", "hijos", "page.tsx"), "utf8");
  assert.doesNotMatch(parentPortal, /href=\{`\/dashboard\/aula\/\$\{course\.id\}`\}/);
});



test("panel guiado evita Ctrl y exige revisión antes de publicar", () => {
  const composer = readFileSync(join(root, "src", "components", "dashboard", "AnnouncementComposer.tsx"), "utf8");
  assert.match(composer, /function GuidedPicker/);
  assert.match(composer, /type="search"/);
  assert.match(composer, /Revisar y publicar/);
  assert.match(composer, /Publicar aviso/);
  assert.match(composer, /Seguir editando/);
  assert.match(composer, /Revisa antes de publicar/);
  assert.match(composer, /Vas a publicar este aviso para:/);
  assert.match(composer, /Opciones avanzadas/);
  assert.doesNotMatch(composer, /Ctrl\s*\/\s*⌘/);
  assert.match(composer, /Botón o enlace destacado/);
  assert.match(composer, /Insertar una mención en el mensaje/);
});
