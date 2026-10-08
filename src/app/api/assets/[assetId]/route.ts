import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { courseWhereForScope, resolveCourseReadScope, resolveCourseWriteScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import { getCommunityAnnouncementWhere } from "@/lib/announcement-data";
import { validateAnnouncementUpload } from "@/lib/announcements";
import { createPrivateAssetUrl, inspectPrivateAsset, removePrivateAsset } from "@/lib/storage";
import { signedUrlSeconds } from "@/server/signed-urls";

export async function GET(_request: Request, context: { params: Promise<{ assetId: string }> }) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.institutionId) return Response.json({ error: "No autorizado" }, { status: 401 });
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  const { assetId } = await context.params;
  const asset = await db.storageAsset.findFirst({
    where: { id: assetId, institutionId: user.institutionId, confirmedAt: { not: null } },
    select: { bucket: true, kind: true, objectPath: true, courseId: true, announcementId: true, uploaderId: true, visibility: true, submission: { select: { studentId: true } } },
  });
  if (!asset || !asset.objectPath.startsWith(`${user.institutionId}/`)) return Response.json({ error: "Archivo no encontrado" }, { status: 404 });

  const owner = asset.uploaderId === user.id || asset.submission?.studentId === user.id;
  let allowed = owner;
  if (asset.announcementId && !owner) {
    const recipientWhere = await getCommunityAnnouncementWhere(user, { canManage: capabilities.has("announcement.manage"), canPublish: capabilities.has("announcement.publish") });
    allowed = Boolean(await db.announcement.findFirst({ where: { AND: [{ id: asset.announcementId }, recipientWhere] }, select: { id: true } }));
  } else if (asset.courseId && !owner) {
    const readWhere = courseWhereForScope(user.institutionId, resolveCourseReadScope(user, capabilities));
    const writeWhere = courseWhereForScope(user.institutionId, resolveCourseWriteScope(user, capabilities));
    const readableCourse = readWhere ? Boolean(await db.course.findFirst({ where: { id: asset.courseId, ...readWhere }, select: { id: true } })) : false;
    const manageableCourse = writeWhere ? Boolean(await db.course.findFirst({ where: { id: asset.courseId, ...writeWhere }, select: { id: true } })) : false;
    allowed = manageableCourse || (asset.visibility !== "PRIVATE" && readableCourse);
  }
  if (!allowed) return Response.json({ error: "Permisos insuficientes" }, { status: 403 });
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
  await removePrivateAsset(asset.bucket, asset.objectPath).catch(() => undefined);
  await db.storageAsset.delete({ where: { id: asset.id } });
  return new Response(null, { status: 204 });
}
