/**
 * Asigna la prueba gratis a las instituciones que se crearon antes de que existieran los planes.
 *
 *   Ver cuáles (no cambia nada):  npm run plataforma:asignar-planes
 *   Asignarles plan:              PLANES_CONFIRM=asignar-planes npm run plataforma:asignar-planes
 *
 * Cada institución sin suscripción recibe una prueba (TRIAL) de 30 días, precio 0, con el plan que
 * ya marca su campo `plan` (FREE si nunca se tocó). Las que ya tienen suscripción no se tocan, así
 * que se puede correr las veces que haga falta. Cada asignación queda en la bitácora.
 *
 * Variables: DATABASE_URL (también se lee del archivo .env).
 */
import { existsSync } from "node:fs";
import Module from "node:module";
import { join } from "node:path";

const loader = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const resolveOriginal = loader._resolveFilename;
loader._resolveFilename = function resolveWithServerOnlyStub(this: unknown, request: string, ...rest: unknown[]) {
  if (request === "server-only") return join(__dirname, "..", "demo", "server-only-stub.cjs");
  return resolveOriginal.call(this, request, ...rest);
};

const CONFIRM = "asignar-planes";

function describeDatabase(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (!url.hostname) return null;
    return `${url.hostname}${url.port ? `:${url.port}` : ""} / base «${url.pathname.replace(/^\//, "") || "(sin nombre)"}»`;
  } catch {
    return null;
  }
}

async function main() {
  if (!process.env.DATABASE_URL && existsSync(".env")) {
    (process as unknown as { loadEnvFile?: (path: string) => void }).loadEnvFile?.(".env");
  }
  const url = process.env.DATABASE_URL ?? "";
  const target = describeDatabase(url);
  if (!target) {
    console.error("Falta DATABASE_URL o no es una dirección válida. Escríbela en el archivo .env o antes del comando.");
    process.exitCode = 1;
    return;
  }
  process.env.DIRECT_URL ||= url;
  const apply = process.env.PLANES_CONFIRM === CONFIRM;

  const { db } = await import("@/lib/db");
  const { backfillMissingSubscriptions } = await import("@/server/platform/backfill-subscriptions");
  try {
    console.log(`\nBase de datos: ${target}`);
    const preview = await backfillMissingSubscriptions(db, { dryRun: true });
    if (preview.pending.length === 0) {
      console.log("Todas las instituciones ya tienen plan. No hay nada que hacer.");
      return;
    }
    console.log(`${preview.pending.length} instituciones sin plan:`);
    for (const row of preview.pending) console.log(`  · ${row.name} (${row.slug}) → prueba de 30 días, plan ${row.planCode}`);
    if (!apply) {
      console.log(`\nNo se cambió nada. Para asignarles el plan agrega PLANES_CONFIRM=${CONFIRM} antes del comando.`);
      return;
    }
    const result = await backfillMissingSubscriptions(db, { dryRun: false });
    console.log(`\nListo: ${result.created} instituciones recibieron su prueba de 30 días. Quedó en la bitácora del backoffice.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("\nNo se pudo completar. Las instituciones que alcanzaron a recibir plan lo conservan; puedes volver a correrlo.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
