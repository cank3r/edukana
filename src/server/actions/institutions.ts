"use server";

import { getRequestInstitution } from "@/server/platform/domains";
import { institutionMatchesHost } from "@/server/platform/domain-policy";
import { redirect } from "next/navigation";
import { auth, updateSession } from "@/lib/auth";
import { findOwnMembership, listActiveMemberships } from "@/server/identity";

export type InstitutionChoice = { userId: string; institutionName: string; role: string; current: boolean };

/** Instituciones entre las que la persona puede elegir. Para la pantalla `/elegir-institucion`. */
export async function listMyInstitutions(): Promise<InstitutionChoice[]> {
  const user = (await auth())?.user;
  if (!user?.identityId) return [];
  const memberships = await listActiveMemberships(user.identityId);
  const hostInstitution = await getRequestInstitution();
  return memberships.filter((item) => institutionMatchesHost(item.institutionId, hostInstitution)).map((item) => ({
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
  if (!user?.identityId) redirect("/dashboard");
  const membership = await findOwnMembership(user.identityId, target);
  const hostInstitution = await getRequestInstitution();
  if (!membership || !institutionMatchesHost(membership.institutionId, hostInstitution)) redirect("/dashboard");
  await updateSession({ activeUserId: target } as Parameters<typeof updateSession>[0]);
  redirect("/dashboard");
}
