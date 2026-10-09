import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveEffectiveCapabilities } from "@/lib/capabilities";
import type { EdukanaRole } from "@/types/next-auth";

const require = createRequire(import.meta.url);
const { loadLegacyCoursePage } = require("./helpers/load-legacy-assignment-actions.cjs");
let role: EdukanaRole = "STUDENT";
let completed = false;
let empty = false;
let assignmentQuery: unknown;
const course = () => ({
  id: "course", teacherId: "teacher", name: "Mi curso", code: "CURSO", description: "Descripción",
  teacher: { name: "Docente" }, period: { name: "Período", startDate: new Date(), endDate: new Date() },
  sections: [], attendanceSessions: [], gradingPeriods: [], exams: [], questionBank: [], scheduleSlots: [], assets: [],
  enrollments: [{
    id: "enrollment", studentId: "student", status: completed ? "COMPLETED" : "ACTIVE", progressPercent: 0,
    student: { id: "student", name: "Estudiante", email: "student@example.test" }, certificates: [],
  }],
  // Poison data would leak if the old inline rendering ever returned.
  assignments: empty ? [] : [{
    id: "task", title: "PRIVATE-TASK-TITLE", maxScore: 10, isPublished: true,
    submissions: [{ id: "submission", content: "PRIVATE-WORK", status: "GRADED", score: 7.321, feedback: "PRIVATE-FEEDBACK" }],
  }],
});
const Page: typeof import("@/app/dashboard/aula/[courseId]/page").default = loadLegacyCoursePage({
  "@/lib/auth": { auth: async () => ({ user: { id: role === "STUDENT" ? "student" : "teacher", institutionId: "institution", role } }) },
  "@/lib/authorization": { getEffectiveCapabilities: async () => resolveEffectiveCapabilities(role) },
  "@/lib/db": { db: { course: { findFirst: async (query: { select?: object; include?: { assignments: unknown } }) => {
    if (query.select) return { teacherId: "teacher" };
    assignmentQuery = query.include?.assignments;
    return course();
  } } } },
  // The tested server-rendered section contains only a real link and explanatory text.
  "@/components/dashboard/AcademicForms": {},
});
function findSection(node: ReactNode): ReactElement | null {
  if (Array.isArray(node)) {
    for (const child of node) { const found = findSection(child); if (found) return found; }
  } else if (isValidElement<{ id?: string; children?: ReactNode }>(node)) {
    if (node.type === "section" && node.props.id === "asignaciones") return node;
    return findSection(node.props.children);
  }
  return null;
}
async function renderTasks() {
  const page = await Page({ params: Promise.resolve({ courseId: "course" }) });
  const section = findSection(page);
  assert.ok(section);
  return renderToStaticMarkup(section);
}

test("legacy course: student gets an accessible canonical task link without grades, work, or inline mutations", async () => {
  role = "STUDENT"; completed = false; empty = false;
  const html = await renderTasks();
  assert.deepEqual(assignmentQuery, { where: { isPublished: true }, select: { id: true } });
  assert.match(html, /href="\/dashboard\/aula\/course\/tareas"/);
  assert.match(html, /Ver mis tareas/);
  assert.match(html, /min-h-11/);
  assert.match(html, /focus-visible:outline/);
  assert.doesNotMatch(html, /PRIVATE-|7\.321|<form|<textarea/);
});

test("legacy course: teacher gets one canonical management entry and no old grading form", async () => {
  role = "TEACHER"; completed = false; empty = false;
  const html = await renderTasks();
  assert.deepEqual(assignmentQuery, { where: {}, select: { id: true } });
  assert.match(html, /Gestionar tareas/);
  assert.equal((html.match(/<a /g) ?? []).length, 1);
  assert.doesNotMatch(html, /PRIVATE-|<form|Calificar entrega/);
});

test("legacy course: empty and completed states explain the next step without reopening submission", async () => {
  role = "TEACHER"; empty = true;
  assert.match(await renderTasks(), /Crear tarea/);
  role = "STUDENT"; completed = true;
  const html = await renderTasks();
  assert.match(html, /aún no ha publicado tareas/);
  assert.match(html, /solo para consulta/);
  assert.match(html, /Ver mis tareas/);
  assert.doesNotMatch(html, /<form|Entregar tarea/);
});
