"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import {
  GuardianFlagPolicyError,
  applyGuardianFlagChanges,
  assertGuardianFlagsWithinAuthority,
  canTransitionGuardianship,
  type GuardianFlagValues,
} from "@/lib/guardianship-policy";

export type GuardianshipActionState = { ok: boolean; message: string };
const failed = (message: string): GuardianshipActionState => ({ ok: false, message });
const success = (message: string): GuardianshipActionState => ({ ok: true, message });
const conflict = () => new GuardianshipActionError("El vínculo cambió mientras lo editabas. Recarga la página e inténtalo de nuevo.");
class GuardianshipActionError extends Error {}

const flagsSchema = z.object({
  canViewAcademics: z.boolean(),
  canViewAttendance: z.boolean(),
  canViewSchedule: z.boolean(),
  canViewAnnouncements: z.boolean(),
  canViewFinance: z.boolean(),
});
const createSchema = flagsSchema.extend({
  parentId: z.string().min(1).max(100),
  studentId: z.string().min(1).max(100),
  relationship: z.enum(["MOTHER", "FATHER", "LEGAL_GUARDIAN", "OTHER"]),
});
const updateSchema = z.object({
  id: z.string().min(1).max(100),
  changes: z.array(z.object({ flag: z.string().max(80), enabled: z.boolean() })).max(20),
});
const idSchema = z.object({ id: z.string().min(1).max(100) });
const bool = (fd: FormData, key: string) => fd.get(key) === "on";
const flags = (fd: FormData): GuardianFlagValues => ({
  canViewAcademics: bool(fd, "canViewAcademics"),
  canViewAttendance: bool(fd, "canViewAttendance"),
  canViewSchedule: bool(fd, "canViewSchedule"),
  canViewAnnouncements: bool(fd, "canViewAnnouncements"),
  canViewFinance: bool(fd, "canViewFinance"),
});
const snapshotFlags = (value: GuardianshipSnapshot): GuardianFlagValues => ({
  canViewAcademics: value.canViewAcademics,
  canViewAttendance: value.canViewAttendance,
  canViewSchedule: value.canViewSchedule,
  canViewAnnouncements: value.canViewAnnouncements,
  canViewFinance: value.canViewFinance,
});
const selectSnapshot = {
  id: true, institutionId: true, parentId: true, studentId: true, relationship: true, status: true,
  canViewAcademics: true, canViewAttendance: true, canViewSchedule: true, canViewAnnouncements: true, canViewFinance: true,
  createdById: true, updatedById: true, createdAt: true, updatedAt: true, version: true, revokedAt: true,
} as const;
type GuardianshipSnapshot = Prisma.GuardianshipGetPayload<{ select: typeof selectSnapshot }>;
const snapshot = (value: GuardianshipSnapshot | null) => value ? {
  ...value,
  createdAt: value.createdAt.toISOString(),
  updatedAt: value.updatedAt.toISOString(),
  revokedAt: value.revokedAt?.toISOString() ?? null,
} : null;

async function requireManager() {
  const session = await auth();
  const current = session?.user;
  if (!current?.id || !current.institutionId) throw new GuardianshipActionError("No autorizado.");
  const actor = await db.user.findFirst({ where: { id: current.id, institutionId: current.institutionId, status: "ACTIVE" }, select: { id: true, institutionId: true, role: true } });
  if (!actor) throw new GuardianshipActionError("La sesión ya no es válida.");
  const capabilities = await getEffectiveCapabilities(actor.institutionId, actor.role);
  if (!capabilities.has("guardianship.manage")) throw new GuardianshipActionError("Permisos insuficientes.");
  return { ...actor, capabilities };
}

function refresh() {
  revalidatePath("/dashboard/configuracion/tutores");
  revalidatePath("/dashboard/hijos");
  revalidatePath("/dashboard/comunidad");
}

function messageFor(error: unknown, fallback: string) {
  return error instanceof GuardianshipActionError || error instanceof GuardianFlagPolicyError ? error.message : fallback;
}

