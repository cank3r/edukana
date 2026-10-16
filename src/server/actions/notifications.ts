"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { markRead, openNotification } from "@/server/notifications";
import { saveEmailPreferences } from "@/server/notifications/preferences";

export type PreferencesActionState = { ok: boolean; message: string };

async function viewer() {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return null;
  return { id: user.id, institutionId: user.institutionId };
}

/** Abre una notificación propia: la marca leída y lleva a su página. Campo: `id`. */
export async function openNotificationAction(formData: FormData) {
  const me = await viewer();
  if (!me) redirect("/login");
  let href: string | null = null;
  try {
    href = await openNotification(me, String(formData.get("id") ?? ""));
  } catch (error) {
    console.error("openNotificationAction failed", { correlationId: crypto.randomUUID(), error });
  }
  // El número de la campana vive en el diseño de todo el panel.
  revalidatePath("/dashboard", "layout");
  redirect(href ?? "/dashboard/notificaciones");
}

/** «Marcar todas como leídas». Solo toca las de quien está en sesión. */
export async function markAllNotificationsReadAction() {
  const me = await viewer();
  if (!me) redirect("/login");
  try {
    await markRead(me, "all");
  } catch (error) {
    console.error("markAllNotificationsReadAction failed", { correlationId: crypto.randomUUID(), error });
  }
  revalidatePath("/dashboard", "layout");
}

/**
 * «Guardar mis preferencias»: las casillas marcadas llegan como `email` (una por tipo).
 * Solo cambia las de quien está en sesión: no acepta el id de otra persona.
 */
export async function saveEmailPreferencesAction(_state: PreferencesActionState, formData: FormData): Promise<PreferencesActionState> {
  const me = await viewer();
  if (!me) return { ok: false, message: "Tu sesión terminó. Vuelve a iniciar sesión." };
  try {
    const kinds = formData.getAll("email").filter((value): value is string => typeof value === "string").slice(0, 20);
    const result = await saveEmailPreferences(me, kinds);
    if (!result.ok) return result;
    revalidatePath("/dashboard/notificaciones/preferencias");
    return {
      ok: true,
      message: result.enabled === 0
        ? "Listo. No te enviaremos correos; seguirás viendo todo en Notificaciones."
        : `Listo. Te avisaremos por correo de ${result.enabled === 1 ? "1 tipo de notificación" : `${result.enabled} tipos de notificación`}.`,
    };
  } catch (error) {
    const correlationId = crypto.randomUUID();
    console.error("saveEmailPreferencesAction failed", { correlationId, error });
    return { ok: false, message: `No se pudieron guardar tus preferencias. Intenta de nuevo. Código: ${correlationId}` };
  }
}
