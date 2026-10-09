import { db } from "@/lib/db";
import { emailKindsForRole, shouldSendEmail } from "./email-policy";

/**
 * Preferencias de correo de la persona en sesión. Cada quien ve y cambia SOLO las suyas:
 * no hay forma de indicar otra persona; el id sale siempre de la sesión.
 */

export type PreferencesViewer = { id: string; institutionId: string };
export type EmailPreferenceItem = { kind: string; label: string; email: boolean };
export type SavePreferencesResult = { ok: true; enabled: number } | { ok: false; message: string };

/** La persona activa de la institución, con su rol. Cualquier otro caso: null. */
async function activeSelf(viewer: PreferencesViewer) {
  if (!viewer.id || !viewer.institutionId) return null;
  return db.user.findFirst({ where: { id: viewer.id, institutionId: viewer.institutionId, status: "ACTIVE" }, select: { id: true, role: true } });
}

/** Las casillas que le tocan a su rol, con lo que eligió o el valor por omisión. */
export async function getEmailPreferences(viewer: PreferencesViewer): Promise<EmailPreferenceItem[]> {
  const self = await activeSelf(viewer);
  if (!self) return [];
  const options = emailKindsForRole(self.role);
  const saved = await db.notificationPreference.findMany({
    where: { userId: self.id, institutionId: viewer.institutionId },
    select: { kind: true, email: true },
  });
  const choice = new Map(saved.map((row) => [row.kind, row.email]));
  return options.map((option) => ({ kind: option.kind, label: option.label, email: shouldSendEmail({ kind: option.kind, preference: choice.get(option.kind) }) }));
}

/**
 * Guarda las casillas marcadas (`enabledKinds`); las demás de su rol quedan en «no».
 * Los tipos que no le corresponden se ignoran. Devuelve cuántos tipos quedaron activados.
 */
export async function saveEmailPreferences(viewer: PreferencesViewer, enabledKinds: readonly string[]): Promise<SavePreferencesResult> {
  const self = await activeSelf(viewer);
  if (!self) return { ok: false, message: "Tu sesión terminó. Vuelve a iniciar sesión." };
  const enabled = new Set(enabledKinds);
  const options = emailKindsForRole(self.role);
  await db.$transaction(
    options.map((option) =>
      db.notificationPreference.upsert({
        where: { userId_kind: { userId: self.id, kind: option.kind } },
        create: { institutionId: viewer.institutionId, userId: self.id, kind: option.kind, email: enabled.has(option.kind) },
        update: { email: enabled.has(option.kind) },
      }),
    ),
  );
  return { ok: true, enabled: options.filter((option) => enabled.has(option.kind)).length };
}
