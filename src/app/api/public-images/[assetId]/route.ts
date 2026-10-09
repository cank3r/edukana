import { readPrivateAsset } from "@/lib/storage";
import { publicImageAsset } from "@/server/courses/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Imagen de curso o logo de institución, sin sesión (la usará el catálogo público).
 * Solo responde con imágenes confirmadas de la carpeta pública que hoy están en uso; todo lo
 * demás responde 404, igual que un archivo inexistente. Un archivo reemplazado o quitado deja de
 * servirse en la siguiente petición; las copias en caché duran como máximo una hora.
 * Decisión documentada en `docs/security/signed-urls.md`.
 */
export async function GET(_request: Request, context: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await context.params;
  try {
    const asset = await publicImageAsset(assetId);
    if (!asset) return new Response("No encontrado", { status: 404, headers: { "cache-control": "public, max-age=60", "content-type": "text/plain; charset=utf-8" } });
    const bytes = await readPrivateAsset(asset.bucket, asset.objectPath);
    const body = new Uint8Array(bytes.length);
    body.set(bytes);
    return new Response(body, {
      status: 200,
      headers: {
        "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
        "content-length": String(bytes.length),
        "content-type": asset.mimeType,
        "content-disposition": "inline",
        "content-security-policy": "default-src 'none'; sandbox",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("public image failed", { assetId, error });
    return new Response("No disponible", { status: 503, headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" } });
  }
}
