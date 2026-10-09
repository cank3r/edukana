import { auth } from "@/lib/auth";
import { userHasCapability } from "@/lib/authorization";
import { db } from "@/lib/db";
import { validateAnnouncementUpload } from "@/lib/announcements";
import { createPrivateAnnouncementAssetUpload } from "@/lib/storage";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z.object({
  name: z.string().min(1).max(180),
  type: z.string().min(1).max(160),
  size: z.number().int().positive(),
});

export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.institutionId) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (!(await userHasCapability(user, "announcement.publish"))) return Response.json({ error: "Permisos insuficientes" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Solicitud de carga inválida" }, { status: 400 });
  const validationError = validateAnnouncementUpload(parsed.data);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });

  try {
    const upload = await createPrivateAnnouncementAssetUpload({ institutionId: user.institutionId, uploaderId: user.id, fileName: parsed.data.name });
    const kind = parsed.data.type.startsWith("image/") ? "IMAGE" : "VIDEO";
    const asset = await db.storageAsset.create({
      data: {
        institutionId: user.institutionId,
        uploaderId: user.id,
        bucket: upload.bucket,
        objectPath: upload.objectPath,
        originalName: parsed.data.name,
        mimeType: parsed.data.type,
        sizeBytes: parsed.data.size,
        kind,
        visibility: "PRIVATE",
      },
      select: { id: true },
    });
    return Response.json({ assetId: asset.id, uploadUrl: upload.signedUrl, retrievalUrl: `/api/assets/${asset.id}` }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo preparar la carga." }, { status: 503 });
  }
}
