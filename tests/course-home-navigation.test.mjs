import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { build } from "esbuild";
import { renderToStaticMarkup } from "react-dom/server";

// La portada del curso real (`/dashboard/aula/[courseId]`) con sesión, permisos y base de datos simulados.
// Sustituye las pruebas de la portada antigua (tareas, exámenes y revisión en línea): la portada solo enlaza
// a las pantallas de cada área, nunca lee evaluaciones ni muestra herramientas de gestión al estudiante.
const require = createRequire(import.meta.url);
const fixture = {};
let coursePage;
const boundaries = {
  "@/lib/auth": "export const auth = async () => ({ user: fixture.user });",
  "@/lib/authorization": "export const getEffectiveCapabilities = async () => fixture.capabilities;",
  "@/lib/db": "export const db = new Proxy({}, { get: (_target, key) => fixture.db(String(key)) });",
  "next/navigation": `export const notFound = () => { throw new Error("NOT_FOUND"); };
    export const redirect = () => { throw new Error("REDIRECT"); };`,
  "next/link": `import { createElement } from "react";
    export default function Link(props) { return createElement("a", props, props.children); }`,
  "@/components/dashboard/AcademicForms": `import { createElement } from "react";
    export function ScheduleForm() { return createElement("p", null, "SCHEDULE_FORM"); }`,
};
// Permisos por defecto de cada rol (src/lib/capabilities.ts).
const ROLE_CAPABILITIES = {
  STUDENT: ["student.portal.view", "course.view", "course.participate", "schedule.view"],
  TEACHER: ["course.view", "course.manage", "course.roster.view", "schedule.view"],
  PARENT: ["child.portal.view", "child.academics.view", "child.attendance.view", "child.schedule.view", "child.announcements.view"],
};

before(async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("../src/app/dashboard/aula/[courseId]/page.tsx", import.meta.url))],
    bundle: true, write: false, format: "cjs", platform: "node", packages: "external",
    plugins: [{ name: "course-home-boundaries", setup(build) {
      build.onResolve({ filter: /.*/ }, args => Object.hasOwn(boundaries, args.path)
        ? { path: args.path, namespace: "course-home-test" } : undefined);
      build.onLoad({ filter: /.*/, namespace: "course-home-test" }, args => ({
        loader: "js", contents: boundaries[args.path], resolveDir: fileURLToPath(new URL("..", import.meta.url)),
      }));
    } }],
  });
  const compiledModule = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, {
    module: compiledModule, exports: compiledModule.exports, require, fixture, console, Date,
  });
  coursePage = compiledModule.exports.default;
});

function as(role, id = role === "TEACHER" ? "teacher" : role.toLowerCase()) {
  fixture.user = { id, role, institutionId: "institution" };
  fixture.capabilities = new Set(ROLE_CAPABILITIES[role]);
}

beforeEach(() => {
  as("STUDENT");
  fixture.enrollmentStatus = "ACTIVE";
  fixture.isPublic = false;
  fixture.queries = [];
  const models = {
    course: { findFirst: async (args) => {
      fixture.queries.push({ model: "course", args });
      const where = args.where;
      if (where.id !== "course" || where.institutionId !== "institution") return null;
      if (where.teacherId && where.teacherId !== "teacher") return null;
      if (where.enrollments && (where.enrollments.some.studentId !== "student" ||
        !where.enrollments.some.status.in.includes(fixture.enrollmentStatus))) return null;
      return {
        id: "course", name: "Curso de prueba", code: "CUR", description: "Descripción", teacherId: "teacher",
        isPublished: true, archivedAt: null, completionThreshold: 100, isPublic: Boolean(fixture.isPublic), institution: { slug: "instituto" },
        teacher: { name: "Docente" }, period: { name: "Período" }, scheduleSlots: [],
        _count: { lessons: 1, assignments: 1, exams: 1, questionBank: 1, liveClasses: 0 },
      };
    } },
    enrollment: { findMany: async (args) => {
      fixture.queries.push({ model: "enrollment", args });
      return [{ id: "enrollment", studentId: "student", status: fixture.enrollmentStatus, progressPercent: 0,
        student: { name: "Estudiante" }, certificates: [] }];
    } },
    courseSection: { findMany: async (args) => {
      fixture.queries.push({ model: "courseSection", args });
      return [{ id: "section", title: "Capítulo", lessons: [{ id: "lesson", title: "Lección", estimatedMinutes: 10, progress: [] }] }];
    } },
  };
  // Cualquier otra lectura (exámenes, preguntas, tareas, entregas, notas) hace fallar la prueba.
  fixture.db = (model) => {
    if (!Object.hasOwn(models, model)) throw new Error(`la portada no debe leer db.${model}`);
    return models[model];
  };
});

