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
  const server = http.createServer((request,response) => {
    if (request.headers.host !== `${host}:${port}` || request.method !== "GET") {response.writeHead(403).end(); return;}
    response.setHeader("Cache-Control", "no-store");
    const pathname = request.url.split("?")[0];
    if (pathname === "/") response.writeHead(200, {"Content-Type":"text/html; charset=utf-8"}).end(html);
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
