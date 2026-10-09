"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { deleteAnnouncement, updateAnnouncement } from "@/server/announcements";

export type AnnouncementActionState = { ok: boolean; message: string };

async function context() {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return null;
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  return { actor: { id: user.id, institutionId: user.institutionId }, canManageAll: capabilities.has("announcement.manage") };
}

function refresh() {
  revalidatePath("/dashboard/comunidad");
  revalidatePath("/dashboard/hijos");
  revalidatePath("/dashboard");
}

function failure(name: string, error: unknown): AnnouncementActionState {
  const correlationId = crypto.randomUUID();
  console.error(`${name} failed`, { correlationId, error });
  return { ok: false, message: `No se pudo completar. Intenta de nuevo. Código: ${correlationId}` };
}

/** Corrige un aviso. Campos: `id`, `title`, `content`, `isPinned` ("on" si está marcado). */
export async function updateAnnouncementAction(_state: AnnouncementActionState, formData: FormData): Promise<AnnouncementActionState> {
  const ctx = await context();
  if (!ctx) return { ok: false, message: "Tu sesión terminó. Vuelve a iniciar sesión." };
  try {
    const result = await updateAnnouncement(
      ctx.actor,
      {
        id: String(formData.get("id") ?? ""),
        title: String(formData.get("title") ?? ""),
        content: String(formData.get("content") ?? ""),
        isPinned: formData.get("isPinned") === "on",
      },
      ctx.canManageAll,
    );
    if (!result.ok) return result;
    refresh();
    return { ok: true, message: "Aviso actualizado." };
  } catch (error) {
    return failure("updateAnnouncementAction", error);
  }
}

/** Borra un aviso. Campo: `id`. */
export async function deleteAnnouncementAction(_state: AnnouncementActionState, formData: FormData): Promise<AnnouncementActionState> {
  const ctx = await context();
  if (!ctx) return { ok: false, message: "Tu sesión terminó. Vuelve a iniciar sesión." };
  try {
    const result = await deleteAnnouncement(ctx.actor, String(formData.get("id") ?? ""), ctx.canManageAll);
    if (!result.ok) return result;
    refresh();
    return { ok: true, message: "Aviso borrado." };
  } catch (error) {
    return failure("deleteAnnouncementAction", error);
  }
}