const render = async () => renderToStaticMarkup(await coursePage({ params: Promise.resolve({ courseId: "course" }) }));
const link = (path) => new RegExp(`<a [^>]*href="/dashboard/aula/course${path}"`);
const MANAGEMENT = ["/contenido", "/estudiantes", "/preguntas", "/examenes", "/calificaciones", "/editar"];

test("estudiante: la portada enlaza a sus áreas sin leer evaluaciones ni ofrecer herramientas de gestión", async () => {
  const html = await render();
  for (const path of ["/tareas", "/presentar", "/mis-notas", "/clases", "/leccion/lesson", "/asistencia", "/certificados"]) {
    assert.match(html, link(path), path);
  }
  for (const path of MANAGEMENT) assert.doesNotMatch(html, link(path), path);
  assert.doesNotMatch(html, /SCHEDULE_FORM|<form|<textarea|<input/);
  assert.match(html, /Empezar a estudiar/);
  // Las tarjetas de cada área son destinos táctiles de al menos 44 px.
  assert.match(html, /<a href="\/dashboard\/aula\/course\/presentar" class="[^"]*min-h-20/);
  const course = fixture.queries.find((query) => query.model === "course").args.where;
  assert.equal(course.isPublished, true, "el estudiante solo abre cursos publicados");
  assert.equal(course.archivedAt, null, "ni archivados");
  const enrollment = fixture.queries.find((query) => query.model === "enrollment").args.where;
  assert.equal(enrollment.studentId, "student", "solo su propia inscripción");
});

test("estudiante: «Opinar sobre este curso» solo si el curso está en el catálogo público", async () => {
  assert.doesNotMatch(await render(), /Opinar sobre este curso/);
  fixture.isPublic = true;
  const html = await render();
  assert.match(html, /<a [^>]*href="\/catalogo\/instituto\/course#resena"[^>]*>.*Opinar sobre este curso/);
});

test("estudiante con el curso completado: aviso de solo consulta y acceso a sus resultados", async () => {
  fixture.enrollmentStatus = "COMPLETED";
  const html = await render();
  assert.match(html, /Ya completaste este curso/);
  assert.match(html, link("/presentar"));
  assert.match(html, link("/mis-notas"));
  assert.doesNotMatch(html, /SCHEDULE_FORM|<form/);
});

test("alcance: otra institución, inscripción retirada, sin permiso, tutor u otro docente no ven el curso", async () => {
  fixture.user.institutionId = "foreign";
  await assert.rejects(render, /NOT_FOUND/);
  as("STUDENT");
  fixture.enrollmentStatus = "DROPPED";
  await assert.rejects(render, /NOT_FOUND/);
  fixture.enrollmentStatus = "ACTIVE";
  fixture.capabilities = new Set();
  await assert.rejects(render, /NOT_FOUND/);
  as("PARENT");
  await assert.rejects(render, /NOT_FOUND/);
  as("TEACHER", "another-teacher");
  await assert.rejects(render, /NOT_FOUND/);
});

test("docente: ve las áreas de gestión y el horario, no las vistas del estudiante", async () => {
  as("TEACHER");
  const html = await render();
  for (const path of [...MANAGEMENT, "/tareas", "/clases", "/asistencia", "/certificados"]) assert.match(html, link(path), path);
  assert.doesNotMatch(html, link("/presentar"));
  assert.doesNotMatch(html, link("/mis-notas"));
  assert.match(html, link("/horario"), "el horario se organiza en su propia pantalla");
  assert.equal(fixture.queries.some((query) => query.model === "courseSection"), false, "el temario del estudiante no se consulta");
});
