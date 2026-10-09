import { z } from "zod";
import { announcementContentSchema } from "@/lib/announcements";
import { db } from "@/lib/db";

type Actor = { id: string; institutionId: string };
export type AnnouncementResult = { ok: true } | { ok: false; message: string };

export const announcementEditSchema = z.object({
  title: z.string().trim().min(4, "El título debe tener al menos 4 caracteres.").max(140),
  content: announcementContentSchema,
  isPinned: z.boolean(),
});

const NOT_FOUND = "No encontramos ese aviso. Puede que alguien lo haya borrado.";

/**
 * Quién puede corregir o borrar un aviso: quien lo escribió, o quien gestiona todos los avisos.
 * Siempre dentro de su institución.
 */
async function findEditable(actor: Actor, id: string, canManageAll: boolean) {
  if (!id) return null;
  return db.announcement.findFirst({
    where: { id, institutionId: actor.institutionId, ...(canManageAll ? {} : { authorId: actor.id }) },
    select: { id: true, title: true },
  });
}

/**
 * Corrige el título, el mensaje o si está fijado. Los destinatarios no cambian: un aviso ya
 * leído por un grupo no se redirige a otro; para eso se borra y se publica uno nuevo.
 */
export async function updateAnnouncement(
  actor: Actor,
  input: { id: string; title: string; content: string; isPinned: boolean },
  canManageAll: boolean,
): Promise<AnnouncementResult> {
  const parsed = announcementEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const current = await findEditable(actor, input.id, canManageAll);
  if (!current) return { ok: false, message: NOT_FOUND };
  await db.$transaction([
    db.announcement.update({ where: { id: current.id }, data: parsed.data }),
    db.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        userId: actor.id,
        action: "announcement.update",
        entity: "Announcement",
        entityId: current.id,
        changes: { previousTitle: current.title, title: parsed.data.title, isPinned: parsed.data.isPinned },
      },
    }),
  ]);
  return { ok: true };
}

/** Borra el aviso para todos sus destinatarios, con sus imágenes y videos adjuntos. No se puede deshacer. */
export async function deleteAnnouncement(actor: Actor, id: string, canManageAll: boolean): Promise<AnnouncementResult> {
  const current = await findEditable(actor, id, canManageAll);
  if (!current) return { ok: false, message: NOT_FOUND };
  await db.$transaction([
    db.announcement.delete({ where: { id: current.id } }),
    db.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        userId: actor.id,
        action: "announcement.delete",
        entity: "Announcement",
        entityId: current.id,
        changes: { title: current.title },
      },
    }),
  ]);
  return { ok: true };
}
