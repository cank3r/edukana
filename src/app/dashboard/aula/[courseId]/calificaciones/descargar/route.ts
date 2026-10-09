import { auth } from "@/lib/auth";
import { gradebookCsv } from "@/server/assessment/gradebook";

export const dynamic = "force-dynamic";

/** Descarga la tabla de notas del curso en CSV. Solo para quien gestiona ese curso. */
export async function GET(_request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return new Response("Inicia sesión para descargar las notas.", { status: 401 });
  const { courseId } = await params;
  const csv = await gradebookCsv({ id: user.id, institutionId: user.institutionId, role: user.role }, courseId);
  if (!csv) return new Response("No encontramos ese curso o no tienes permiso para ver sus notas.", { status: 404 });
  return new Response(csv.content, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csv.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
