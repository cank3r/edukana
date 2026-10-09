"use server";

import { auth } from "@/lib/auth";
import { type Capability } from "@/lib/capabilities";
import { getEffectiveCapabilities, userHasCapability } from "@/lib/authorization";
import { courseWhereForScope, resolveCourseWriteScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import type { EdukanaRole } from "@/types/next-auth";
import { revalidatePath } from "next/cache";
import { announcementContentSchema, announcementRoles, canTargetAnnouncementPeople, externalAnnouncementUrlSchema, isMentionInsideAudience } from "@/lib/announcements";
import type { Role } from "@prisma/client";
import { z } from "zod";
import { notifyAnnouncementPublished } from "@/server/notifications/events";

export type ActionState = { ok: boolean; message: string };
const initialError: ActionState = { ok: false, message: "No se pudo completar la operación." };

type SessionUser = { id: string; institutionId: string; role: EdukanaRole };

async function requireUser(capability?: Capability): Promise<SessionUser> {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!user?.id || !user.institutionId) throw new Error("No autorizado");
  if (capability && !(await userHasCapability(user, capability))) throw new Error("Permisos insuficientes");
  return user;
}

const announcementSchema = z.object({
  title: z.string().trim().min(4, "El título debe tener al menos 4 caracteres").max(140),
  content: announcementContentSchema,
  externalUrl: externalAnnouncementUrlSchema,
  audienceInstitution: z.boolean(),
  roleIds: z.array(z.enum(announcementRoles)).max(announcementRoles.length),
  courseTargetIds: z.array(z.string().min(1)).max(100),
  userTargetIds: z.array(z.string().min(1)).max(500),
  unitTargetIds: z.array(z.string().min(1)).max(100),
  relatedCourseIds: z.array(z.string().min(1)).max(20),
  mentionIds: z.array(z.string().min(1)).max(100),
  assetIds: z.array(z.string().min(1)).max(20),
  isPinned: z.boolean(),
});

const values = (formData: FormData, name: string) => [...new Set(formData.getAll(name).map(String).filter(Boolean))];

