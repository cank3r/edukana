"use server";

import { redirect } from "next/navigation";
import { auth, updateSession } from "@/lib/auth";
import { findOwnMembership, listActiveMemberships } from "@/server/identity";

export type InstitutionChoice = { userId: string; institutionName: string; role: string; current: boolean };

/** Instituciones entre las que la persona puede elegir. Para la pantalla `/elegir-institucion`. */
export async function listMyInstitutions(): Promise<InstitutionChoice[]> {
  const user = (await auth())?.user;
  if (!user?.identityId) return [];
  const memberships = await listActiveMemberships(user.identityId);
  return memberships.map((item) => ({
    userId: item.id,
    institutionName: item.institution.name,
    role: item.role,
    current: item.id === user.id,
  }));
}

/** Cambia de institución sin pedir la contraseña. Campo: `userId` (de `listMyInstitutions`). */
export async function switchInstitutionAction(formData: FormData) {
  const user = (await auth())?.user;
  const target = String(formData.get("userId") ?? "");
  if (!user?.identityId || !(await findOwnMembership(user.identityId, target))) redirect("/dashboard");
  await updateSession({ activeUserId: target } as Parameters<typeof updateSession>[0]);
  redirect("/dashboard");
}
