import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { loadWithStubs } = createRequire(import.meta.url)("./helpers/load-with-stubs.cjs");
Object.assign(globalThis, { React });
let role: "TEACHER" | "STUDENT";
let available: boolean;
const instructions = "Lee el recurso de ejemplo.\nhttps://example.test/recurso\nExplica el procedimiento en un PDF.";
const assignment = {
  id: "assignment-fixture", title: "Actividad sintética", instructions, dueDate: null,
  maxScore: 100, allowLate: true, isPublished: true,
};
const course = { id: "course-fixture", institution: { timezone: "UTC" } };
const user = () => ({ id: "viewer-fixture", institutionId: "institution-fixture", role });
const navigation = { notFound: () => { throw new Error("NOT_FOUND"); }, redirect: () => { throw new Error("REDIRECT"); } };
const assignmentPage = loadWithStubs("src/app/dashboard/aula/[courseId]/tareas/[assignmentId]/page.tsx", {
  "@/lib/auth": { auth: async () => ({user: user()}) },
  "@/lib/authorization": { getEffectiveCapabilities: async () => new Set(["course.view"]) },
  "next/navigation": navigation,
  "next/link": { default: ({children,href}: React.ComponentProps<"a">) => React.createElement("a",{href},children) },
  "@/server/assessment/assignments": {
    assignmentForStudent: async () => available ? {course,assignment,submission:null,canSubmit:false,cannotSubmitReason:"Solo lectura de prueba"} : null,
    assignmentRoster: async () => available ? {course,assignment,students:[],waiting:[]} : null,
    dueLabel: () => "Sin fecha límite", formatDateTime: () => "Fecha sintética",
  },
  "@/server/courses/submission-files": {
    submissionFilesForStudent: async () => ({current:[],pending:[]}), submissionFilesForManager: async () => [],
  },
  "../AssignmentTools": { GradeForm: () => null },
  "./SubmissionFiles": { FileList: () => null, SubmitWithFiles: () => null },
});
const renderAssignment = async () => renderToStaticMarkup(await assignmentPage.default({
  params: Promise.resolve({courseId:course.id,assignmentId:assignment.id}), searchParams:Promise.resolve({}),
}));
beforeEach(() => {role="STUDENT"; available=true;});

test("student task page displays complete instructions and the existing resource text", async () => {
  const html = await renderAssignment();
  assert.ok(html.includes(instructions));
  assert.match(html, /aria-labelledby="instrucciones"/);
});

test("teacher task page displays the same instructions used to assess submissions", async () => {
  role="TEACHER";
  const html = await renderAssignment();
  assert.ok(html.includes(instructions), "Task instructions returned by the roster must be visible to the teacher");
});

for (const actor of ["TEACHER","STUDENT"] as const) {
  test(`${actor}: unavailable task is routed to notFound without displaying its content`, async () => {
    role=actor; available=false;
    await assert.rejects(renderAssignment, /NOT_FOUND/);
  });
}

test("course creation page preserves institution-scoped historical and current period options", async () => {
  const periods = [{id:"past",name:"Primer semestre 2026"},{id:"current",name:"Segundo semestre 2026"}];
  let query: {where:{institutionId:string}} | undefined;
  const page = loadWithStubs("src/app/dashboard/aula/nuevo/page.tsx", {
    "@/lib/auth": {auth: async () => ({user:{...user(),role:"TEACHER"}})},
    "@/lib/authorization": {getEffectiveCapabilities: async () => new Set(["course.create"] )},
    "@/lib/course-scope": {resolveCourseWriteScope: () => ({kind:"teacher",teacherId:"viewer-fixture"})},
    "@/lib/db": {db:{academicPeriod:{findMany: async (input: typeof query) => {query=input;return periods;}}}},
    "@/server/platform/independent-kind": {isIndependentInstitution: async () => false},
    "next/navigation": navigation,
    "next/link": {default: () => null},
    "./CourseForm": {CourseForm: (props:{periods: typeof periods}) => React.createElement("output",null,JSON.stringify(props.periods))},
  });
  const html = renderToStaticMarkup(await page.default());
  assert.equal(query?.where.institutionId,"institution-fixture");
  assert.ok(html.includes("Primer semestre 2026"));
  assert.ok(html.includes("Segundo semestre 2026"));
});
