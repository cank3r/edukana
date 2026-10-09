/**
 * Carga o quita la institución de demostración «Instituto Técnico Demo».
 *
 *   Crear:  DEMO_CONFIRM=crear-demo npm run demo:seed
 *   Quitar: DEMO_CONFIRM=borrar-demo npm run demo:remove
 *
 * Variables:
 *   DATABASE_URL   base donde se carga (también se lee del archivo .env).
 *   DEMO_PASSWORD  contraseña de todas las cuentas de demostración; si falta, se genera una.
 *   DEMO_RESET=1   si la demostración ya existe, la borra y la vuelve a crear.
 *
 * Solo crea o borra la institución con el identificador fijo `instituto-tecnico-demo` y las
 * cuentas `@demo.edukana.do` que no pertenezcan a otra institución. Ver docs/demo.md.
 */
import { randomBytes } from "node:crypto";
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

/** Operaciones simultáneas: nunca más que las conexiones que permite la dirección de la base. */
function concurrencyFor(raw: string): number {
  const wanted = Number(process.env.DEMO_CONCURRENCY ?? 3);
  let limit = Number.POSITIVE_INFINITY;
  try {
    const value = new URL(raw).searchParams.get("connection_limit");
    if (value) limit = Number(value);
  } catch {
    // La dirección ya se validó antes.
  }
  const result = Math.min(Number.isFinite(wanted) ? wanted : 3, Number.isFinite(limit) ? limit : 3);
  return Math.max(1, Math.floor(result));
}

function generatedPassword() {
  return `Demo${new Date().getFullYear()}-${randomBytes(3).toString("hex")}`;
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
  const password = process.env.DEMO_PASSWORD?.trim() || generatedPassword();
  if (!removing && password.length < 8) {
    console.error("DEMO_PASSWORD debe tener al menos 8 caracteres.");
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
    const result = await demo.createDemo({ password, concurrency: concurrencyFor(url), log: (message) => console.log(`· ${message}`) });
    if (!result.created) {
      console.log(`«${demo.DEMO_NAME}» ya existe en esta base. No se creó nada.`);
      return;
    }
    console.log(`\nListo en ${Math.round((Date.now() - started) / 1000)} segundos: «${demo.DEMO_NAME}» quedó cargada.`);
    for (const warning of result.warnings) console.log(`Aviso: ${warning}`);
    console.log(`\nContraseña de TODAS las cuentas: ${password}\n`);
    console.log(table([["Rol", "Nombre", "Correo"], ...result.accounts.map((account) => [account.role, account.name, account.email])]));
    console.log("\nTodas las demás personas (40 estudiantes, 4 docentes, 6 tutores) usan la misma contraseña.");
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
