import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { validateAnnouncementUpload } from "@/lib/announcements";
import { createPrivateAssetUrl, inspectPrivateAsset, removePrivateAsset } from "@/lib/storage";
import { assetReadAccess, editableCourse, uploadPurposeOfPath, type UploadActor } from "@/server/courses/uploads";
import { signedUrlSeconds } from "@/server/signed-urls";

type MutableAsset = { id: string; objectPath: string; courseId: string | null; submissionId: string | null };

async function mutationDenied(actor: UploadActor, asset: MutableAsset): Promise<Response | null> {
  // Old delivery files can use course folders and lose submissionId when archived. Keep both versions.
  if (asset.submissionId || uploadPurposeOfPath(actor.institutionId, asset.objectPath)
    || await db.submissionRevision.findFirst({
      where: { institutionId: actor.institutionId, assetIds: { array_contains: [asset.id] } }, select: { id: true },
    })) {
    return Response.json({ error: "Este archivo se conserva como parte de su entrega o se gestiona desde su pantalla." }, { status: 409 });
  }
  const announcementDraft = asset.objectPath.startsWith(`${actor.institutionId}/announcements/drafts/${actor.id}/`);
  const allowed = announcementDraft
    ? actor.capabilities.has("announcement.publish")
    : asset.courseId && asset.objectPath.startsWith(`${actor.institutionId}/${asset.courseId}/`)
      && await editableCourse(actor, asset.courseId);
  return allowed ? null : Response.json({ error: "Permisos insuficientes" }, { status: 403 });
}

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
    select: { id: true, bucket: true, objectPath: true, originalName: true, mimeType: true, sizeBytes: true, courseId: true, submissionId: true },
  });
  if (!asset || !asset.objectPath.startsWith(`${user.institutionId}/`)) return Response.json({ error: "Carga no encontrada" }, { status: 404 });
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  const denied = await mutationDenied({ ...user, capabilities }, asset);
  if (denied) return denied;
  const isAnnouncementAsset = asset.objectPath.startsWith(`${user.institutionId}/announcements/drafts/${user.id}/`);
  if (isAnnouncementAsset) {
    const validationError = validateAnnouncementUpload({ name: asset.originalName, type: asset.mimeType, size: asset.sizeBytes });
    if (validationError) return Response.json({ error: validationError }, { status: 400 });
  } else if (!asset.courseId || !asset.objectPath.startsWith(`${user.institutionId}/${asset.courseId}/`)) {
    return Response.json({ error: "La ruta del archivo no está autorizada" }, { status: 403 });
  }
  try {
    const stored = await inspectPrivateAsset(asset.bucket, asset.objectPath);
    const where = { id: asset.id, institutionId: user.institutionId, uploaderId: user.id, objectPath: asset.objectPath,
      announcementId: null, submissionId: null, confirmedAt: null };
    if (stored.size !== asset.sizeBytes || stored.contentType !== asset.mimeType) {
      const discarded = await db.storageAsset.deleteMany({ where });
      if (discarded.count !== 1) return Response.json({ error: "El archivo cambió. Recarga la página." }, { status: 409 });
      await removePrivateAsset(asset.bucket, asset.objectPath).catch(() => undefined);
      return Response.json({ error: "El archivo recibido no coincide con la carga autorizada" }, { status: 409 });
    }
    const confirmed = await db.storageAsset.updateMany({ where, data: { checksum: stored.etag, confirmedAt: new Date() } });
    if (confirmed.count !== 1) return Response.json({ error: "El archivo cambió. Recarga la página." }, { status: 409 });
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
  const asset = await db.storageAsset.findFirst({
    where: { id: assetId, institutionId: user.institutionId, uploaderId: user.id, announcementId: null },
    select: { id: true, bucket: true, objectPath: true, courseId: true, submissionId: true },
  });
  if (!asset || !asset.objectPath.startsWith(`${user.institutionId}/`)) return Response.json({ error: "Carga no encontrada" }, { status: 404 });
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  const denied = await mutationDenied({ ...user, capabilities }, asset);
  if (denied) return denied;
  // Claim the unused row before deleting bytes; publication/attachment may have won after the read.
  const discarded = await db.storageAsset.deleteMany({ where: {
    id: asset.id, institutionId: user.institutionId, uploaderId: user.id, objectPath: asset.objectPath,
    announcementId: null, submissionId: null,
  } });
  if (discarded.count !== 1) return Response.json({ error: "El archivo cambió. Recarga la página." }, { status: 409 });
  await removePrivateAsset(asset.bucket, asset.objectPath).catch(() => undefined);
  return new Response(null, { status: 204 });
}