export async function createAnnouncement(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("announcement.publish");
    const parsed = announcementSchema.safeParse({
      title: formData.get("title"),
      content: formData.get("content"),
      externalUrl: String(formData.get("externalUrl") ?? ""),
      audienceInstitution: formData.get("audienceInstitution") === "true",
      roleIds: values(formData, "roleIds"),
      courseTargetIds: values(formData, "courseTargetIds"),
      userTargetIds: values(formData, "userTargetIds"),
      unitTargetIds: values(formData, "unitTargetIds"),
      relatedCourseIds: values(formData, "relatedCourseIds"),
      mentionIds: values(formData, "mentionIds"),
      assetIds: values(formData, "assetIds"),
      isPinned: formData.get("isPinned") === "on",
    });
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? initialError.message };
    const data = parsed.data;
    if (!data.audienceInstitution && !data.roleIds.length && !data.courseTargetIds.length && !data.userTargetIds.length && !data.unitTargetIds.length) {
      return { ok: false, message: "Selecciona al menos un destinatario." };
    }

    const courseIds = [...new Set([...data.courseTargetIds, ...data.relatedCourseIds])];
    const userIds = [...new Set([...data.userTargetIds, ...data.mentionIds])];
    const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
    const canTargetPeople = canTargetAnnouncementPeople(capabilities);
    if (userIds.length && !canTargetPeople) return { ok: false, message: "Necesitas permiso para ver personas antes de dirigir o mencionar usuarios específicos." };
    const courseWhere = courseWhereForScope(user.institutionId, resolveCourseWriteScope(user, capabilities));
    const [courses, people, units, assets] = await Promise.all([
      courseIds.length && courseWhere ? db.course.findMany({ where: { id: { in: courseIds }, ...courseWhere }, select: { id: true } }) : [],
      userIds.length && canTargetPeople ? db.user.findMany({
        where: { institutionId: user.institutionId, id: { in: userIds }, status: "ACTIVE" },
        select: { id: true, role: true, enrollments: { where: { status: { in: ["ACTIVE", "COMPLETED"] }, course: { institutionId: user.institutionId } }, select: { courseId: true } }, organizationalMemberships: { where: { institutionId: user.institutionId }, select: { unitId: true } } },
      }) : [],
      data.unitTargetIds.length ? db.organizationalUnit.findMany({ where: { institutionId: user.institutionId, id: { in: data.unitTargetIds } }, select: { id: true } }) : [],
      data.assetIds.length ? db.storageAsset.findMany({ where: { institutionId: user.institutionId, id: { in: data.assetIds }, uploaderId: user.id, announcementId: null, confirmedAt: { not: null }, objectPath: { startsWith: `${user.institutionId}/announcements/drafts/${user.id}/` } }, select: { id: true } }) : [],
    ]);
    if (courses.length !== courseIds.length) return { ok: false, message: "Uno de los cursos no está dentro de tu alcance de gestión." };
    if (people.length !== userIds.length) return { ok: false, message: "Una de las personas no pertenece a esta institución." };
    if (units.length !== data.unitTargetIds.length) return { ok: false, message: "Una de las unidades no pertenece a esta institución." };
    if (assets.length !== data.assetIds.length) return { ok: false, message: "Uno de los archivos no está confirmado o no está autorizado." };

    const audience = { institution: data.audienceInstitution, roles: data.roleIds as Role[], courseIds: data.courseTargetIds, userIds: data.userTargetIds, unitIds: data.unitTargetIds };
    const mentioned = new Set(data.mentionIds);
    for (const person of people.filter((item) => mentioned.has(item.id))) {
      if (!isMentionInsideAudience({ id: person.id, role: person.role, courseIds: person.enrollments.map((item) => item.courseId), unitIds: person.organizationalMemberships.map((item) => item.unitId) }, audience)) {
        return { ok: false, message: `La mención de ${person.id} está fuera de la audiencia.` };
      }
    }

    await db.$transaction(async (tx) => {
      const legacy = data.audienceInstitution
        ? { audience: "ALL" as const, audienceId: null }
        : data.roleIds.length === 1 && !data.courseTargetIds.length && !data.userTargetIds.length && !data.unitTargetIds.length
          ? { audience: "ROLE" as const, audienceId: data.roleIds[0] }
          : data.courseTargetIds.length === 1 && !data.roleIds.length && !data.userTargetIds.length && !data.unitTargetIds.length
            ? { audience: "COURSE" as const, audienceId: data.courseTargetIds[0] }
            : { audience: "ROLE" as const, audienceId: null };
      const announcement = await tx.announcement.create({
        data: {
          institutionId: user.institutionId,
          authorId: user.id,
          title: data.title,
          content: data.content,
          externalUrl: data.externalUrl || null,
          audienceInstitution: data.audienceInstitution,
          ...legacy,
          isPinned: data.isPinned,
          roleTargets: { create: data.roleIds.map((role) => ({ institutionId: user.institutionId, role })) },
          courseTargets: { create: data.courseTargetIds.map((courseId) => ({ institutionId: user.institutionId, courseId })) },
          userTargets: { create: data.userTargetIds.map((userId) => ({ institutionId: user.institutionId, userId })) },
          unitTargets: { create: data.unitTargetIds.map((unitId) => ({ institutionId: user.institutionId, unitId })) },
          relatedCourses: { create: data.relatedCourseIds.map((courseId) => ({ institutionId: user.institutionId, courseId })) },
          mentions: { create: data.mentionIds.map((userId) => ({ institutionId: user.institutionId, userId })) },
        },
        select: { id: true },
      });
      await tx.auditLog.create({ data: { institutionId: user.institutionId, userId: user.id, action: "announcement.publish", entity: "Announcement", entityId: announcement.id, changes: { audienceInstitution: data.audienceInstitution, roles: data.roleIds, courses: data.courseTargetIds, users: data.userTargetIds, units: data.unitTargetIds, assetCount: data.assetIds.length } } });
      if (data.assetIds.length) {
        const attached = await tx.storageAsset.updateMany({ where: { id: { in: data.assetIds }, institutionId: user.institutionId, uploaderId: user.id, announcementId: null, confirmedAt: { not: null } }, data: { announcementId: announcement.id, visibility: "INSTITUTION" } });
        if (attached.count !== data.assetIds.length) throw new Error("ANNOUNCEMENT_ASSET_RACE");
      }
    });
    // Nunca lanza: si notificar falla, el aviso ya quedó publicado.
    await notifyAnnouncementPublished(user, { title: data.title, content: data.content, audience });
    revalidatePath("/dashboard/comunidad");
    revalidatePath("/dashboard/hijos");
    return { ok: true, message: "Anuncio publicado correctamente." };
  } catch (error) {
    const correlationId = crypto.randomUUID();
    console.error("createAnnouncement failed", { correlationId, error });
    return { ok: false, message: `No se pudo publicar el anuncio. Intenta de nuevo. Código: ${correlationId}` };
  }
}
