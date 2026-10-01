"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type ActionState = { ok: boolean; message: string };
const initialError: ActionState = { ok: false, message: "No se pudo completar la operación." };

type SessionUser = { id: string; institutionId: string; role: string };

async function requireUser(roles?: string[]): Promise<SessionUser> {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!user?.id || !user.institutionId) throw new Error("No autorizado");
  if (roles && !roles.includes(user.role)) throw new Error("Permisos insuficientes");
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
    const user = await requireUser(["ADMIN", "COORDINATOR", "TEACHER", "SUPER_ADMIN"]);
    const parsed = moduleSchema.safeParse(fields(formData));
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? initialError.message };
    const course = await db.course.findFirst({
      where: {
        id: parsed.data.courseId,
        institutionId: user.institutionId,
        ...(user.role === "TEACHER" ? { teacherId: user.id } : {}),
      },
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
  content: z.string().trim().min(10, "El comunicado debe tener al menos 10 caracteres").max(10000),
  audience: z.enum(["ALL", "ROLE"]),
  audienceId: z.string().trim().optional(),
  isPinned: z.preprocess((value) => value === "on", z.boolean()),
}).refine((data) => data.audience !== "ROLE" || ["STUDENT", "TEACHER", "PARENT"].includes(data.audienceId ?? ""), {
  message: "Selecciona un rol válido.",
});

export async function createAnnouncement(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser(["ADMIN", "COORDINATOR", "SUPER_ADMIN"]);
    const parsed = announcementSchema.safeParse(fields(formData));
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? initialError.message };
    await db.announcement.create({
      data: {
        institutionId: user.institutionId,
        authorId: user.id,
        title: parsed.data.title,
        content: parsed.data.content,
        audience: parsed.data.audience,
        audienceId: parsed.data.audience === "ROLE" ? parsed.data.audienceId : null,
        isPinned: parsed.data.isPinned,
      },
    });
    revalidatePath("/dashboard/comunidad");
    return { ok: true, message: "Anuncio publicado correctamente." };
  } catch {
    return initialError;
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
    const user = await requireUser(["ADMIN", "COORDINATOR", "SUPER_ADMIN"]);
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
    const user = await requireUser(["ADMIN", "SUPER_ADMIN"]);
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
    const user = await requireUser(["ADMIN", "SUPER_ADMIN"]);
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
