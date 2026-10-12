/** Non-secret identity of a connection, never a password or connection URL. */
export type DemoConnectionTarget = Readonly<{
  hostname: string; port: string; database: string; username: string; schema: string;
}>;
export type ApprovedDemoTarget = Readonly<{
  id: string;
  environment: "isolated-preview";
  database: DemoConnectionTarget;
  direct: DemoConnectionTarget;
}>;
export type DemoTargetEnv = Readonly<Record<string, string | undefined>>;

function reject(): never {
  throw new Error("Destino de demo no autorizado. Usa una base aislada verificada y el contrato de docs/demo.md; no se abrió ninguna conexión.");
}
function parse(raw: string | undefined): DemoConnectionTarget {
  if (!raw || /[\u0000-\u0020\u007f]/.test(raw)) return reject();
  // Check the original path before URL can normalize /other/../database or encoded dot segments.
  if (!/^postgres(?:ql)?:\/\/[^/?#]+\/[A-Za-z][A-Za-z0-9_-]{0,62}(?:\?[^#]*)?$/.test(raw)) return reject();
  let url: URL;
  try { url = new URL(raw); } catch { return reject(); }
  if (!["postgresql:", "postgres:"].includes(url.protocol) || url.hash || !url.hostname) return reject();
  if (!/^\/[A-Za-z][A-Za-z0-9_-]{0,62}$/.test(url.pathname)) return reject();
  const username = url.username;
  if (!/^[A-Za-z0-9_.-]+$/.test(username) || !url.password || url.port === "0") return reject();
  try { decodeURIComponent(url.password); } catch { return reject(); }
  const seen = new Set<string>();
  for (const [key, value] of url.searchParams) {
    if (seen.has(key)) return reject();
    seen.add(key);
    if (key === "schema") { if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) return reject(); }
    else if (key === "sslmode") { if (!["require", "verify-ca", "verify-full", "disable"].includes(value)) return reject(); }
    else if (key === "pgbouncer") { if (!["true", "false"].includes(value)) return reject(); }
    else if (["connection_limit", "connect_timeout", "pool_timeout"].includes(key)) { if (!/^\d{1,4}$/.test(value)) return reject(); }
    else return reject(); // host, hostaddr, service, options and unknown routing keys are forbidden.
  }
  return Object.freeze({ hostname: url.hostname.toLowerCase(), port: url.port || "5432", database: url.pathname.slice(1), username, schema: url.searchParams.get("schema") || "public" });
}
function same(a: DemoConnectionTarget, b: DemoConnectionTarget) {
  return (["hostname", "port", "database", "username", "schema"] as const).every((key) => a[key] === b[key]);
}

/** CLI accident barrier, not proof of physical isolation; a loopback port may be a tunnel. */
export function validateDemoTarget(env: DemoTargetEnv, approved: readonly ApprovedDemoTarget[]) {
  // Explicit non-production labels only; whitespace, unknown/custom environments and contradictions are unsafe.
  if (env.NODE_ENV !== undefined && !["development", "test"].includes(env.NODE_ENV)) return reject();
  for (const key of ["VERCEL_ENV", "VERCEL_TARGET_ENV"]) {
    if (env[key] !== undefined && !["development", "preview"].includes(env[key]!)) return reject();
  }
  if (env.VERCEL_ENV !== undefined && env.VERCEL_TARGET_ENV !== undefined &&
      env.VERCEL_ENV !== env.VERCEL_TARGET_ENV) return reject();
  const database = parse(env.DATABASE_URL);
  const direct = parse(env.DIRECT_URL);
  if (env.DEMO_TARGET === "isolated-local") {
    if (env.DEMO_TARGET_ID !== undefined || !["127.0.0.1", "[::1]", "localhost"].includes(database.hostname) ||
        !/^edukana_demo_[a-z0-9_]+$/.test(database.database) || !same(database, direct)) return reject();
  } else if (env.DEMO_TARGET === "isolated-preview") {
    if (!env.DEMO_TARGET_ID || env.DEMO_TARGET_ID.trim() !== env.DEMO_TARGET_ID) return reject();
    const matches = approved.filter((entry) => entry.id === env.DEMO_TARGET_ID);
    if (matches.length !== 1) return reject();
    const target = matches[0];
    if (target.environment !== "isolated-preview" || !same(database, target.database) || !same(direct, target.direct)) return reject();
    // A verified remote target still requires encrypted connections.
    for (const raw of [env.DATABASE_URL!, env.DIRECT_URL!]) {
      if (!["require", "verify-ca", "verify-full"].includes(new URL(raw).searchParams.get("sslmode") ?? "")) return reject();
    }
  } else return reject();
  return Object.freeze({ databaseUrl: env.DATABASE_URL!, directUrl: env.DIRECT_URL!, target: database });
}
