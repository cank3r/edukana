"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { markRead, openNotification } from "@/server/notifications";

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
