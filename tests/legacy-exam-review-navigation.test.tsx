import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import type { EdukanaRole } from "@/types/next-auth";

const require = createRequire(import.meta.url);
const { loadLegacyExamReview } = require("./helpers/load-legacy-exam-review.cjs");
let role: EdukanaRole = "TEACHER";
const course = {
  id: "course", name: "Test course", teacherId: "teacher", teacher: { name: "Teacher" },
  period: { name: "Period", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") },
  sections: [], enrollments: [], attendanceSessions: [], gradingPeriods: [], assignments: [],
  questionBank: [], scheduleSlots: [], assets: [],
  exams: [{ id: "exam", title: "Test exam", maxAttempts: 1, durationMinutes: 30, questions: [], attempts: [
    { id: "attempt", status: "SUBMITTED", student: { name: "Student" }, score: 0, maxScore: 3, answers: [] },
  ] }],
};
const stubs = {
  "@/lib/auth": { auth: async () => ({ user: { id: role === "TEACHER" ? "teacher" : "student", institutionId: "institution", role } }) },
  "@/lib/db": { db: {
    roleCapabilityOverride: { findMany: async () => [] },
    course: { findFirst: async () => course }, user: { findMany: async () => [] },
  } },
  "next/cache": { revalidatePath: () => undefined },
  "next/navigation": { notFound: () => { throw new Error("Not found"); } },
};
const { default: CoursePage }: typeof import("@/app/dashboard/aula/[courseId]/page") =
  loadLegacyExamReview(stubs, "src/app/dashboard/aula/[courseId]/page.tsx");
// The component signature intentionally changes: old props must no longer construct a scoring form.
const { ExamReviewForm } = loadLegacyExamReview(stubs, "src/components/dashboard/AcademicForms.tsx");

test("the actual legacy course page directs teachers to the existing canonical results route", async () => {
  role = "TEACHER";
  const html = renderToStaticMarkup(await CoursePage({ params: Promise.resolve({ courseId: "course" }) }));
  assert.match(html, /href="\/dashboard\/aula\/course\/examenes\/exam\/resultados"/);
  assert.match(html, /Ver resultados y revisar/);
  assert.doesNotMatch(html, /Calificar examen|name="score_|\/presentar/);
});

test("the former review form renders an accessible link rather than mutable scoring fields", () => {
  const html = renderToStaticMarkup(<ExamReviewForm courseId="course" examId="exam" />);
  assert.match(html, /href="\/dashboard\/aula\/course\/examenes\/exam\/resultados"/);
  assert.match(html, /min-h-11/);
  assert.doesNotMatch(html, /<form|<input|<button/);
});

test("student course rendering never exposes the teacher results link", async () => {
  role = "STUDENT";
  const html = renderToStaticMarkup(await CoursePage({ params: Promise.resolve({ courseId: "course" }) }));
  assert.doesNotMatch(html, /\/resultados|Ver resultados y revisar/);
});