export async function createGuardianship(_state: GuardianshipActionState, fd: FormData): Promise<GuardianshipActionState> {
  try {
    const actor = await requireManager();
    const requestedFlags = flags(fd);
    assertGuardianFlagsWithinAuthority(requestedFlags, actor.capabilities);
    const parsed = createSchema.safeParse({ parentId: fd.get("parentId"), studentId: fd.get("studentId"), relationship: fd.get("relationship"), ...requestedFlags });
    if (!parsed.success) return failed("Selecciona un tutor, estudiante y relación válidos.");
    if (parsed.data.parentId === parsed.data.studentId) return failed("Tutor y estudiante deben ser usuarios distintos.");

    await db.$transaction(async (tx) => {
      const [parent, student, existing] = await Promise.all([
        tx.user.findFirst({ where: { id: parsed.data.parentId, institutionId: actor.institutionId, role: "PARENT", status: "ACTIVE" }, select: { id: true } }),
        tx.user.findFirst({ where: { id: parsed.data.studentId, institutionId: actor.institutionId, role: "STUDENT", status: "ACTIVE" }, select: { id: true } }),
        tx.guardianship.findUnique({ where: { institutionId_parentId_studentId: { institutionId: actor.institutionId, parentId: parsed.data.parentId, studentId: parsed.data.studentId } }, select: { id: true, status: true } }),
      ]);
      if (!parent || !student) throw new GuardianshipActionError("Los usuarios no existen, no están activos o pertenecen a otra institución.");
      if (existing?.status === "REVOKED") throw new GuardianshipActionError("La revocación es terminal en este MVP; este vínculo no puede recrearse ni reactivarse automáticamente.");
      if (existing) throw new GuardianshipActionError("Este vínculo ya existe; actualízalo o actívalo.");
      const created = await tx.guardianship.create({ data: { institutionId: actor.institutionId, ...parsed.data, status: "PENDING", createdById: actor.id, updatedById: actor.id }, select: selectSnapshot });
      await tx.auditLog.create({ data: { institutionId: actor.institutionId, userId: actor.id, action: "GUARDIANSHIP_CREATED_PENDING", entity: "Guardianship", entityId: created.id, changes: { before: null, after: snapshot(created) } } });
    });
    refresh();
    return success("Vínculo creado como pendiente. Debe activarse explícitamente.");
  } catch (error) {
    return failed(messageFor(error, "No se pudo crear el vínculo."));
  }
}

