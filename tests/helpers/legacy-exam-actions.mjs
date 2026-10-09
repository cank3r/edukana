import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { build } from "esbuild";

const require = createRequire(import.meta.url);

/** Load the real action exports, replacing only authentication, database and cache boundaries. */
async function loadLegacyModule(fixture, entryPoint) {
  const boundaries = {
    "@/lib/auth": "export const auth = () => fixture.auth();",
    "@/lib/db": "export const db = fixture.db;",
    "@/lib/authorization": "export const getEffectiveCapabilities = (...args) => fixture.getEffectiveCapabilities(...args);",
    "next/cache": "export const revalidatePath = (...args) => fixture.revalidatePath(...args);",
  };
  const result = await build({
    entryPoints: [fileURLToPath(new URL(entryPoint, import.meta.url))],
    bundle: true, write: false, format: "cjs", platform: "node", packages: "external",
    plugins: [{ name: "legacy-exam-action-boundaries", setup(build) {
      build.onResolve({ filter: /^@\/lib\/(auth|db|authorization)$|^next\/cache$/ },
        args => ({ path: args.path, namespace: "legacy-exam-test" }));
      build.onLoad({ filter: /.*/, namespace: "legacy-exam-test" }, args => ({
        loader: "js", contents: boundaries[args.path],
      }));
    } }],
  });
  const compiledModule = { exports: Object.create(null) };
  vm.runInNewContext(result.outputFiles[0].text, {
    module: compiledModule, exports: compiledModule.exports, require, fixture, console, crypto, Date,
  });
  return compiledModule.exports;
}

export function loadLegacyExamActions(fixture) {
  return loadLegacyModule(fixture, "../../src/app/dashboard/academico/actions.ts");
}

export async function loadLegacyExamForm() {
  const loaded = await loadLegacyModule({}, "../../src/components/dashboard/AcademicForms.tsx");
  return loaded.ExamAttemptForm;
}
