"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { PermissionPolicyError, persistRolePermissions, type RolePermissionStore } from "@/lib/role-permissions";

export type RolePermissionsActionState = { ok: boolean; message: string; savedRole?: string };

const inputSchema = z.object({
  role: z.enum(["SUPER_ADMIN", "ADMIN", "COORDINATOR", "TEACHER", "STUDENT", "PARENT"]),
  changes: z.array(z.object({ capability: z.string().max(80), enabled: z.boolean() })).max(100),
});

export async function saveRolePermissions(_state: RolePermissionsActionState, formData: FormData): Promise<RolePermissionsActionState> {
  try {
    const session = await auth();
    const sessionUser = session?.user;
    if (!sessionUser?.id || !sessionUser.institutionId) return { ok: false, message: "No autorizado." };

    const actor = await db.user.findFirst({
      where: { id: sessionUser.id, institutionId: sessionUser.institutionId, status: "ACTIVE" },
      select: { id: true, institutionId: true, role: true },
    });
    if (!actor) return { ok: false, message: "La sesión ya no es válida." };

    const parsed = inputSchema.safeParse({
      role: formData.get("role"),
      changes: JSON.parse(String(formData.get("changes") ?? "null")),
    });
    if (!parsed.success) return { ok: false, message: "La configuración enviada no es válida." };

    const actorCapabilities = await getEffectiveCapabilities(actor.institutionId, actor.role);
    const store: RolePermissionStore = {
      async load(institutionId, role) {
        return db.roleCapabilityOverride.findMany({
          where: { institutionId, role },
          select: { capability: true, enabled: true },
        });
      },
      async commit(change) {
        await db.$transaction(async (tx) => {
          for (const write of change.writes) {
            await tx.roleCapabilityOverride.upsert({
              where: { institutionId_role_capability: { institutionId: write.institutionId, role: write.role, capability: write.capability } },
              create: write,
              update: { enabled: write.enabled, updatedById: write.updatedById },
            });
          }
          await tx.auditLog.create({
            data: {
              institutionId: change.institutionId,
              userId: change.updatedById,
              action: "ROLE_PERMISSIONS_UPDATED",
              entity: "Role",
              entityId: change.role,
              changes: { before: change.before, after: change.after },
            },
          });
        });
      },
    };

    await persistRolePermissions(store, {
      actor: { ...actor, capabilities: actorCapabilities },
      targetRole: parsed.data.role,
      changes: parsed.data.changes,
    });
    revalidatePath("/dashboard", "layout");
    revalidatePath("/dashboard/configuracion/roles");
    return { ok: true, message: "Permisos guardados para esta institución.", savedRole: parsed.data.role };
  } catch (error) {
    if (error instanceof PermissionPolicyError) return { ok: false, message: error.message };
    return { ok: false, message: "No se pudieron guardar los permisos." };
  }
}
