import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createPrivateAssetUrl } from "@/lib/storage";

export async function GET(_request: Request, context: { params: Promise<{ assetId: string }> }) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.institutionId) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { assetId } = await context.params;
  const asset = await db.storageAsset.findFirst({ where: { id: assetId, institutionId: user.institutionId }, select: { bucket: true, objectPath: true, courseId: true, uploaderId: true, visibility: true, submission: { select: { studentId: true } } } });
  if (!asset) return Response.json({ error: "Archivo no encontrado" }, { status: 404 });
  const staff = ["SUPER_ADMIN", "ADMIN", "COORDINATOR"].includes(user.role);
  const teacher = asset.courseId ? Boolean(await db.course.findFirst({ where: { id: asset.courseId, institutionId: user.institutionId, teacherId: user.id }, select: { id: true } })) : false;
  const enrolled = asset.courseId ? Boolean(await db.enrollment.findFirst({ where: { courseId: asset.courseId, studentId: user.id, status: { in: ["ACTIVE", "COMPLETED"] } }, select: { id: true } })) : false;
  const owner = asset.uploaderId === user.id || asset.submission?.studentId === user.id;
  const allowed = staff || teacher || owner || (asset.visibility !== "PRIVATE" && enrolled);
  if (!allowed) return Response.json({ error: "Permisos insuficientes" }, { status: 403 });
  try {
    return Response.redirect(await createPrivateAssetUrl(asset.bucket, asset.objectPath, 300), 302);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Storage no disponible" }, { status: 503 });
  }
}
