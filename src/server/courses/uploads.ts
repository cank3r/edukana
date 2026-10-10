import type { AssetKind, AssetVisibility, Prisma } from "@prisma/client";
import type { Capability } from "@/lib/capabilities";
import { courseWhereForScope, resolveCourseReadScope, resolveCourseWriteScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import { getCommunityAnnouncementWhere } from "@/lib/announcement-data";
import {
  createAvatarUpload,
  createPublicImageUpload,
  createSubmissionFileUpload,
  inspectPrivateAsset,
  readPrivateAssetHead,
  removePrivateAsset,
} from "@/lib/storage";
import {
  cleanFileName,
  contentMatchesType,
  publicImageUrl,
  SIGNATURE_BYTES,
  SUBMISSION_MAX_FILES,
  validateUploadRequest,
  type UploadPurpose,
} from "@/lib/uploads";
import { assignmentSubmissionAccess } from "@/server/assessment/assignment-policies";
import type { EdukanaRole } from "@/types/next-auth";

/**
 * Subidas directas firmadas para entregas, imagen del curso, foto de perfil y logo.
 * Mismo mecanismo que lecciones y avisos: (1) se autoriza y se reserva el archivo,
 * (2) el navegador lo sube directo al almacenamiento, (3) se confirma comprobando tamaño,
 * tipo declarado y la firma de bytes del contenido. Lo que no coincide se borra.
 */

export type UploadActor = { id: string; institutionId: string; role: EdukanaRole; capabilities: ReadonlySet<Capability> };
export type UploadResult<T> = ({ ok: true } & T) | { ok: false; status: number; message: string };

const fail = (status: number, message: string) => ({ ok: false, status, message }) as const;
const NOT_ALLOWED = "No tienes permiso para subir este archivo.";

/** Carpeta de cada uso dentro de la institución. Las rutas de la API de lecciones no las confirman. */
export function uploadPurposeOfPath(institutionId: string, objectPath: string): UploadPurpose | null {
  if (objectPath.startsWith(`${institutionId}/submissions/`)) return "submission";
  if (objectPath.startsWith(`${institutionId}/public/course/`)) return "course-image";
  if (objectPath.startsWith(`${institutionId}/public/logo/`)) return "logo";
  if (objectPath.startsWith(`${institutionId}/avatars/`)) return "avatar";
  return null;
}

/** Archivos de entrega que el estudiante subió y todavía no forman parte de una entrega. */
export function pendingSubmissionFilesWhere(student: { id: string; institutionId: string }, assignmentId: string): Prisma.StorageAssetWhereInput {
  return {
    institutionId: student.institutionId,
    uploaderId: student.id,
    assignmentId,
    submissionId: null,
    confirmedAt: { not: null },
    objectPath: { startsWith: `${student.institutionId}/submissions/` },
  };
}

type Reservation = {
  courseId: string | null;
  assignmentId: string | null;
  kind: AssetKind;
  visibility: AssetVisibility;
  upload: () => Promise<{ bucket: string; objectPath: string; signedUrl: string }>;
};

async function reserveSubmissionFile(actor: UploadActor, assignmentId: string, fileName: string, now: Date): Promise<UploadResult<{ reservation: Omit<Reservation, "kind"> }>> {
  if (actor.role !== "STUDENT" || !actor.capabilities.has("course.participate")) return fail(403, "Solo los estudiantes del curso pueden adjuntar archivos a su entrega.");
  const assignment = assignmentId
    ? await db.assignment.findFirst({
        where: { id: assignmentId, isPublished: true, course: { institutionId: actor.institutionId, isPublished: true } },
        select: { id: true, courseId: true, dueDate: true, allowLate: true },
      })
    : null;
  if (!assignment) return fail(404, "Esta tarea no está disponible para ti.");
  const enrollment = await db.enrollment.findFirst({ where: { studentId: actor.id, courseId: assignment.courseId, status: "ACTIVE" }, select: { id: true } });
  if (!enrollment) return fail(404, "Esta tarea no está disponible para ti.");
  const current = await db.submission.findUnique({
    where: { assignmentId_studentId: { assignmentId: assignment.id, studentId: actor.id } },
    select: { status: true, fileUrls: true },
  });
  const access = assignmentSubmissionAccess(assignment, current, true, now);
  if (!access.allowed) return fail(403, access.why);
  const pending = await db.storageAsset.count({ where: pendingSubmissionFilesWhere(actor, assignment.id) });
  if (pending >= SUBMISSION_MAX_FILES) return fail(400, `Ya tienes ${SUBMISSION_MAX_FILES} archivos listos. Quita uno para agregar otro.`);
  return {
    ok: true,
    reservation: {
      courseId: assignment.courseId,
      assignmentId: assignment.id,
      visibility: "PRIVATE",
      upload: () => createSubmissionFileUpload({ institutionId: actor.institutionId, courseId: assignment.courseId, assignmentId: assignment.id, userId: actor.id, fileName }),
    },
  };
}

/** El curso, solo si quien actúa puede editarlo (docente titular o gestión de todos los cursos). */
export async function editableCourse(actor: UploadActor, courseId: string) {
  const scope = resolveCourseWriteScope(actor, actor.capabilities);
  const where = courseWhereForScope(actor.institutionId, scope);
  if (!where || !courseId || (scope.kind !== "all" && scope.kind !== "teacher")) return null;
  return db.course.findFirst({ where: { id: courseId, ...where }, select: { id: true, name: true, imageUrl: true } });
}

/** Paso 1: autoriza la subida y reserva el archivo. Devuelve la URL firmada para subirlo. */
export async function prepareUpload(
  actor: UploadActor,
  input: { purpose: UploadPurpose; name: string; type: string; size: number; assignmentId?: string | null; courseId?: string | null },
  now = new Date(),
): Promise<UploadResult<{ assetId: string; uploadUrl: string }>> {
  if (!actor.id || !actor.institutionId) return fail(401, "Tu sesión terminó. Vuelve a iniciar sesión.");
  const invalid = validateUploadRequest(input.purpose, input);
  if (invalid) return fail(400, invalid);
  const originalName = cleanFileName(input.name);

  let reservation: Reservation;
  if (input.purpose === "submission") {
    const reserved = await reserveSubmissionFile(actor, input.assignmentId ?? "", originalName, now);
    if (!reserved.ok) return reserved;
    reservation = { ...reserved.reservation, kind: input.type.startsWith("image/") ? "IMAGE" : "DOCUMENT" };
  } else if (input.purpose === "course-image") {
    const course = await editableCourse(actor, input.courseId ?? "");
    if (!course) return fail(403, NOT_ALLOWED);
    reservation = {
      courseId: course.id,
      assignmentId: null,
      kind: "IMAGE",
      visibility: "INSTITUTION",
      upload: () => createPublicImageUpload({ institutionId: actor.institutionId, scope: "course", ownerId: course.id, fileName: originalName }),
    };
  } else if (input.purpose === "logo") {
    if (!actor.capabilities.has("tenant.settings.manage")) return fail(403, NOT_ALLOWED);
    reservation = {
      courseId: null,
      assignmentId: null,
      kind: "IMAGE",
      visibility: "INSTITUTION",
      upload: () => createPublicImageUpload({ institutionId: actor.institutionId, scope: "logo", ownerId: actor.institutionId, fileName: originalName }),
    };
  } else {
    const me = await db.user.findFirst({ where: { id: actor.id, institutionId: actor.institutionId, status: "ACTIVE" }, select: { id: true } });
    if (!me) return fail(401, "Tu sesión terminó. Vuelve a iniciar sesión.");
    reservation = {
      courseId: null,
      assignmentId: null,
      kind: "IMAGE",
      visibility: "PRIVATE",
      upload: () => createAvatarUpload({ institutionId: actor.institutionId, userId: actor.id, fileName: originalName }),
    };
  }

  try {
    const upload = await reservation.upload();
    const asset = await db.storageAsset.create({
      data: {
        institutionId: actor.institutionId,
        courseId: reservation.courseId,
        assignmentId: reservation.assignmentId,
        uploaderId: actor.id,
        bucket: upload.bucket,
        objectPath: upload.objectPath,
        originalName,
        mimeType: input.type,
        sizeBytes: input.size,
        kind: reservation.kind,
        visibility: reservation.visibility,
      },
      select: { id: true },
    });
    return { ok: true, assetId: asset.id, uploadUrl: upload.signedUrl };
  } catch (error) {
    console.error("prepareUpload failed", { error });
    return fail(503, "No pudimos preparar la subida. Intenta de nuevo en unos minutos.");
  }
}

/** Borra el archivo guardado y su registro. Si el almacenamiento falla, el registro igual se borra. */
export async function destroyAsset(asset: { id: string; bucket: string; objectPath: string }) {
  await removePrivateAsset(asset.bucket, asset.objectPath).catch((error) => console.error("removePrivateAsset failed", { assetId: asset.id, error }));
  await db.storageAsset.deleteMany({ where: { id: asset.id } });
}

/**
 * Paso 3: confirma la subida. Comprueba que el archivo guardado pese lo declarado, tenga el tipo
 * declarado y que su contenido empiece con la firma de ese formato (un .exe renombrado a .pdf no pasa).
 */
export async function confirmUpload(actor: UploadActor, assetId: string): Promise<UploadResult<{ assetId: string }>> {
  const asset = assetId
    ? await db.storageAsset.findFirst({
        where: { id: assetId, institutionId: actor.institutionId, uploaderId: actor.id, announcementId: null, confirmedAt: null },
        select: { id: true, bucket: true, objectPath: true, mimeType: true, sizeBytes: true },
      })
    : null;
  const purpose = asset ? uploadPurposeOfPath(actor.institutionId, asset.objectPath) : null;
  if (!asset || !purpose) return fail(404, "No encontramos esa subida. Vuelve a elegir el archivo.");
  try {
    const stored = await inspectPrivateAsset(asset.bucket, asset.objectPath);
    const head = stored.size === asset.sizeBytes && stored.contentType === asset.mimeType ? await readPrivateAssetHead(asset.bucket, asset.objectPath, SIGNATURE_BYTES) : null;
    if (!head || !contentMatchesType(purpose, asset.mimeType, head)) {
      await destroyAsset(asset);
      return fail(409, "El contenido del archivo no corresponde a su tipo. Revisa que sea el archivo correcto y vuelve a subirlo.");
    }
    await db.storageAsset.update({ where: { id: asset.id }, data: { checksum: stored.etag, confirmedAt: new Date() } });
    return { ok: true, assetId: asset.id };
  } catch (error) {
    console.error("confirmUpload failed", { assetId: asset.id, error });
    return fail(503, "No pudimos comprobar el archivo. Intenta subirlo de nuevo.");
  }
}

/**
 * Descarta una subida propia que todavía no se usa: una que no llegó a confirmarse, o un archivo
 * de entrega listo pero aún no entregado. Lo ya entregado se conserva como evidencia.
 */
export async function discardUpload(actor: UploadActor, assetId: string): Promise<UploadResult<object>> {
  const asset = assetId
    ? await db.storageAsset.findFirst({
        where: { id: assetId, institutionId: actor.institutionId, uploaderId: actor.id, announcementId: null, submissionId: null },
        select: { id: true, bucket: true, objectPath: true, confirmedAt: true, assignmentId: true },
      })
    : null;
  const purpose = asset ? uploadPurposeOfPath(actor.institutionId, asset.objectPath) : null;
  if (!asset || !purpose) return fail(404, "Ese archivo ya no está.");
  const pendingSubmissionFile = purpose === "submission" && Boolean(asset.assignmentId);
  if (asset.confirmedAt && !pendingSubmissionFile) return fail(409, "Este archivo está en uso y no se puede quitar desde aquí.");
  await destroyAsset(asset);
  return { ok: true };
}

/**
 * Quién puede abrir un archivo privado (`/api/assets/[assetId]`): quien lo subió, el estudiante
 * dueño de la entrega, quien gestiona el curso, y quien puede ver el curso si el archivo no es privado.
 */
export async function assetReadAccess(actor: UploadActor, assetId: string): Promise<
  { status: 200; asset: { bucket: string; kind: AssetKind; objectPath: string } } | { status: 403 | 404 }
> {
  const asset = assetId
    ? await db.storageAsset.findFirst({
        where: { id: assetId, institutionId: actor.institutionId, confirmedAt: { not: null } },
        select: { bucket: true, kind: true, objectPath: true, courseId: true, announcementId: true, uploaderId: true, visibility: true, submission: { select: { studentId: true } } },
      })
    : null;
  if (!asset || !asset.objectPath.startsWith(`${actor.institutionId}/`)) return { status: 404 };

  const owner = asset.uploaderId === actor.id || asset.submission?.studentId === actor.id;
  let allowed = owner;
  if (asset.announcementId && !owner) {
    const recipientWhere = await getCommunityAnnouncementWhere(actor, { canManage: actor.capabilities.has("announcement.manage"), canPublish: actor.capabilities.has("announcement.publish") });
    allowed = Boolean(await db.announcement.findFirst({ where: { AND: [{ id: asset.announcementId }, recipientWhere] }, select: { id: true } }));
  } else if (asset.courseId && !owner) {
    const readWhere = courseWhereForScope(actor.institutionId, resolveCourseReadScope(actor, actor.capabilities));
    const writeWhere = courseWhereForScope(actor.institutionId, resolveCourseWriteScope(actor, actor.capabilities));
    const readableCourse = readWhere ? Boolean(await db.course.findFirst({ where: { id: asset.courseId, ...readWhere }, select: { id: true } })) : false;
    const manageableCourse = writeWhere ? Boolean(await db.course.findFirst({ where: { id: asset.courseId, ...writeWhere }, select: { id: true } })) : false;
    allowed = manageableCourse || (asset.visibility !== "PRIVATE" && readableCourse);
  }
  if (!allowed) return { status: 403 };
  return { status: 200, asset: { bucket: asset.bucket, kind: asset.kind, objectPath: asset.objectPath } };
}

const PUBLIC_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * La única puerta sin sesión: sirve un archivo solo si es una imagen confirmada guardada en la
 * carpeta pública de su institución Y es hoy la imagen de un curso o el logo de esa institución.
 * Cualquier otro archivo (entregas, fotos de perfil, lecciones, avisos) responde como inexistente.
 */
export async function publicImageAsset(assetId: string, institutionId?: string) {
  if (!assetId || !/^[a-z0-9]{10,40}$/i.test(assetId)) return null;
  const asset = await db.storageAsset.findFirst({
    where: { id: assetId, ...(institutionId ? { institutionId } : {}), kind: "IMAGE", confirmedAt: { not: null }, announcementId: null, submissionId: null },
    select: { id: true, institutionId: true, bucket: true, objectPath: true, mimeType: true, courseId: true },
  });
  if (!asset || !PUBLIC_IMAGE_TYPES.has(asset.mimeType)) return null;
  const purpose = uploadPurposeOfPath(asset.institutionId, asset.objectPath);
  const url = publicImageUrl(asset.id);
  let inUse = false;
  if (purpose === "course-image" && asset.courseId) {
    inUse = Boolean(await db.course.findFirst({ where: { id: asset.courseId, institutionId: asset.institutionId, imageUrl: url }, select: { id: true } }));
  } else if (purpose === "logo") {
    inUse = Boolean(await db.institution.findFirst({ where: { id: asset.institutionId, logoUrl: url }, select: { id: true } }));
  }
  return inUse ? { bucket: asset.bucket, objectPath: asset.objectPath, mimeType: asset.mimeType } : null;
}
