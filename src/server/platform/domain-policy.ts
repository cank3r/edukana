/** Stored domains are hostnames, never URLs, credentials, paths or port-bearing authorities. */
export function normalizeInstitutionDomain(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new Error("Escribe un dominio válido, sin https://, rutas ni puertos.");
  const host = value.trim().toLowerCase();
  if (!host) return null;
  const labels = host.split(".");
  if (host.length > 253 || labels.length < 2 || labels.some((label) =>
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
    !/[a-z]/.test(labels.at(-1)!) || host.endsWith(".localhost")) {
    throw new Error("Escribe un dominio válido, sin https://, rutas ni puertos.");
  }
  return host;
}

/** Parse only the actual Host authority. Forwarded and x-institution-* headers are not trusted. */
export function requestHostname(host: string | null | undefined): string | null {
  if (!host || host !== host.trim()) return null;
  const match = /^([^:]+)(?::([0-9]{1,5}))?$/.exec(host);
  if (!match || (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535))) return null;
  try { return normalizeInstitutionDomain(match[1].replace(/\.$/, "")); } catch { return null; }
}

export function institutionMatchesHost(institutionId: string, hostInstitution: { id: string } | null) {
  return !hostInstitution || hostInstitution.id === institutionId;
}

export function rootDomain(): string | null {
  return normalizeInstitutionDomain(process.env.PLATFORM_ROOT_DOMAIN);
}

export function institutionBaseUrl(institution: { domain?: string | null; slug?: string }): string {
  const domain = validateInstitutionDomain(institution.domain, institution.slug);
  if (domain) return `https://${domain}`;
  const root = rootDomain();
  if (root && institution.slug && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(institution.slug)) {
    return `https://${institution.slug}.${root}`;
  }
  const configured = process.env.APP_URL ?? process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (!configured) throw new Error("APP_URL es obligatorio para crear enlaces de acceso.");
  const url = new URL(configured);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("APP_URL debe ser una URL de acceso válida.");
  }
  return url.origin;
}

/** Replace client-provided routing hints before Auth.js or any server action consumes them. */
export function sanitizeHostHeaders(input: Headers, protocol = "https:"): Headers {
  const clean = new Headers(input);
  for (const key of [...clean.keys()]) {
    if (key.startsWith("x-institution-") || key.startsWith("x-tenant-")) clean.delete(key);
  }
  clean.delete("forwarded");
  const host = clean.get("host");
  if (host) clean.set("x-forwarded-host", host);
  else clean.delete("x-forwarded-host");
  // Production public authorities always use HTTPS. Plain HTTP remains available for local development.
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host ?? "");
  clean.set("x-forwarded-proto", local && protocol === "http:" ? "http" : "https");
  return clean;
}

/** Reserve the root namespace so an operator cannot accidentally shadow another institution. */
export function validateInstitutionDomain(value: unknown, institutionSlug?: string): string | null {
  const host = normalizeInstitutionDomain(value);
  const root = rootDomain();
  if (host && (isPlatformRootHost(host) || (root && host.endsWith(`.${root}`) && host !== `${institutionSlug}.${root}`))) {
    throw new Error("Ese dominio está reservado por la plataforma. Usa el dominio propio de la institución.");
  }
  return host;
}

export function isPlatformRootHost(host: string): boolean {
  if (host === rootDomain()) return true;
  return [process.env.APP_URL, process.env.AUTH_URL, process.env.NEXTAUTH_URL].some((value) => {
    if (!value) return false;
    try { return new URL(value).hostname.toLowerCase() === host; } catch { return false; }
  });
}

/** Build redirect origins from the actual Host, never a forwarded host or preconstructed request URL. */
export function requestOrigin(host: string | null, protocol = "https:"): string | null {
  if (!host || host !== host.trim()) return null;
  if (/^(localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/.test(host)) {
    try { return new URL(`${protocol === "http:" ? "http" : "https"}://${host}`).origin; } catch { return null; }
  }
  const hostname = requestHostname(host);
  if (!hostname) return null;
  const port = /:([0-9]+)$/.exec(host)?.[1];
  return `https://${hostname}${port && port !== "443" ? `:${port}` : ""}`;
}
