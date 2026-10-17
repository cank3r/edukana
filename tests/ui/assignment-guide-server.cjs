/* eslint-disable @typescript-eslint/no-require-imports -- isolated local SSR fixture */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { AsyncLocalStorage } = require("node:async_hooks");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const React = require("react");
const { renderToStaticMarkup, renderToString } = require("react-dom/server");
const esbuild = require("esbuild");
const postcss = require("postcss");
const tailwind = require("@tailwindcss/postcss");
require("tsx/cjs");
globalThis.React = React;
const root = path.resolve(__dirname, "../..");
const folder = "src/app/dashboard/aula/[courseId]/tareas/[assignmentId]/";
const baseline = "21b6b71ab166d7bfbad23d9c43a829f7afc17354";
const host = "127.0.0.1", port = 3171;
const scope = new AsyncLocalStorage();
const scenes = ["new", "long", "pending", "current", "linked", "graded", "closed", "teacher", "anonymous", "forbidden", "missing", "wrong-course"];
const file = (id, name) => ({ id, name, sizeBytes: 24012, url: `/api/assets/${id}` });
function scenario(name) {
  if (!scenes.includes(name)) throw new Error("Unsupported fixture scenario");
  const current = ["current", "linked", "graded"].includes(name);
  return {
    name, calls: [], props: [], keys: [],
    user: name === "anonymous" ? null : { id: "student-fixture", institutionId: "institution-fixture", role: name === "teacher" ? "TEACHER" : "STUDENT" },
    course: { id: name === "wrong-course" ? "other-course-fixture" : "course-fixture", institution: { timezone: "America/Santo_Domingo" } },
    assignment: { id: "assignment-fixture", title: name === "long" ? "Observa y explica los cambios de tu comunidad durante la temporada de lluvias" : "Describe una planta de tu comunidad",
      instructions: name === "long" ? "Observa una planta. Escribe sus características y explica cómo la cuidas.\nRecurso de referencia: https://example.test/material/" + "observacion".repeat(15)
        : "Observa una planta de tu comunidad. Describe sus hojas y explica qué necesita para crecer. Puedes escribir, adjuntar un archivo o compartir un enlace.",
      dueDate: new Date("2030-10-20T22:00:00Z"), maxScore: 20, allowLate: false, isPublished: true },
    submission: current ? { id: "submission-fixture", content: "Mi planta tiene hojas verdes y necesita agua y luz.",
      link: name === "linked" ? "https://example.test/trabajo-guardado" : "", submittedAt: new Date("2026-10-16T18:30:00Z"),
      late: false, previousVersions: 1, graded: name === "graded", score: name === "graded" ? 18 : null, feedback: "Explicaste con claridad cómo cuidas la planta." } : null,
    canSubmit: !["linked", "graded", "closed"].includes(name),
    cannotSubmitReason: name === "graded" ? "Tu docente ya calificó esta entrega." : name === "linked"
      ? "Esta entrega incluye un enlace y no se puede reemplazar." : "La tarea está cerrada.",
    files: { current: current ? [file("current-fixture", "Observación anterior.pdf")] : [],
      pending: ["pending", "long"].includes(name)
        ? [file("pending-fixture", "Observación de la planta de mi comunidad y explicación de sus características durante la temporada de lluvias.pdf")] : [] },
  };
}
function fail(message) { throw new Error(message); }
function actor(actor, assignmentId) {
  if (actor.id !== "student-fixture" || actor.institutionId !== "institution-fixture" || assignmentId !== "assignment-fixture") {
    fail("Unexpected fixture identity or assignment");
  }
}
// Presentation-only React nodes are encoded without executing scripts or inventing UI wrappers.
function encodeNode(node) {
  if (node == null || typeof node === "string" || typeof node === "number" || typeof node === "boolean") return node;
  if (Array.isArray(node)) return node.map(encodeNode);
  if (!React.isValidElement(node)) return fail("Unsupported presentation node");
  if (typeof node.type === "function" || typeof node.type === "object") return { html: renderToStaticMarkup(node) };
  if (typeof node.type !== "string" && node.type !== React.Fragment) return fail("Unsupported presentation type");
  const { children, ...props } = node.props;
  if (Object.values(props).some(value => typeof value === "function")) return fail("Interactive server slot is outside fixture");
  return { tag: node.type === React.Fragment ? null : node.type, key: node.key, props, children: encodeNode(children) };
}
let components, historicalComponents;
function Boundary(props) {
  const context = scope.getStore(); context.props.push(props);
  const packed = { ...props, savedSummary: encodeNode(props.savedSummary), readOnlyContent: encodeNode(props.readOnlyContent) };
  const component = context.revision === "baseline" ? historicalComponents.SubmitWithFiles : components.SubmitWithFiles;
  return React.createElement("div", { "data-assignment-boundary": "", "data-props": JSON.stringify(packed), style: { display: "contents" },
    dangerouslySetInnerHTML: { __html: renderToString(React.createElement(component, props)) } });
}
const originalLoad = Module._load;
Module._load = function isolatedLoad(request, ...args) {
  if (request === "./SubmissionFiles") return { ...components, SubmitWithFiles: Boundary };
  if (request === "../AssignmentTools") return { GradeForm: () => React.createElement("p", null, "Formulario docente fuera del alcance del fixture.") };
  if (request === "@/lib/auth") return { auth: async () => { const s = scope.getStore(); s.calls.push("auth"); return s.user ? { user: s.user } : null; } };
  if (request === "@/lib/authorization") return { getEffectiveCapabilities: async (institutionId, role) => {
    const s = scope.getStore(); if (institutionId !== s.user.institutionId || role !== s.user.role) fail("Unexpected capability actor");
    s.calls.push("capabilities"); return new Set(s.name === "forbidden" ? [] : ["course.view", "course.participate"]);
  } };
  if (request === "@/server/assessment/assignments") return {
    assignmentForStudent: async (who, id) => { actor(who, id); const s = scope.getStore(); s.calls.push("student"); return s.name === "missing" ? null : s; },
    assignmentRoster: async (who, id) => { actor(who, id); const s = scope.getStore(); s.calls.push("roster"); return { ...s, students: [], waiting: [] }; },
    dueLabel: () => "Entrega antes del 20 de octubre de 2030", formatDateTime: () => "16 de octubre de 2026, 2:30 p. m.",
  };
  if (request === "@/server/courses/submission-files") return {
    submissionFilesForStudent: async (who, id) => { actor(who, id); const s = scope.getStore(); s.calls.push("studentFiles"); return s.files; },
    submissionFilesForManager: async () => fail("Manager file query outside fixture"),
  };
  if (request === "@/server/actions/files") return { submitWithFilesAction: () => fail("Action execution forbidden during SSR") };
  if (request === "next/link") return ({ children, href, ...props }) => React.createElement("a", { ...props, href }, children);
  if (request === "next/navigation") return { notFound: () => fail("FIXTURE_NOT_FOUND"), redirect: href => fail(`FIXTURE_REDIRECT:${href}`) };
  if (/^(?:server-only|@prisma\/|@supabase\/|next-auth|@\/server\/|@\/lib\/(?:auth|db))/.test(request)) fail(`Forbidden service import: ${request}`);
  const resolved = Module._resolveFilename(request, ...args);
  if (typeof resolved === "string" && /[/\\]src[/\\](?:server[/\\]|lib[/\\](?:auth|db)\.)/.test(resolved)) fail("Real service source forbidden");
  return originalLoad.call(this, request, ...args);
};
function historical(name) {
  const filename = path.join(root, folder, name);
  const source = execFileSync("git", ["show", `${baseline}:${folder}${name}`], { cwd: root, encoding: "utf8" });
  const historicalModule = new Module(filename); historicalModule.filename = filename;
  historicalModule.paths = Module._nodeModulePaths(path.dirname(filename));
  historicalModule._compile(esbuild.transformSync(source, { loader: "tsx", format: "cjs", jsx: "automatic" }).code, filename);
  return historicalModule.exports;
}
components = require(path.join(root, folder, "SubmissionFiles.tsx"));
historicalComponents = historical("SubmissionFiles.tsx");
const Page = require(path.join(root, folder, "page.tsx")).default;
const HistoricalPage = historical("page.tsx").default;
async function renderScenario(name = "new", revision = "candidate") {
  const context = { ...scenario(name), revision };
  return scope.run(context, async () => {
    const tree = await (revision === "baseline" ? HistoricalPage : Page)({
      params: Promise.resolve({ courseId: "course-fixture", assignmentId: "assignment-fixture" }), searchParams: Promise.resolve({}),
    });
    function keys(node) {
      if (Array.isArray(node)) return node.forEach(keys);
      if (!React.isValidElement(node)) return;
      if (node.type === Boundary) context.keys.push(node.key);
      keys(node.props.children);
    }
    keys(tree);
    return { html: renderToStaticMarkup(tree), props: context.props, keys: context.keys, calls: context.calls, scenario: context };
  });
}
async function compile() {
  const bundles = {};
  for (const revision of ["candidate", "baseline"]) {
    const bundle = await esbuild.build({ absWorkingDir: root, entryPoints: ["tests/ui/assignment-guide-fixture.tsx"],
      bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", metafile: true,
      define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "isolated-assignment", setup(build) {
        build.onResolve({ filter: /^@\/server\/actions\/files$/ }, () => ({ path: "action", namespace: "fixture" }));
        build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents:
          "export async function submitWithFilesAction(_,data){return window.assignmentFixture.submit(data);}", loader: "js" }));
        build.onResolve({ filter: /^(?:server-only|@prisma\/|@supabase\/|next-auth|@\/server\/|@\/lib\/(?:auth|db))/ },
          args => { throw new Error(`Forbidden client service: ${args.path}`); });
        if (revision === "baseline") build.onLoad({ filter: /[/\\]SubmissionFiles\.tsx$/ }, () => ({ loader: "tsx",
          contents: execFileSync("git", ["show", `${baseline}:${folder}SubmissionFiles.tsx`], { cwd: root, encoding: "utf8" }) }));
      } }] });
    if (Object.keys(bundle.metafile.inputs).some(name => /(?:^|[/\\])src[/\\](?:server|lib[/\\](?:db|auth))/.test(name))) fail("Client bundle leaked service code");
    bundles[revision] = bundle.outputFiles[0].contents;
  }
  const cssPath = path.join(root, "src/app/globals.css");
  const css = await postcss([tailwind({ base: root })]).process(fs.readFileSync(cssPath, "utf8"), { from: cssPath });
  const builtCss = fs.readdirSync(path.join(root, ".next/static/css")).filter(name => name.endsWith(".css"))
    .map(name => fs.readFileSync(path.join(root, ".next/static/css", name), "utf8")).join("\n");
  const faces = [...builtCss.matchAll(/@font-face\{[^}]*font-family:Inter(?: Fallback)?;[^}]*\}/g)].map(match => match[0]);
  const variable = builtCss.match(/\.([\w_]+)\{--font-inter:[^}]+\}/);
  if (!faces.length || !variable) fail("Build-local Inter font is required");
  const assets = new Map();
  for (const face of faces) for (const match of face.matchAll(/url\((\/_next\/static\/media\/[\w.-]+\.woff2)\)/g)) {
    assets.set(match[1], fs.readFileSync(path.join(root, ".next/static/media", path.basename(match[1]))));
  }
  return { bundles, css: faces.join("\n") + variable[0] + css.css, fontClass: variable[1], assets };
}
async function main() {
  const compiled = await compile();
  if (process.argv.includes("--compile-only")) { console.log("Assignment fixture compiled; real services excluded, no server or browser started."); return; }
  const server = http.createServer(async (request, response) => {
    if (request.headers.host !== `${host}:${port}` || request.method !== "GET") { response.writeHead(403).end(); return; }
    response.setHeader("Cache-Control", "no-store"); response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self'; connect-src 'none'; form-action 'none'; frame-ancestors 'none'");
    const url = new URL(request.url, `http://${host}:${port}`);
    if (compiled.assets.has(url.pathname)) response.writeHead(200, { "Content-Type": "font/woff2" }).end(compiled.assets.get(url.pathname));
    else if (url.pathname === "/styles.css") response.writeHead(200, { "Content-Type": "text/css" }).end(compiled.css);
    else if (["/candidate.js", "/baseline.js"].includes(url.pathname)) {
      response.writeHead(200, { "Content-Type": "text/javascript" }).end(compiled.bundles[url.pathname.slice(1, -3)]);
    } else if (url.pathname === "/") {
      const name = url.searchParams.get("scene") ?? "new", revision = url.searchParams.get("revision") ?? "candidate";
      if (!scenes.includes(name) || !["candidate", "baseline"].includes(revision)) { response.writeHead(400).end(); return; }
      try {
        const rendered = await renderScenario(name, revision);
        const scriptHashes = [...rendered.html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
          .map(match => `'sha256-${createHash("sha256").update(match[1], "utf8").digest("base64")}'`);
        if (scriptHashes.length) response.setHeader("Content-Security-Policy", response.getHeader("Content-Security-Policy")
          .replace("script-src 'self'", `script-src 'self' ${[...new Set(scriptHashes)].join(" ")}`));
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(`<!doctype html><html lang="es" class="${compiled.fontClass}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Guía de tarea: revisión local</title>
<link rel="stylesheet" href="/styles.css"></head><body class="antialiased"><main>${rendered.html}</main>
<footer class="px-4 py-3 text-center text-xs text-slate-600">Revisión local · Datos de ejemplo, sesión y servicios simulados.</footer>
<script src="/${revision}.js" defer></script></body></html>`);
      } catch (error) {
        if (/^FIXTURE_(?:NOT_FOUND|REDIRECT)/.test(error.message)) response.writeHead(404).end("Fixture access denied");
        else { console.error(error); response.writeHead(500).end("Fixture render failed"); }
      }
    } else response.writeHead(404).end();
  });
  server.listen(port, host, () => console.log(`Assignment fixture ready: http://${host}:${port}; CSS and Inter in memory.`));
  server.on("error", error => { console.error(error); process.exitCode = 1; });
  process.on("SIGTERM", () => server.close()); process.on("SIGINT", () => server.close());
}
module.exports = { renderScenario, baseline };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
