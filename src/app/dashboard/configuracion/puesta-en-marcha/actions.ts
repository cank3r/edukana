"use server";

import bcrypt from "bcryptjs";
import { Prisma, type Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { type Capability } from "@/lib/capabilities";
import { db } from "@/lib/db";

export type OnboardingState = { ok: boolean; message: string };
const success = (message: string): OnboardingState => ({ ok: true, message });
const failure = (message: string): OnboardingState => ({ ok: false, message });

async function requireActor(capability: Capability) {
  const current = (await auth())?.user;
  if (!current?.id || !current.institutionId) throw new Error("No autorizado.");
  const actor = await db.user.findFirst({ where: { id: current.id, institutionId: current.institutionId, status: "ACTIVE" }, select: { id: true, institutionId: true, role: true } });
  if (!actor) throw new Error("La sesión ya no es válida.");
  if (!(await getEffectiveCapabilities(actor.institutionId, actor.role)).has(capability)) throw new Error("Permisos insuficientes.");
  return actor;
}

const PILOT_USER_ROLES = ["TEACHER", "STUDENT", "PARENT"] as const satisfies readonly Role[];

const userSchema = z.object({
  name: z.string().trim().min(3, "Escribe el nombre completo.").max(120),
  email: z.string().trim().toLowerCase().email("Escribe un correo válido.").max(200),
  role: z.enum(PILOT_USER_ROLES),
  password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres.").max(200).regex(/[A-Za-zÁÉÍÓÚáéíóúÑñ]/, "Incluye al menos una letra.").regex(/\d/, "Incluye al menos un número."),
});

export async function createPilotUser(_state: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const parsed = userSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Revisa los datos.");
  try {
    const actor = await requireActor("people.manage");
    const password = await bcrypt.hash(parsed.data.password, 12);
    await db.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { institutionId: actor.institutionId, ...parsed.data, password, status: "ACTIVE" }, select: { id: true, role: true } });
      await tx.auditLog.create({ data: { institutionId: actor.institutionId, userId: actor.id, action: "USER_CREATED", entity: "User", entityId: created.id, changes: { role: created.role } } });
    });
    revalidatePath("/dashboard/configuracion/puesta-en-marcha");
    revalidatePath("/dashboard/gestion");
    return success("Usuario creado. Ya puede iniciar sesión con estas credenciales.");
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return failure("Ya existe una persona con ese correo en esta institución.");
    return failure(error instanceof Error && /autorizado|sesión|Permisos/.test(error.message) ? error.message : "No se pudo crear el usuario.");
  }
}

const periodSchema = z.object({
  name: z.string().trim().min(3, "Escribe un nombre para el período.").max(100),
  startDate: z.string().date(),
  endDate: z.string().date(),
}).refine((value) => value.startDate <= value.endDate, { message: "La fecha final debe ser posterior a la inicial." });

export async function createAcademicPeriod(_state: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const parsed = periodSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Revisa las fechas.");
  try {
    const actor = await requireActor("academic.structure.manage");
    await db.$transaction(async (tx) => {
      await tx.academicPeriod.updateMany({ where: { institutionId: actor.institutionId, isActive: true }, data: { isActive: false } });
      const period = await tx.academicPeriod.create({ data: { institutionId: actor.institutionId, name: parsed.data.name, startDate: new Date(`${parsed.data.startDate}T00:00:00.000Z`), endDate: new Date(`${parsed.data.endDate}T23:59:59.999Z`), isActive: true }, select: { id: true } });
      await tx.auditLog.create({ data: { institutionId: actor.institutionId, userId: actor.id, action: "ACADEMIC_PERIOD_CREATED", entity: "AcademicPeriod", entityId: period.id, changes: { name: parsed.data.name, active: true } } });
    });
    revalidatePath("/dashboard/configuracion/puesta-en-marcha");
    revalidatePath("/dashboard/aula");
    return success("Período académico creado y activado.");
  } catch (error) {
    return failure(error instanceof Error && /autorizado|sesión|Permisos/.test(error.message) ? error.message : "No se pudo crear el período académico.");
  }
}
