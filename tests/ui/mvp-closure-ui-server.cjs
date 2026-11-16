/* eslint-disable @typescript-eslint/no-require-imports -- isolated fixture server */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");
const postcss = require("postcss");
const tailwind = require("@tailwindcss/postcss");
const root = path.resolve(__dirname, "../..");
const host = "127.0.0.1";
const port = 3153;
const capture = `
  function capture(action, data) {
    window.closureFixture.calls.push({action, fields: [...data.entries()]});
    return {ok: true, message: 'Acción simulada completada.'};
  }
`;
const stubs = {
  "@/server/actions/files": capture + `
    export async function submitWithFilesAction(_, data) {
      const result = capture('submit', data);
      return window.closureFixture.rejectSubmit ? {ok:false, message:'Entrega simulada rechazada.'} : result;
    }`,
  "@/server/actions/assignments": capture + `
    export async function saveAssignmentAction(_, data) { return capture('assignment', data); }
    export const deleteAssignmentAction = () => {throw new Error('Deletion is outside this fixture');};
    export const gradeSubmissionAction = () => {throw new Error('Grading is outside this fixture');};
    export const setAssignmentPublishedAction = () => {throw new Error('Publishing is outside this fixture');};
    export const submitAssignmentAction = () => {throw new Error('Legacy submission is outside this fixture');};`,
  "@/server/actions/courses": capture + `
    export async function createCourseAction(_, data) {return {...capture('course', data), courseId:'course-fixture'};}
    export const updateCourseAction = () => {throw new Error('Updating courses is outside this fixture');};`,
  "next/navigation": `const router = {push(href) {window.closureFixture.navigation.push(href);}};
    export const useRouter = () => router;`,
  "next/link": `import {createElement} from 'react';
    export default function Link({children,href,...props}) {return createElement('a',{...props,href},children);}`,
};
async function renderTeacherTask(instructions) {
  require("tsx/cjs");
  const React = require("react");
  const {renderToStaticMarkup} = require("react-dom/server");
  const {loadWithStubs} = require("../helpers/load-with-stubs.cjs");
  globalThis.React = React;
  const page = loadWithStubs("src/app/dashboard/aula/[courseId]/tareas/[assignmentId]/page.tsx", {
    "@/lib/auth": {auth: async () => ({user:{id:"teacher-fixture",institutionId:"institution-fixture",role:"TEACHER"}})},
    "@/lib/authorization": {getEffectiveCapabilities: async () => new Set(["course.view"])},
    "next/navigation": {notFound: () => {throw new Error("Unexpected missing fixture");},redirect: () => {throw new Error("Unexpected redirect");}},
    "next/link": {default: ({children,href}) => React.createElement("a",{href},children)},
    "@/server/assessment/assignments": {
      assignmentRoster: async () => ({
        course:{id:"course-fixture",institution:{timezone:"UTC"}}, students:[], waiting:[],
        assignment:{id:"assignment-fixture",title:"Actividad de lectura",instructions,dueDate:null,
          maxScore:100,allowLate:true,isPublished:true},
      }),
      assignmentForStudent: () => {throw new Error("Student route not used here");},
      dueLabel: () => "Sin fecha límite", formatDateTime: () => "Fecha sintética",
    },
    "@/server/courses/submission-files": {submissionFilesForManager: async () => [],submissionFilesForStudent: async () => []},
    "../AssignmentTools": {GradeForm: () => null},
    "./SubmissionFiles": {FileList: () => null,SubmitWithFiles: () => null},
  });
  const html = renderToStaticMarkup(await page.default({
    params:Promise.resolve({courseId:"course-fixture",assignmentId:"assignment-fixture"}),searchParams:Promise.resolve({}),
  }));
  // A second render must load fresh stubs, rather than retaining the first fixture's closure.
  delete require.cache[require.resolve(path.join(root,"src/app/dashboard/aula/[courseId]/tareas/[assignmentId]/page.tsx"))];
  return html;
}
async function main() {
  const bundle = await esbuild.build({
    absWorkingDir: root, entryPoints: ["tests/ui/mvp-closure-fixture.tsx"], bundle: true, write: false,
    format: "iife", platform: "browser", jsx: "automatic", metafile: true,
    define: {"process.env.NODE_ENV": '"development"'},
    plugins: [{name: "isolated-closure-actions", setup(build) {
      build.onResolve({filter: /^(?:@\/server\/actions\/(?:files|assignments|courses)|next\/(?:navigation|link))$/},
        ({path}) => ({path, namespace: "test-stub"}));
      build.onLoad({filter: /.*/, namespace: "test-stub"}, ({path}) =>
        ({contents: stubs[path], loader: "js", resolveDir: root}));
      build.onLoad({filter: /[/\\]src[/\\]server[/\\]/}, () => {throw new Error("Real server module forbidden");});
    }}],
  });
  if (Object.keys(bundle.metafile.inputs).some(file => /(?:^|[/\\])src[/\\](?:server|lib[/\\](?:db|auth))/.test(file))) {
    throw new Error("Database/auth/server boundary leaked into the fixture");
  }
  const cssFile = path.join(root, "src/app/globals.css");
  const css = await postcss([tailwind({base: root})]).process(fs.readFileSync(cssFile, "utf8"), {from: cssFile});
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>Fixture cierre MVP</title>
    <link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;
  const teacherInstructions = "Lee el material de ejemplo.\nRecurso: https://example.test/material/" + "lectura".repeat(18) +
    "\nExplica el procedimiento y entrega tu respuesta en PDF.";
  const teacherPages = {};
  for (const [route,instructions] of [["/teacher-task",teacherInstructions],["/teacher-task-empty",""]]) {
    const markup = await renderTeacherTask(instructions);
    teacherPages[route] = html.replace('<div id="root"></div><script src="/app.js"></script>',
      `<main><p class="mx-auto max-w-3xl px-4 pt-4 text-sm text-slate-600">Vista docente real con datos ficticios; sin sesión ni servicios externos.</p>${markup}</main>`);
  }
  const server = http.createServer((request,response) => {
    if (request.headers.host !== `${host}:${port}` || request.method !== "GET") {response.writeHead(403).end(); return;}
    response.setHeader("Cache-Control", "no-store");
    const pathname = request.url.split("?")[0];
    if (pathname === "/") response.writeHead(200, {"Content-Type":"text/html; charset=utf-8"}).end(html);
    else if (Object.hasOwn(teacherPages,pathname)) response.writeHead(200, {"Content-Type":"text/html; charset=utf-8"}).end(teacherPages[pathname]);
    else if (pathname === "/app.js") response.writeHead(200, {"Content-Type":"text/javascript"}).end(bundle.outputFiles[0].contents);
    else if (pathname === "/styles.css") response.writeHead(200, {"Content-Type":"text/css"}).end(css.css);
    else response.writeHead(404).end();
  });
  server.on("error", error => {console.error(error); process.exitCode = 1;});
  server.listen(port, host, () => console.log(`Isolated closure fixture ready at http://${host}:${port}`));
  process.on("SIGTERM", () => server.close());
  process.on("SIGINT", () => server.close());
}
main().catch(error => {console.error(error); process.exitCode = 1;});
