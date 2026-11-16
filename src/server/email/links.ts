/** Render links only against a trusted application origin; never promote arbitrary body URLs. */
export function applicationEmailLink(base: string | null, path: string | null | undefined): string | null {
  if (!base || !path || /[\\\s\u0000-\u001f\u007f]/u.test(path) || path.startsWith("//")) return null;
  try {
    const origin = new URL(base);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    if (origin.protocol !== "https:" && !(local && origin.protocol === "http:")) return null;
    if (origin.username || origin.password) return null;
    if (!path.startsWith("/") && !/^https?:\/\//u.test(path)) return null;
    const target = new URL(path, origin);
    if (target.origin !== origin.origin || target.username || target.password) return null;
    return target.href;
  } catch { return null; }
}
