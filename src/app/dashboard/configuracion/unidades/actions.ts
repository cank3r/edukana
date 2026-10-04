"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { assertOrganizationalUnitTenantBoundary, canManageOrganizationalUnits, organizationalUnitMembershipWhere, organizationalUnitWhere, OrganizationalUnitPolicyError } from "@/lib/organizational-units";

export type OrganizationalUnitActionState = { ok: boolean; message: string };
class OrganizationalUnitActionError extends Error {}
const unitName = z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(100, "El nombre no puede superar 100 caracteres.").regex(/^[\p{L}\p{N} .&()'/-]+$/u, "El nombre contiene caracteres no permitidos.");
const id = z.string().min(1).max(100);
const result = (ok: boolean, message: string): OrganizationalUnitActionState => ({ ok, message });

async function requireManager() {
  const session = await auth();
  const current = session?.user;
  if (!current?.id || !current.institutionId) throw new OrganizationalUnitActionError("No autorizado.");
  const actor = await db.user.findFirst({ where: { id: current.id, institutionId: current.institutionId, status: "ACTIVE" }, select: { id: true, institutionId: true, role: true } });
  if (!actor) throw new OrganizationalUnitActionError("La sesión ya no es válida.");
  const capabilities = await getEffectiveCapabilities(actor.institutionId, actor.role);
  if (!canManageOrganizationalUnits(capabilities)) throw new OrganizationalUnitActionError("Permisos insuficientes.");
  return actor;
}

function refresh() {
  revalidatePath("/dashboard/configuracion/unidades");
  revalidatePath("/dashboard/comunidad");
}

function failure(error: unknown, fallback: string) {
  return result(false, error instanceof OrganizationalUnitActionError || error instanceof OrganizationalUnitPolicyError ? error.message : fallback);
}

export async function createOrganizationalUnit(_state: OrganizationalUnitActionState, formData: FormData): Promise<OrganizationalUnitActionState> {
  try {
    const actor = await requireManager();
    const parsed = unitName.safeParse(formData.get("name"));
    if (!parsed.success) return result(false, parsed.error.issues[0]?.message ?? "Nombre inválido.");
    const existing = await db.organizationalUnit.findFirst({ where: { institutionId: actor.institutionId, name: { equals: parsed.data, mode: "insensitive" } }, select: { id: true } });
    if (existing) return result(false, "Ya existe una unidad con ese nombre.");
    await db.$transaction(async (tx) => {
      const unit = await tx.organizationalUnit.create({ data: { institutionId: actor.institutionId, name: parsed.data }, select: { id: true } });
      await tx.auditLog.create({ data: { institutionId: actor.institutionId, userId: actor.id, action: "ORGANIZATIONAL_UNIT_CREATED", entity: "OrganizationalUnit", entityId: unit.id, changes: { name: parsed.data } } });
    });
    refresh();
    return result(true, "Unidad creada.");
  } catch (error) {
    return failure(error, "No se pudo crear la unidad.");
  }
}

export async function renameOrganizationalUnit(_state: OrganizationalUnitActionState, formData: FormData): Promise<OrganizationalUnitActionState> {
  try {
    const actor = await requireManager();
    const parsed = z.object({ unitId: id, name: unitName }).safeParse({ unitId: formData.get("unitId"), name: formData.get("name") });
    if (!parsed.success) return result(false, parsed.error.issues[0]?.message ?? "Datos inválidos.");
    const unit = await db.organizationalUnit.findFirst({ where: organizationalUnitWhere(actor.institutionId, parsed.data.unitId), select: { id: true, institutionId: true, name: true } });
    if (!unit) throw new OrganizationalUnitActionError("Unidad no encontrada.");
    assertOrganizationalUnitTenantBoundary(actor.institutionId, [unit]);
    await db.$transaction(async (tx) => {
      await tx.organizationalUnit.update({ where: { id: unit.id }, data: { name: parsed.data.name } });
      await tx.auditLog.create({ data: { institutionId: actor.institutionId, userId: actor.id, action: "ORGANIZATIONAL_UNIT_RENAMED", entity: "OrganizationalUnit", entityId: unit.id, changes: { before: unit.name, after: parsed.data.name } } });
    });
    refresh();
    return result(true, "Unidad renombrada.");
  } catch (error) {
    return failure(error, "No se pudo renombrar la unidad.");
  }
}

export async function addOrganizationalUnitMember(_state: OrganizationalUnitActionState, formData: FormData): Promise<OrganizationalUnitActionState> {
  try {
    const actor = await requireManager();
    const parsed = z.object({ unitId: id, userId: id }).safeParse({ unitId: formData.get("unitId"), userId: formData.get("userId") });
    if (!parsed.success) return result(false, "Selecciona una unidad y una persona válidas.");
    const [unit, member, existingMembership] = await Promise.all([
      db.organizationalUnit.findFirst({ where: organizationalUnitWhere(actor.institutionId, parsed.data.unitId), select: { id: true, institutionId: true } }),
      db.user.findFirst({ where: { id: parsed.data.userId, institutionId: actor.institutionId, status: "ACTIVE" }, select: { id: true, institutionId: true } }),
      db.organizationalUnitMembership.findUnique({ where: { unitId_userId: { unitId: parsed.data.unitId, userId: parsed.data.userId } }, select: { institutionId: true } }),
    ]);
    if (!unit || !member) throw new OrganizationalUnitActionError("La unidad o la persona no existe en esta institución.");
    assertOrganizationalUnitTenantBoundary(actor.institutionId, [unit, member, ...(existingMembership ? [{ id: `${unit.id}:${member.id}`, institutionId: existingMembership.institutionId }] : [])]);
    if (existingMembership) return result(true, "La persona ya pertenece a esta unidad.");
    await db.$transaction(async (tx) => {
      await tx.organizationalUnitMembership.create({ data: { institutionId: actor.institutionId, unitId: unit.id, userId: member.id } });
      await tx.auditLog.create({ data: { institutionId: actor.institutionId, userId: actor.id, action: "ORGANIZATIONAL_UNIT_MEMBER_ADDED", entity: "OrganizationalUnit", entityId: unit.id, changes: { memberId: member.id } } });
    });
    refresh();
    return result(true, "Miembro asignado.");
  } catch (error) {
    return failure(error, "No se pudo asignar el miembro.");
  }
}

export async function removeOrganizationalUnitMember(_state: OrganizationalUnitActionState, formData: FormData): Promise<OrganizationalUnitActionState> {
  try {
    const actor = await requireManager();
    const parsed = z.object({ unitId: id, userId: id }).safeParse({ unitId: formData.get("unitId"), userId: formData.get("userId") });
    if (!parsed.success) return result(false, "Asignación inválida.");
    const membership = await db.organizationalUnitMembership.findFirst({ where: organizationalUnitMembershipWhere(actor.institutionId, parsed.data.unitId, parsed.data.userId), select: { institutionId: true, unitId: true, userId: true } });
    if (!membership) throw new OrganizationalUnitActionError("Asignación no encontrada.");
    assertOrganizationalUnitTenantBoundary(actor.institutionId, [{ id: membership.unitId, institutionId: membership.institutionId }]);
    await db.$transaction(async (tx) => {
      const removed = await tx.organizationalUnitMembership.deleteMany({ where: { institutionId: actor.institutionId, unitId: membership.unitId, userId: membership.userId } });
      if (removed.count !== 1) throw new OrganizationalUnitActionError("La asignación cambió; recarga la página.");
      await tx.auditLog.create({ data: { institutionId: actor.institutionId, userId: actor.id, action: "ORGANIZATIONAL_UNIT_MEMBER_REMOVED", entity: "OrganizationalUnit", entityId: membership.unitId, changes: { memberId: membership.userId } } });
    });
    refresh();
    return result(true, "Miembro retirado.");
  } catch (error) {
    return failure(error, "No se pudo retirar el miembro.");
  }
}
