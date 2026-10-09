import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { confirmUpload, discardUpload, type UploadActor } from "@/server/courses/uploads";

export const runtime = "nodejs";

async function actor(): Promise<UploadActor | null> {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return null;
  return { id: user.id, institutionId: user.institutionId, role: user.role, capabilities: await getEffectiveCapabilities(user.institutionId, user.role) };
}

const sessionEnded = () => Response.json({ error: "Tu sesión terminó. Vuelve a iniciar sesión." }, { status: 401 });

/** Confirma la subida: tamaño, tipo y firma de bytes. Si no coincide, el archivo se borra. */
export async function PATCH(_request: Request, context: { params: Promise<{ assetId: string }> }) {
  const user = await actor();
  if (!user) return sessionEnded();
  const result = await confirmUpload(user, (await context.params).assetId);
  if (!result.ok) return Response.json({ error: result.message }, { status: result.status });
  return Response.json({ ok: true, assetId: result.assetId });
}

/** Quita una subida propia que todavía no se usa (por ejemplo un archivo listo y no entregado). */
export async function DELETE(_request: Request, context: { params: Promise<{ assetId: string }> }) {
  const user = await actor();
  if (!user) return sessionEnded();
  const result = await discardUpload(user, (await context.params).assetId);
  if (!result.ok) return Response.json({ error: result.message }, { status: result.status });
  return new Response(null, { status: 204 });
}
