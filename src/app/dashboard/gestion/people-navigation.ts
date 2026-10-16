const directory = "/dashboard/gestion";
const roles = new Set(["estudiantes", "docentes", "coordinadores", "tutores", "administradores"]);

/** Keep a profile's return link within the people directory and its public filters. */
export function peopleReturnHref(value: unknown): string {
  if (typeof value !== "string" || /[\\#\u0000-\u001f\u007f]/.test(value)) return directory;
  const [pathname, search = ""] = value.split("?");
  if (pathname !== directory) return directory;
  const input = new URLSearchParams(search);
  const query = new URLSearchParams();
  const q = input.get("q")?.trim().slice(0, 100);
  const role = input.get("rol");
  if (q) query.set("q", q);
  if (role && roles.has(role)) query.set("rol", role);
  if (input.get("estado") === "suspendidos") query.set("estado", "suspendidos");
  const rawPage = input.get("pagina") ?? "1";
  const page = /^\d+$/.test(rawPage) ? Math.max(1, Math.min(10_000, Number(rawPage))) : 1;
  if (page > 1) query.set("pagina", String(page));
  return query.size ? `${directory}?${query}` : directory;
}

export function peopleProfileHref(id: string, returnHref: string): string {
  return `${directory}/personas/${encodeURIComponent(id)}?${new URLSearchParams({ volver: peopleReturnHref(returnHref) })}`;
}
