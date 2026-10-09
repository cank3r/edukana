import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ScreenRecord } from "./harness";
import { SMOKE_DIR } from "./shared";

/** Al terminar el recorrido junta lo que anotó cada rol y escribe `smoke-artifacts/smoke-report.md`. */
export default function writeSmokeReport() {
  const directory = join(process.cwd(), SMOKE_DIR, "results");
  const records: ScreenRecord[] = existsSync(directory)
    ? readdirSync(directory)
        .filter((file) => file.endsWith(".json"))
        .flatMap((file) => JSON.parse(readFileSync(join(directory, file), "utf8")) as ScreenRecord[])
    : [];
  const projects = ["movil", "escritorio"];
  records.sort((a, b) => projects.indexOf(a.project) - projects.indexOf(b.project) || a.order - b.order);

  const count = (status: ScreenRecord["status"]) => records.filter((record) => record.status === status).length;
  const lines = [
    "# Recorrido en navegador",
    "",
    `Pantallas revisadas: ${records.length} · OK: ${count("OK")} · con defectos: ${count("FALLA")} · con advertencias: ${count("ADVERTENCIA")}`,
    "",
    "Móvil = 390×844, escritorio = 1280×800. Cada fila tiene su captura en `screenshots/`.",
    "",
  ];
  for (const project of projects) {
    const rows = records.filter((record) => record.project === project);
    if (!rows.length) continue;
    lines.push(`## ${project === "movil" ? "Móvil" : "Escritorio"}`, "", "| Rol | Pantalla | URL | Estado | Detalle | Captura |", "|---|---|---|---|---|---|");
    for (const row of rows) {
      lines.push(`| ${row.role} | ${row.screen} | \`${row.url}\` | ${row.status === "ADVERTENCIA" ? "advertencia" : row.status} | ${row.detail || "—"} | ${row.screenshot} |`);
    }
    lines.push("");
  }
  if (!records.length) lines.push("No se registró ninguna pantalla: el recorrido no llegó a empezar. Revisa el log del servidor y el reporte de Playwright.", "");
  writeFileSync(join(process.cwd(), SMOKE_DIR, "smoke-report.md"), lines.join("\n"));
}
