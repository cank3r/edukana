import { auth } from "@/lib/auth";
import { isReportSection, reportCsvFile } from "@/server/reports/export";

export const dynamic = "force-dynamic";

/**
 * Descarga una sección de los reportes en CSV: `?seccion=cursos|riesgo|docentes|acceso|grupos|programas|cobros`,
 * con los mismos filtros de la pantalla (`periodo`, `programa`).
 * El permiso de reportes, el de cobros y la institución se verifican dentro de `reportCsvFile`.
 */
export async function GET(request: Request) {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return new Response("Inicia sesión para descargar los reportes.", { status: 401 });
  const query = new URL(request.url).searchParams;
  const section = query.get("seccion");
  if (!isReportSection(section)) return new Response("No encontramos ese reporte. Vuelve a Reportes y elige «Descargar en CSV».", { status: 404 });
  const csv = await reportCsvFile(
    { id: user.id, institutionId: user.institutionId, role: user.role },
    section,
    { periodId: query.get("periodo"), programId: query.get("programa") },
  );
  if (!csv) return new Response("No tienes permiso para descargar este reporte.", { status: 403 });
  return new Response(csv.content, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csv.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
