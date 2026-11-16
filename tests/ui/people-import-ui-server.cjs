/* eslint-disable @typescript-eslint/no-require-imports -- isolated CommonJS test server */
/* Real client component and app CSS; every action is an in-browser fixture, never a server request. */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");
const postcss = require("postcss");
const tailwind = require("@tailwindcss/postcss");
const root = path.resolve(__dirname, "../..");
const host = "127.0.0.1";
const port = 3149;
const stubs = {
  "@/server/actions/people-import": `
    export async function importPeopleAction(_, data) {
      const fixture = window.peopleImportFixture;
      const confirm = data.get('confirm') === 'true';
      const phase = confirm ? 'confirm' : 'preview';
      const file = data.get('file');
      const call = {confirm, name: file.name, content: await file.text(), completed: false};
      fixture.calls.push(call);
      const failed = fixture.failPhase === phase;
      const throws = fixture.throwPhase === phase;
      const summary = {totalLines: fixture.toCreate + fixture.alreadyExisted + fixture.rejected,
        toCreate: confirm ? (fixture.createdOnConfirm ?? fixture.toCreate) : fixture.toCreate,
        alreadyExisted: fixture.alreadyExisted, rejected: fixture.rejected,
        sampleErrors: fixture.sampleErrors, errorsCsv: fixture.errorsCsv};
      await new Promise(resolve => setTimeout(resolve, fixture.delay));
      call.completed = true;
      if (throws) throw new Error('Simulated transport interruption');
      if (failed) return {ok: false, message: 'Rechazo simulado del servidor. Revisa el archivo.'};
      return {ok: true, step: confirm ? 'done' : 'preview', message: confirm
        ? 'Importación simulada completada.' : 'Revisión simulada lista.', ...summary};
    }
  `,
  "next/navigation": `export const useRouter = () => ({refresh() {window.peopleImportFixture.refreshes++;}});`,
  "next/link": `import {createElement} from 'react';
    export default function Link({children, href, ...props}) {return createElement('a', {...props, href}, children);}`,
};
async function main() {
  console.log("Building isolated import UI bundle");
  const bundle = await esbuild.build({
    absWorkingDir: root, entryPoints: ["tests/ui/people-import-fixture.tsx"], bundle: true, write: false,
    format: "iife", platform: "browser", jsx: "automatic", metafile: true,
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "isolated-import-actions", setup(build) {
      build.onResolve({ filter: /^(?:@\/server\/actions\/people-import|next\/(?:navigation|link))$/ }, (args) =>
        ({ path: args.path, namespace: "test-stub" }));
      build.onLoad({ filter: /.*/, namespace: "test-stub" }, (args) => ({
        contents: stubs[args.path], loader: "js", resolveDir: root,
      }));
      build.onLoad({ filter: /[/\\]src[/\\]server[/\\]/ }, () => {
        throw new Error("Real server modules are forbidden in the import UI fixture");
      });
    } }],
  });
  if (Object.keys(bundle.metafile.inputs).some((file) => /(?:^|[/\\])src[/\\](?:server|lib[/\\](?:db|auth))/.test(file))) {
    throw new Error("Fixture guard rejected a server/database/auth module");
  }
  const cssFile = path.join(root, "src/app/globals.css");
  console.log("Compiling existing app styles for import fixture");
  const css = await postcss([tailwind({ base: root })]).process(fs.readFileSync(cssFile, "utf8"), { from: cssFile });
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>Fixture importación de Personas</title>
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
  server.listen(port, host, () => console.log(`Isolated import fixture ready at http://${host}:${port}`));
  process.on("SIGTERM", () => server.close());
  process.on("SIGINT", () => server.close());
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