export async function updateGuardianship(_state: GuardianshipActionState, fd: FormData): Promise<GuardianshipActionState> {
  try {
    const actor = await requireManager();
    const parsed = updateSchema.safeParse({ id: fd.get("id"), changes: JSON.parse(String(fd.get("changes") ?? "null")) });
    if (!parsed.success) return failed("Configuración inválida.");
    if (!parsed.data.changes.length) return success("No había cambios para guardar.");
    await db.$transaction(async (tx) => {
      const before = await tx.guardianship.findFirst({ where: { id: parsed.data.id, institutionId: actor.institutionId }, select: selectSnapshot });
      if (!before || !canTransitionGuardianship(before.status, "update")) throw new GuardianshipActionError("Vínculo no encontrado o revocado.");
      const nextFlags = applyGuardianFlagChanges(snapshotFlags(before), parsed.data.changes, actor.capabilities);
      const [parent, student] = await Promise.all([
        tx.user.findFirst({ where: { id: before.parentId, institutionId: actor.institutionId, role: "PARENT", status: "ACTIVE" }, select: { id: true } }),
        tx.user.findFirst({ where: { id: before.studentId, institutionId: actor.institutionId, role: "STUDENT", status: "ACTIVE" }, select: { id: true } }),
      ]);
      if (!parent || !student) throw new GuardianshipActionError("El tutor o estudiante ya no es válido para esta institución.");
      const changed = await tx.guardianship.updateMany({
        where: { id: before.id, institutionId: actor.institutionId, status: before.status, updatedAt: before.updatedAt, version: before.version },
        data: { ...nextFlags, updatedById: actor.id, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw conflict();
      const after = await tx.guardianship.findFirst({ where: { id: before.id, institutionId: actor.institutionId }, select: selectSnapshot });
      if (!after) throw conflict();
      await tx.auditLog.create({ data: { institutionId: actor.institutionId, userId: actor.id, action: "GUARDIANSHIP_PERMISSIONS_UPDATED", entity: "Guardianship", entityId: after.id, changes: { before: snapshot(before), after: snapshot(after) } } });
    });
    refresh();
    return success("Permisos del vínculo actualizados.");
  } catch (error) {
    return failed(messageFor(error, "No se pudo actualizar el vínculo."));
  }
}

export async function activateGuardianship(_state: GuardianshipActionState, fd: FormData): Promise<GuardianshipActionState> {
  try {
    const actor = await requireManager();
    const parsed = idSchema.safeParse({ id: fd.get("id") });
    if (!parsed.success) return failed("Vínculo inválido.");
    await db.$transaction(async (tx) => {
      const before = await tx.guardianship.findFirst({ where: { id: parsed.data.id, institutionId: actor.institutionId }, select: selectSnapshot });
      if (!before || !canTransitionGuardianship(before.status, "activate")) throw new GuardianshipActionError("Solo puede activarse un vínculo pendiente.");
      assertGuardianFlagsWithinAuthority(snapshotFlags(before), actor.capabilities);
      const [parent, student] = await Promise.all([
        tx.user.findFirst({ where: { id: before.parentId, institutionId: actor.institutionId, role: "PARENT", status: "ACTIVE" }, select: { id: true } }),
        tx.user.findFirst({ where: { id: before.studentId, institutionId: actor.institutionId, role: "STUDENT", status: "ACTIVE" }, select: { id: true } }),
      ]);
      if (!parent || !student) throw new GuardianshipActionError("El tutor o estudiante ya no es válido para esta institución.");
      const changed = await tx.guardianship.updateMany({
        where: { id: before.id, institutionId: actor.institutionId, status: "PENDING", updatedAt: before.updatedAt, version: before.version },
        data: { status: "ACTIVE", revokedAt: null, updatedById: actor.id, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw conflict();
      const after = await tx.guardianship.findFirst({ where: { id: before.id, institutionId: actor.institutionId }, select: selectSnapshot });
      if (!after) throw conflict();
      await tx.auditLog.create({ data: { institutionId: actor.institutionId, userId: actor.id, action: "GUARDIANSHIP_ACTIVATED", entity: "Guardianship", entityId: after.id, changes: { before: snapshot(before), after: snapshot(after) } } });
    });
    refresh();
    return success("Vínculo activado explícitamente.");
  } catch (error) {
    return failed(messageFor(error, "No se pudo activar el vínculo."));
  }
}

export async function revokeGuardianship(_state: GuardianshipActionState, fd: FormData): Promise<GuardianshipActionState> {
  try {
    const actor = await requireManager();
    const parsed = idSchema.safeParse({ id: fd.get("id") });
    if (!parsed.success) return failed("Vínculo inválido.");
    await db.$transaction(async (tx) => {
      const before = await tx.guardianship.findFirst({ where: { id: parsed.data.id, institutionId: actor.institutionId }, select: selectSnapshot });
      if (!before || !canTransitionGuardianship(before.status, "revoke")) throw new GuardianshipActionError("Vínculo no encontrado o ya revocado.");
      const changed = await tx.guardianship.updateMany({
        where: { id: before.id, institutionId: actor.institutionId, status: before.status, updatedAt: before.updatedAt, version: before.version },
        data: { status: "REVOKED", revokedAt: new Date(), updatedById: actor.id, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw conflict();
      const after = await tx.guardianship.findFirst({ where: { id: before.id, institutionId: actor.institutionId }, select: selectSnapshot });
      if (!after) throw conflict();
      await tx.auditLog.create({ data: { institutionId: actor.institutionId, userId: actor.id, action: "GUARDIANSHIP_REVOKED", entity: "Guardianship", entityId: after.id, changes: { before: snapshot(before), after: snapshot(after) } } });
    });
    refresh();
    return success("Vínculo revocado.");
  } catch (error) {
    return failed(messageFor(error, "No se pudo revocar el vínculo."));
  }
}
