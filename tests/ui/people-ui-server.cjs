/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS test server, no production import */
/* Local component harness: bundles real UI; server actions and navigation are inert test adapters. */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");
const postcss = require("postcss");
const tailwind = require("@tailwindcss/postcss");
const root = path.resolve(__dirname, "../..");
const host = "127.0.0.1";
const port = 3147;
const stubs = {
  "@/server/actions/people": `
    async function run(action, data) {
      const fixture = window.peopleFixture;
      fixture.calls.push({action, fields: data ? Object.fromEntries(data.entries()) : {}});
      await new Promise(resolve => setTimeout(resolve, fixture.delay));
      if (fixture.throwError) throw new Error('Simulated network failure');
      return fixture.fail ? {ok: false, message: 'Fallo simulado. Puedes corregir o reintentar.'}
        : {ok: true, message: 'Acción simulada completada.', remaining: 0};
    }
    export const createPersonAction = (_, data) => run('create', data);
    export const updatePersonAction = (_, data) => run('update', data);
    export const invitePersonAction = (_, data) => run('invite', data);
    export const setPersonStatusAction = (_, data) => run('status', data);
    export const invitePendingPeopleAction = () => run('bulk');
  `,
  "@/server/actions/people-import": `export const importPeopleAction = () => {
    throw new Error('Import is outside this fixture');
  };`,
  "next/navigation": `export const useRouter = () => ({refresh() {window.peopleFixture.refreshes++;}});`,
  "next/link": `import {createElement} from 'react';
    export default function Link({children, href, ...props}) {return createElement('a', {...props, href}, children);}`,
};
async function main() {
  console.log("Building isolated UI bundle");
  const bundle = await esbuild.build({
    absWorkingDir: root, entryPoints: ["tests/ui/people-fixture.tsx"], bundle: true, write: false,
    format: "iife", platform: "browser", jsx: "automatic", metafile: true,
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "isolated-people-actions", setup(build) {
      build.onResolve({ filter: /^(?:@\/server\/actions\/people(?:-import)?|next\/(?:navigation|link))$/ }, (args) =>
        ({ path: args.path, namespace: "test-stub" }));
      build.onLoad({ filter: /.*/, namespace: "test-stub" }, (args) => ({
        contents: stubs[args.path], loader: "js", resolveDir: root,
      }));
      build.onLoad({ filter: /[/\\]src[/\\]server[/\\]/ }, () => {
        throw new Error("Real server modules are forbidden in the isolated UI fixture");
      });
    } }],
  });
  const sources = Object.keys(bundle.metafile.inputs);
  if (sources.some((file) => /(?:^|[/\\])src[/\\](?:server|lib[/\\](?:db|auth))/.test(file))) {
    throw new Error("Fixture safety guard rejected a server/database/auth import");
  }
  const cssFile = path.join(root, "src/app/globals.css");
  console.log("Compiling existing app styles");
  const css = await postcss([tailwind({ base: root })]).process(fs.readFileSync(cssFile, "utf8"), { from: cssFile });
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>Fixture Personas</title>
    <link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;
  const server = http.createServer((request, response) => {
    if (request.headers.host !== `${host}:${port}` || request.method !== "GET") {
      response.writeHead(403).end(); return;
    }
    response.setHeader("Cache-Control", "no-store");
    if (request.url === "/") response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(html);
    else if (request.url === "/app.js") response.writeHead(200, { "Content-Type": "text/javascript" }).end(bundle.outputFiles[0].contents);
    else if (request.url === "/styles.css") response.writeHead(200, { "Content-Type": "text/css" }).end(css.css);
    else response.writeHead(404).end();
  });
  server.on("error", (error) => { console.error(error); process.exitCode = 1; });
  server.listen(port, host, () => console.log(`Isolated real-component fixture ready at http://${host}:${port}`));
  process.on("SIGTERM", () => server.close());
  process.on("SIGINT", () => server.close());
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
