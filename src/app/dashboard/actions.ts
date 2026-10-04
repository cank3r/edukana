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

function fields(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

const moduleSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().trim().min(3, "El título debe tener al menos 3 caracteres").max(120),
  description: z.string().trim().max(500).optional(),
  content: z.string().trim().min(10, "El contenido debe tener al menos 10 caracteres").max(20000),
  isPublished: z.preprocess((value) => value === "on", z.boolean()),
});

export async function createCourseModule(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("course.manage");
    const parsed = moduleSchema.safeParse(fields(formData));
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? initialError.message };
    const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
    const courseWhere = courseWhereForScope(user.institutionId, resolveCourseWriteScope(user, capabilities));
    if (!courseWhere) return { ok: false, message: "Curso no encontrado o sin acceso." };
    const course = await db.course.findFirst({
      where: { id: parsed.data.courseId, ...courseWhere },
      select: { id: true, _count: { select: { modules: true } } },
    });
    if (!course) return { ok: false, message: "Curso no encontrado o sin acceso." };
    await db.courseModule.create({
      data: {
        courseId: course.id,
        title: parsed.data.title,
        description: parsed.data.description || null,
        content: parsed.data.content,
        isPublished: parsed.data.isPublished,
        order: course._count.modules,
      },
    });
    revalidatePath(`/dashboard/aula/${course.id}`);
    return { ok: true, message: "Contenido publicado correctamente." };
  } catch {
    return initialError;
  }
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
    revalidatePath("/dashboard/comunidad");
    revalidatePath("/dashboard/hijos");
    return { ok: true, message: "Anuncio publicado correctamente." };
  } catch (error) {
    const correlationId = crypto.randomUUID();
    console.error("createAnnouncement failed", { correlationId, error });
    return { ok: false, message: `No se pudo publicar el anuncio. Intenta de nuevo. Código: ${correlationId}` };
  }
}

const admissionSchema = z.object({
  name: z.string().trim().min(3, "El nombre debe tener al menos 3 caracteres").max(120),
  email: z.string().trim().toLowerCase().email("Correo inválido").max(200),
  phone: z.string().trim().max(30).optional(),
  programInterest: z.string().trim().max(120).optional(),
  source: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function createAdmission(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("admissions.manage");
    const parsed = admissionSchema.safeParse(fields(formData));
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? initialError.message };
    await db.admissionLead.create({ data: { institutionId: user.institutionId, ...parsed.data } });
    revalidatePath("/dashboard/admisiones");
    return { ok: true, message: "Solicitud registrada correctamente." };
  } catch {
    return initialError;
  }
}

const paymentSchema = z.object({
  paymentId: z.string().optional(),
  studentId: z.string().optional(),
  periodId: z.string().optional(),
  concept: z.string().trim().min(3, "El concepto debe tener al menos 3 caracteres").max(160),
  amount: z.coerce.number().positive("El monto debe ser mayor que cero").max(100000000),
  currency: z.enum(["DOP", "USD"]),
  dueDate: z.string().optional(),
  status: z.enum(["PENDING", "PAID", "OVERDUE", "CANCELLED", "PARTIAL"]),
  notes: z.string().trim().max(500).optional(),
});

export async function savePayment(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("finance.manage");
    const parsed = paymentSchema.safeParse(fields(formData));
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? initialError.message };
    const data = parsed.data;
    if (data.studentId) {
      const student = await db.user.findFirst({ where: { id: data.studentId, institutionId: user.institutionId, role: "STUDENT" }, select: { id: true } });
      if (!student) return { ok: false, message: "Estudiante inválido." };
    }
    if (data.periodId) {
      const period = await db.academicPeriod.findFirst({ where: { id: data.periodId, institutionId: user.institutionId }, select: { id: true } });
      if (!period) return { ok: false, message: "Período inválido." };
    }
    const values = {
      studentId: data.studentId || null,
      periodId: data.periodId || null,
      concept: data.concept,
      amount: data.amount,
      currency: data.currency,
      dueDate: data.dueDate ? new Date(`${data.dueDate}T12:00:00Z`) : null,
      paidAt: data.status === "PAID" ? new Date() : null,
      status: data.status,
      notes: data.notes || null,
    };
    if (data.paymentId) {
      const payment = await db.paymentConcept.findFirst({ where: { id: data.paymentId, institutionId: user.institutionId }, select: { id: true } });
      if (!payment) return { ok: false, message: "Registro de pago no encontrado." };
      await db.paymentConcept.update({ where: { id: payment.id }, data: values });
    } else {
      await db.paymentConcept.create({ data: { institutionId: user.institutionId, ...values } });
    }
    revalidatePath("/dashboard/pagos");
    revalidatePath("/dashboard/portal");
    return { ok: true, message: data.paymentId ? "Pago actualizado correctamente." : "Pago registrado correctamente." };
  } catch {
    return initialError;
  }
}

const institutionSchema = z.object({
  name: z.string().trim().min(3, "El nombre debe tener al menos 3 caracteres").max(160),
  type: z.enum(["SCHOOL", "UNIVERSITY", "INSTITUTE", "ACADEMY", "OTHER"]),
  domain: z.union([z.literal(""), z.string().trim().toLowerCase().max(160).regex(/^[a-z0-9.-]+$/, "Dominio inválido")]),
  timezone: z.string().trim().min(3).max(80),
  language: z.enum(["es", "en"]),
});

export async function updateInstitution(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("tenant.settings.manage");
    const parsed = institutionSchema.safeParse(fields(formData));
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? initialError.message };
    const institution = await db.institution.findFirst({ where: { id: user.institutionId }, select: { id: true } });
    if (!institution) return { ok: false, message: "Institución no encontrada." };
    await db.institution.update({ where: { id: institution.id }, data: { ...parsed.data, domain: parsed.data.domain || null } });
    revalidatePath("/dashboard/configuracion");
    return { ok: true, message: "Configuración actualizada correctamente." };
  } catch {
    return initialError;
  }
}
