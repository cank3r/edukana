/* eslint-disable @typescript-eslint/no-require-imports -- isolated CommonJS fixture server */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");
const postcss = require("postcss");
const tailwind = require("@tailwindcss/postcss");
const root = path.resolve(__dirname, "../..");
const host = "127.0.0.1";
const port = 3151;
const stubs = {
  "@/server/actions/course-enrollment": `
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    export async function searchEnrollableStudentsAction(courseId, query) {
      const fixture = window.enrollmentFixture;
      const call = {action: 'search', courseId, query, completed: false};
      fixture.calls.push(call);
      const throws = fixture.throwAction === 'search';
      const fails = fixture.failAction === 'search';
      const students = fixture.students.filter(s => (s.name + ' ' + s.email).toLowerCase().includes(query.trim().toLowerCase()));
      await pause(fixture.searchDelayByQuery[query] ?? fixture.delay);
      call.completed = true;
      if (throws) throw new Error('Simulated search transport failure');
      return fails ? {ok: false, message: 'La búsqueda simulada fue rechazada.', students: [], more: false}
        : {ok: true, message: '', students, more: false};
    }
    async function enroll(action, data) {
      const fixture = window.enrollmentFixture;
      const call = {action, courseId: String(data.get('courseId')), fields: Array.from(data.entries()), completed: false};
      fixture.calls.push(call);
      const throws = fixture.throwAction === action;
      const fails = fixture.failAction === action;
      await pause(fixture.delay);
      call.completed = true;
      if (throws) throw new Error('Simulated ' + action + ' transport failure');
      return fails ? {ok: false, message: 'Inscripción simulada rechazada. Revisa los cupos.'}
        : {ok: true, message: 'Inscripción simulada completada.'};
    }
    export const enrollStudentsAction = (_, data) => enroll('students', data);
    export const enrollGroupAction = (_, data) => enroll('group', data);
    export const withdrawStudentAction = () => {throw new Error('Withdrawal is outside this fixture');};
    export const reinstateStudentAction = () => {throw new Error('Reinstatement is outside this fixture');};
  `,
  "next/navigation": `export const useRouter = () => ({refresh() {window.enrollmentFixture.refreshes++;}});`,
  "next/link": `import {createElement} from 'react';
    export default function Link({children, href, ...props}) {return createElement('a', {...props, href}, children);}`,
};
async function main() {
  console.log("Building isolated enrollment component bundle");
  const bundle = await esbuild.build({
    absWorkingDir: root, entryPoints: ["tests/ui/enrollment-fixture.tsx"], bundle: true, write: false,
    format: "iife", platform: "browser", jsx: "automatic", metafile: true,
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "isolated-enrollment-actions", setup(build) {
      build.onResolve({ filter: /^(?:@\/server\/actions\/course-enrollment|next\/(?:navigation|link))$/ }, (args) =>
        ({ path: args.path, namespace: "test-stub" }));
      build.onLoad({ filter: /.*/, namespace: "test-stub" }, (args) => ({ contents: stubs[args.path], loader: "js", resolveDir: root }));
      build.onLoad({ filter: /[/\\]src[/\\]server[/\\]/ }, () => {
        throw new Error("Real server modules are forbidden in the enrollment fixture");
      });
    } }],
  });
  if (Object.keys(bundle.metafile.inputs).some((file) => /(?:^|[/\\])src[/\\](?:server|lib[/\\](?:db|auth))/.test(file))) {
    throw new Error("Fixture guard rejected a server/database/auth module");
  }
  const cssFile = path.join(root, "src/app/globals.css");
  const css = await postcss([tailwind({ base: root })]).process(fs.readFileSync(cssFile, "utf8"), { from: cssFile });
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>Fixture matrícula</title>
    <link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;
  const server = http.createServer((request, response) => {
    if (request.headers.host !== host + ':' + port || request.method !== "GET") { response.writeHead(403).end(); return; }
    response.setHeader("Cache-Control", "no-store");
    if (request.url.split('?')[0] === "/") response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(html);
    else if (request.url === "/app.js") response.writeHead(200, { "Content-Type": "text/javascript" }).end(bundle.outputFiles[0].contents);
    else if (request.url === "/styles.css") response.writeHead(200, { "Content-Type": "text/css" }).end(css.css);
    else response.writeHead(404).end();
  });
  server.on("error", (error) => { console.error(error); process.exitCode = 1; });
  server.listen(port, host, () => console.log(`Isolated enrollment fixture ready at http://${host}:${port}`));
  process.on("SIGTERM", () => server.close()); process.on("SIGINT", () => server.close());
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
