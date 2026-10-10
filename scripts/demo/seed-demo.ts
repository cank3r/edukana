/**
 * Carga o quita la institución de demostración «Instituto Técnico Demo».
 *
 *   Crear:  DEMO_PASSWORD=… DEMO_CONFIRM=crear-demo npm run demo:seed
 *   Quitar: DEMO_CONFIRM=borrar-demo npm run demo:remove
 *
 * Variables:
 *   DATABASE_URL   base donde se carga (también se lee del archivo .env).
 *   DEMO_PASSWORD  contraseña de todas las cuentas de demostración (obligatoria al crear, 8+ caracteres).
 *                  Nunca se muestra en pantalla ni se guarda en el repositorio.
 *   DEMO_RESET=1   si la demostración ya existe, la borra y la vuelve a crear.
 *
 * Solo crea o borra la institución con el identificador fijo `instituto-tecnico-demo` y las
 * cuentas `@demo.edukana.do` que no pertenezcan a otra institución. Ver docs/demo.md.
 */
import { existsSync } from "node:fs";
import Module from "node:module";
import { join } from "node:path";

// Las funciones del servidor importan `server-only`, que solo existe dentro de Next.js.
// Fuera de Next se sustituye por un módulo vacío antes de cargarlas.
const loader = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const resolveOriginal = loader._resolveFilename;
loader._resolveFilename = function resolveWithServerOnlyStub(this: unknown, request: string, ...rest: unknown[]) {
  if (request === "server-only") return join(__dirname, "server-only-stub.cjs");
  return resolveOriginal.call(this, request, ...rest);
};

const SECONDS_TO_WAIT = 5;

/** Servidor, puerto y nombre de la base, sin usuario ni contraseña. */
function describeDatabase(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (!url.hostname) return null;
    const database = url.pathname.replace(/^\//, "") || "(sin nombre)";
    return `${url.hostname}${url.port ? `:${url.port}` : ""} / base «${database}»`;
  } catch {
    return null;
  }
}

async function countdown(seconds: number) {
  process.stdout.write("Empieza en ");
  for (let left = seconds; left > 0; left -= 1) {
    process.stdout.write(`${left}… `);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  process.stdout.write("\n");
}

function table(rows: string[][]) {
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  return rows.map((row) => row.map((cell, column) => cell.padEnd(widths[column])).join("  ")).join("\n");
}

async function main() {
  const removing = process.argv.includes("--remove");
  const expected = removing ? "borrar-demo" : "crear-demo";
  const action = removing ? "quitar" : "crear";

  if (!process.env.DATABASE_URL && existsSync(".env")) {
    (process as unknown as { loadEnvFile?: (path: string) => void }).loadEnvFile?.(".env");
  }
  if (process.env.DEMO_CONFIRM !== expected) {
    console.error(`Para ${action} la institución de demostración escribe DEMO_CONFIRM=${expected} antes del comando.`);
    console.error(`Ejemplo: DEMO_CONFIRM=${expected} npm run ${removing ? "demo:remove" : "demo:seed"}`);
    process.exitCode = 1;
    return;
  }
  const url = process.env.DATABASE_URL ?? "";
  const target = describeDatabase(url);
  if (!target) {
    console.error("Falta DATABASE_URL o no es una dirección válida. Escríbela en el archivo .env o antes del comando.");
    process.exitCode = 1;
    return;
  }
  // El esquema declara también DIRECT_URL; aquí basta con la misma base.
  process.env.DIRECT_URL ||= url;
  const password = process.env.DEMO_PASSWORD?.trim() ?? "";
  if (!removing && password.length < 8) {
    console.error("Falta DEMO_PASSWORD (al menos 8 caracteres): es la contraseña de todas las cuentas de demostración.");
    console.error(`Ejemplo: DEMO_PASSWORD="UnaClaveLarga2026" DEMO_CONFIRM=${expected} npm run demo:seed`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nBase de datos: ${target}`);
  console.log(removing
    ? "Se va a borrar SOLO «Instituto Técnico Demo» y sus cuentas @demo.edukana.do. Ninguna otra institución se toca."
    : "Se va a crear UNA institución nueva: «Instituto Técnico Demo». Ninguna otra institución se toca.");
  console.log("Si esta no es la base correcta, pulsa Ctrl+C ahora.");
  await countdown(SECONDS_TO_WAIT);

  const { db } = await import("@/lib/db");
  try {
    const demo = await import("./demo-seed");
    if (removing) {
      const result = await demo.removeDemo();
      console.log(result.removed
        ? `Listo: se borró «${demo.DEMO_NAME}» y ${result.identitiesRemoved} cuentas de demostración.`
        : `No había ninguna «${demo.DEMO_NAME}» en esta base. ${result.identitiesRemoved ? `Se borraron ${result.identitiesRemoved} cuentas sueltas de demostración.` : "No se borró nada."}`);
      return;
    }

    const existing = await demo.findDemoInstitution();
    if (existing && process.env.DEMO_RESET !== "1") {
      console.log(`«${demo.DEMO_NAME}» ya existe en esta base. No se creó nada para no duplicarla.`);
      console.log("Para borrarla y crearla de nuevo, agrega DEMO_RESET=1 al comando.");
      return;
    }
    if (existing) {
      console.log("DEMO_RESET=1: se borra la demostración anterior…");
      await demo.removeDemo();
    }

    const started = Date.now();
    const result = await demo.createDemo({ password, log: (message) => console.log(`· ${message}`) });
    if (!result.created) {
      console.log(`«${demo.DEMO_NAME}» ya existe en esta base. No se creó nada.`);
      return;
    }
    console.log(`\nListo en ${Math.round((Date.now() - started) / 1000)} segundos: «${demo.DEMO_NAME}» quedó cargada.`);
    for (const warning of result.warnings) console.log(`Aviso: ${warning}`);
    console.log("\nQué se creó:");
    console.log(table([["Qué", "Cuántos"], ...Object.entries(result.counts).map(([label, total]) => [label, String(total)])]));
    console.log("\nTodas las cuentas entran con la contraseña que pusiste en DEMO_PASSWORD (no se muestra aquí).\n");
    console.log(table([["Rol", "Nombre", "Correo"], ...result.accounts.map((account) => [account.role, account.name, account.email])]));
    console.log("\nLas demás personas (120 estudiantes, 10 docentes, 15 tutores) usan la misma contraseña. Lista completa en docs/demo.md.");
    console.log("Para quitar la demostración: DEMO_CONFIRM=borrar-demo npm run demo:remove");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("\nNo se pudo completar. Si se alcanzó a crear parte de la demostración, se borró; las demás instituciones no se tocaron.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
