import { auth } from "@/lib/auth";
import { hasCapability } from "@/lib/capabilities";
import { db } from "@/lib/db";
import { createPrivateAssetUrl, inspectPrivateAsset, removePrivateAsset } from "@/lib/storage";

export async function GET(_request: Request, context: { params: Promise<{ assetId: string }> }) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.institutionId) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { assetId } = await context.params;
  const asset = await db.storageAsset.findFirst({ where: { id: assetId, institutionId: user.institutionId }, select: { bucket: true, objectPath: true, courseId: true, uploaderId: true, visibility: true, submission: { select: { studentId: true } } } });
  if (!asset) return Response.json({ error: "Archivo no encontrado" }, { status: 404 });
  const staff = hasCapability(user.role, "course.view.all");
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



export async function PATCH(_request: Request, context: { params: Promise<{ assetId: string }> }) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.institutionId) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { assetId } = await context.params;
  const asset = await db.storageAsset.findFirst({
    where: { id: assetId, institutionId: user.institutionId, uploaderId: user.id },
    select: { id: true, bucket: true, objectPath: true, mimeType: true, sizeBytes: true },
  });
  if (!asset) return Response.json({ error: "Carga no encontrada" }, { status: 404 });
  try {
    const stored = await inspectPrivateAsset(asset.bucket, asset.objectPath);
    if (stored.size !== asset.sizeBytes || stored.contentType !== asset.mimeType) {
      await removePrivateAsset(asset.bucket, asset.objectPath).catch(() => undefined);
      await db.storageAsset.delete({ where: { id: asset.id } });
      return Response.json({ error: "El archivo recibido no coincide con la carga autorizada" }, { status: 409 });
    }
    await db.storageAsset.update({ where: { id: asset.id }, data: { checksum: stored.etag } });
    return Response.json({ ok: true, retrievalUrl: `/api/assets/${asset.id}` });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo confirmar la carga" }, { status: 503 });
  }
}


export async function DELETE(_request: Request, context: { params: Promise<{ assetId: string }> }) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.institutionId) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { assetId } = await context.params;
  const asset = await db.storageAsset.findFirst({ where: { id: assetId, institutionId: user.institutionId, uploaderId: user.id }, select: { id: true, bucket: true, objectPath: true } });
  if (!asset) return Response.json({ error: "Carga no encontrada" }, { status: 404 });
  await removePrivateAsset(asset.bucket, asset.objectPath).catch(() => undefined);
  await db.storageAsset.delete({ where: { id: asset.id } });
  return new Response(null, { status: 204 });
}