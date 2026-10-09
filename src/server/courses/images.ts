import { db } from "@/lib/db";
import { assetIdFromUrl, privateAssetUrl, publicImageUrl } from "@/lib/uploads";
import { destroyAsset, editableCourse, type UploadActor } from "./uploads";

/**
 * Imagen del curso, foto de perfil y logo. Cada campo guarda la ruta con la que se muestra
 * la imagen: `/api/public-images/<id>` para curso y logo (se ven sin sesión, por ejemplo en
 * el catálogo) y `/api/assets/<id>` para la foto de perfil (solo la ve su dueño por ahora).
 * Al cambiar o quitar una imagen, la anterior se borra del almacenamiento.
 */

export type ImageResult = { ok: true } | { ok: false; message: string };

const NOT_FOUND = "No encontramos la imagen que subiste. Vuelve a elegirla.";
const NO_ACCESS = "No tienes permiso para cambiar esta imagen.";

type Target = { prefix: string; courseId: string | null };

async function uploadedImage(actor: UploadActor, assetId: string, target: Target) {
  if (!assetId) return null;
  return db.storageAsset.findFirst({
    where: {
      id: assetId,
      institutionId: actor.institutionId,
      uploaderId: actor.id,
      kind: "IMAGE",
      confirmedAt: { not: null },
      submissionId: null,
      announcementId: null,
      courseId: target.courseId,
      objectPath: { startsWith: target.prefix },
    },
    select: { id: true },
  });
}

/** Borra la imagen anterior si era un archivo de Edukana de ese mismo uso. */
async function removePrevious(institutionId: string, previousUrl: string | null, kind: "public" | "private", target: Target, keepId?: string) {
  const previousId = assetIdFromUrl(previousUrl, kind);
  if (!previousId || previousId === keepId) return;
  const previous = await db.storageAsset.findFirst({
    where: { id: previousId, institutionId, courseId: target.courseId, objectPath: { startsWith: target.prefix } },
    select: { id: true, bucket: true, objectPath: true },
  });
  if (previous) await destroyAsset(previous);
}

async function audit(actor: UploadActor, action: string, entity: string, entityId: string, changes: Record<string, boolean>) {
  await db.auditLog.create({ data: { institutionId: actor.institutionId, userId: actor.id, action, entity, entityId, changes } });
}

// --- Imagen del curso -------------------------------------------------------

export async function setCourseImage(actor: UploadActor, courseId: string, assetId: string): Promise<ImageResult> {
  const course = await editableCourse(actor, courseId);
  if (!course) return { ok: false, message: NO_ACCESS };
  const target = { prefix: `${actor.institutionId}/public/course/${course.id}/`, courseId: course.id };
  const asset = await uploadedImage(actor, assetId, target);
  if (!asset) return { ok: false, message: NOT_FOUND };
  await db.course.update({ where: { id: course.id }, data: { imageUrl: publicImageUrl(asset.id) } });
  await audit(actor, "COURSE_IMAGE_CHANGED", "Course", course.id, { hadImage: Boolean(course.imageUrl), hasImage: true });
  await removePrevious(actor.institutionId, course.imageUrl, "public", target, asset.id);
  return { ok: true };
}

export async function removeCourseImage(actor: UploadActor, courseId: string): Promise<ImageResult> {
  const course = await editableCourse(actor, courseId);
  if (!course) return { ok: false, message: NO_ACCESS };
  if (!course.imageUrl) return { ok: true };
  await db.course.update({ where: { id: course.id }, data: { imageUrl: null } });
  await audit(actor, "COURSE_IMAGE_CHANGED", "Course", course.id, { hadImage: true, hasImage: false });
  await removePrevious(actor.institutionId, course.imageUrl, "public", { prefix: `${actor.institutionId}/public/course/${course.id}/`, courseId: course.id });
  return { ok: true };
}

// --- Foto de perfil -----------------------------------------------------------

