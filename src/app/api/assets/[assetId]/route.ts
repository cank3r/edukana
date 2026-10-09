import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { validateAnnouncementUpload } from "@/lib/announcements";
import { createPrivateAssetUrl, inspectPrivateAsset, removePrivateAsset } from "@/lib/storage";
import { assetReadAccess, uploadPurposeOfPath } from "@/server/courses/uploads";
import { signedUrlSeconds } from "@/server/signed-urls";

export async function GET(_request: Request, context: { params: Promise<{ assetId: string }> }) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.institutionId) return Response.json({ error: "No autorizado" }, { status: 401 });
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  const { assetId } = await context.params;
  const access = await assetReadAccess({ id: user.id, institutionId: user.institutionId, role: user.role, capabilities }, assetId);
  if (access.status !== 200) return Response.json({ error: access.status === 404 ? "Archivo no encontrado" : "Permisos insuficientes" }, { status: access.status });
  const { asset } = access;
  try {
    return Response.redirect(await createPrivateAssetUrl(asset.bucket, asset.objectPath, signedUrlSeconds(asset.kind)), 302);
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
    where: { id: assetId, institutionId: user.institutionId, uploaderId: user.id, announcementId: null, confirmedAt: null },
    select: { id: true, bucket: true, objectPath: true, originalName: true, mimeType: true, sizeBytes: true, courseId: true },
  });
  if (!asset || !asset.objectPath.startsWith(`${user.institutionId}/`)) return Response.json({ error: "Carga no encontrada" }, { status: 404 });
  const isAnnouncementAsset = asset.objectPath.startsWith(`${user.institutionId}/announcements/drafts/${user.id}/`);
  if (isAnnouncementAsset) {
    const validationError = validateAnnouncementUpload({ name: asset.originalName, type: asset.mimeType, size: asset.sizeBytes });
    if (validationError) return Response.json({ error: validationError }, { status: 400 });
  } else if (!asset.courseId || !asset.objectPath.startsWith(`${user.institutionId}/${asset.courseId}/`)) {
    return Response.json({ error: "La ruta del archivo no está autorizada" }, { status: 403 });
  }
  try {
    const stored = await inspectPrivateAsset(asset.bucket, asset.objectPath);
    if (stored.size !== asset.sizeBytes || stored.contentType !== asset.mimeType) {
      await removePrivateAsset(asset.bucket, asset.objectPath).catch(() => undefined);
      await db.storageAsset.delete({ where: { id: asset.id } });
      return Response.json({ error: "El archivo recibido no coincide con la carga autorizada" }, { status: 409 });
    }
    await db.storageAsset.update({ where: { id: asset.id }, data: { checksum: stored.etag, confirmedAt: new Date() } });
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
  const asset = await db.storageAsset.findFirst({ where: { id: assetId, institutionId: user.institutionId, uploaderId: user.id, announcementId: null }, select: { id: true, bucket: true, objectPath: true } });
  if (!asset || !asset.objectPath.startsWith(`${user.institutionId}/`)) return Response.json({ error: "Carga no encontrada" }, { status: 404 });
  // Entregas, imágenes de curso, fotos y logos se quitan desde su pantalla (`/api/uploads`), que
  // conserva lo ya entregado y limpia el campo que usa la imagen.
  if (uploadPurposeOfPath(user.institutionId, asset.objectPath)) return Response.json({ error: "Este archivo se quita desde su pantalla." }, { status: 409 });
  await removePrivateAsset(asset.bucket, asset.objectPath).catch(() => undefined);
  await db.storageAsset.delete({ where: { id: asset.id } });
  return new Response(null, { status: 204 });
}
