import { auth } from "@/lib/auth";
import { createPrivateAssetUrl } from "@/lib/storage";
import { ownAvatarAsset } from "@/server/courses/images";
import { signedUrlSeconds } from "@/server/signed-urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "private, no-store" };

/**
 * La foto de perfil propia, para el menú: `{ url }` con una URL firmada de corta duración, o
 * `{ url: null }` si no hay foto (el menú muestra la inicial). Responde 200 en ambos casos para
 * no llenar la consola de errores en cada pantalla.
 */
export async function GET() {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return Response.json({ url: null }, { status: 401, headers: noStore });
  const asset = await ownAvatarAsset({ id: user.id, institutionId: user.institutionId });
  if (!asset) return Response.json({ url: null }, { headers: noStore });
  try {
    return Response.json({ url: await createPrivateAssetUrl(asset.bucket, asset.objectPath, signedUrlSeconds(asset.kind)) }, { headers: noStore });
  } catch {
    return Response.json({ url: null }, { headers: noStore });
  }
}