async function activeSelf(actor: UploadActor) {
  return db.user.findFirst({ where: { id: actor.id, institutionId: actor.institutionId, status: "ACTIVE" }, select: { id: true, avatarUrl: true } });
}

export async function setAvatar(actor: UploadActor, assetId: string): Promise<ImageResult> {
  const me = await activeSelf(actor);
  if (!me) return { ok: false, message: "Tu sesión terminó. Vuelve a iniciar sesión." };
  const target = { prefix: `${actor.institutionId}/avatars/${me.id}/`, courseId: null };
  const asset = await uploadedImage(actor, assetId, target);
  if (!asset) return { ok: false, message: NOT_FOUND };
  await db.user.update({ where: { id: me.id }, data: { avatarUrl: privateAssetUrl(asset.id) } });
  await removePrevious(actor.institutionId, me.avatarUrl, "private", target, asset.id);
  return { ok: true };
}

export async function removeAvatar(actor: UploadActor): Promise<ImageResult> {
  const me = await activeSelf(actor);
  if (!me) return { ok: false, message: "Tu sesión terminó. Vuelve a iniciar sesión." };
  if (!me.avatarUrl) return { ok: true };
  await db.user.update({ where: { id: me.id }, data: { avatarUrl: null } });
  await removePrevious(actor.institutionId, me.avatarUrl, "private", { prefix: `${actor.institutionId}/avatars/${me.id}/`, courseId: null });
  return { ok: true };
}

/** La foto propia, para el menú. Null si no tiene o si ya no está disponible. */
export async function ownAvatarAsset(actor: { id: string; institutionId: string }) {
  const me = await db.user.findFirst({ where: { id: actor.id, institutionId: actor.institutionId }, select: { avatarUrl: true } });
  const assetId = assetIdFromUrl(me?.avatarUrl, "private");
  if (!assetId) return null;
  return db.storageAsset.findFirst({
    where: { id: assetId, institutionId: actor.institutionId, uploaderId: actor.id, kind: "IMAGE", confirmedAt: { not: null }, objectPath: { startsWith: `${actor.institutionId}/avatars/${actor.id}/` } },
    select: { bucket: true, objectPath: true, kind: true },
  });
}

// --- Logo de la institución ---------------------------------------------------

async function manageableInstitution(actor: UploadActor) {
  if (!actor.capabilities.has("tenant.settings.manage")) return null;
  return db.institution.findFirst({ where: { id: actor.institutionId }, select: { id: true, logoUrl: true } });
}

export async function setInstitutionLogo(actor: UploadActor, assetId: string): Promise<ImageResult> {
  const institution = await manageableInstitution(actor);
  if (!institution) return { ok: false, message: NO_ACCESS };
  const target = { prefix: `${institution.id}/public/logo/`, courseId: null };
  const asset = await uploadedImage(actor, assetId, target);
  if (!asset) return { ok: false, message: NOT_FOUND };
  await db.institution.update({ where: { id: institution.id }, data: { logoUrl: publicImageUrl(asset.id) } });
  await audit(actor, "INSTITUTION_LOGO_CHANGED", "Institution", institution.id, { hadLogo: Boolean(institution.logoUrl), hasLogo: true });
  await removePrevious(institution.id, institution.logoUrl, "public", target, asset.id);
  return { ok: true };
}

export async function removeInstitutionLogo(actor: UploadActor): Promise<ImageResult> {
  const institution = await manageableInstitution(actor);
  if (!institution) return { ok: false, message: NO_ACCESS };
  if (!institution.logoUrl) return { ok: true };
  await db.institution.update({ where: { id: institution.id }, data: { logoUrl: null } });
  await audit(actor, "INSTITUTION_LOGO_CHANGED", "Institution", institution.id, { hadLogo: true, hasLogo: false });
  await removePrevious(institution.id, institution.logoUrl, "public", { prefix: `${institution.id}/public/logo/`, courseId: null });
  return { ok: true };
}
