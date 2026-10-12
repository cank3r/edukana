/* eslint-disable @typescript-eslint/no-require-imports -- isolated CommonJS test server */
/* React, the real components and app CSS; actions are local fixture promises, never database calls. */
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
  "@/server/actions/attendance": `
    async function run(kind, data) {
      const fixture = window.attendanceFixture;
      const result = kind === 'save' ? fixture.saveResult : fixture.deleteResult;
      const call = {kind, data: Object.fromEntries(data.entries()), completed: false};
      fixture.calls.push(call);
      if (fixture.hold) await new Promise(resolve => { fixture.release = resolve; });
      call.completed = true;
      if (result === 'throw') throw new Error('Simulated transport interruption');
      if (result === 'error') return {ok: false, message: 'Rechazo simulado del servidor. Revisa los datos.'};
      return {ok: true, message: kind === 'save' ? 'Asistencia guardada.' : 'Asistencia borrada.'};
    }
    export async function saveAttendanceAction(_, data) { return run('save', data); }
    export async function deleteAttendanceSessionAction(_, data) { return run('delete', data); }
  `,
  "next/navigation": `export const useRouter = () => ({
    refresh() {window.attendanceFixture.refreshes++;}, push(url) {window.attendanceFixture.navigations.push(url);}
  });`,
};
async function main() {
  const bundle = await esbuild.build({
    absWorkingDir: root, entryPoints: ["tests/ui/attendance-fixture.tsx"], bundle: true, write: false,
    format: "iife", platform: "browser", jsx: "automatic", metafile: true,
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "isolated-attendance-actions", setup(build) {
      build.onResolve({ filter: /^(?:@\/server\/actions\/attendance|next\/navigation)$/ }, (args) =>
        ({ path: args.path, namespace: "test-stub" }));
      build.onLoad({ filter: /.*/, namespace: "test-stub" }, (args) => ({
        contents: stubs[args.path], loader: "js", resolveDir: root,
      }));
      build.onLoad({ filter: /[/\\]src[/\\]server[/\\]/ }, () => {
        throw new Error("Real server modules are forbidden in the attendance UI fixture");
      });
    } }],
  });
  if (Object.keys(bundle.metafile.inputs).some((file) => /(?:^|[/\\])src[/\\](?:server|lib[/\\](?:db|auth))/.test(file))) {
    throw new Error("Fixture guard rejected a server/database/auth module");
  }
  const cssFile = path.join(root, "src/app/globals.css");
  const css = await postcss([tailwind({ base: root })]).process(fs.readFileSync(cssFile, "utf8"), { from: cssFile });
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>Fixture asistencia</title>
    <link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;
  const server = http.createServer((request, response) => {
    if (request.headers.host !== host + ':' + port || request.method !== "GET") { response.writeHead(403).end(); return; }
    response.setHeader("Cache-Control", "no-store");
    if (request.url === "/") response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(html);
    else if (request.url === "/app.js") response.writeHead(200, { "Content-Type": "text/javascript" }).end(bundle.outputFiles[0].contents);
    else if (request.url === "/styles.css") response.writeHead(200, { "Content-Type": "text/css" }).end(css.css);
    else response.writeHead(404).end();
  });
  server.on("error", (error) => { console.error(error); process.exitCode = 1; });
  server.listen(port, host, () => console.log(`Isolated attendance fixture ready at http://${host}:${port}`));
  process.on("SIGTERM", () => server.close());
  process.on("SIGINT", () => server.close());
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
