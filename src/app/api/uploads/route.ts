import { z } from "zod";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { prepareUpload } from "@/server/courses/uploads";

export const runtime = "nodejs";

const requestSchema = z.object({
  purpose: z.enum(["submission", "course-image", "avatar", "logo"]),
  name: z.string().min(1).max(255),
  type: z.string().min(1).max(160),
  size: z.number().int().positive(),
  assignmentId: z.string().min(1).max(64).nullable().optional(),
  courseId: z.string().min(1).max(64).nullable().optional(),
});

/** Paso 1 de la subida: autoriza y devuelve la URL firmada. Paso 3: `PATCH /api/uploads/[assetId]`. */
export async function POST(request: Request) {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return Response.json({ error: "Tu sesión terminó. Vuelve a iniciar sesión." }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "No pudimos leer el archivo elegido. Vuelve a elegirlo." }, { status: 400 });
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  const result = await prepareUpload({ id: user.id, institutionId: user.institutionId, role: user.role, capabilities }, parsed.data);
  if (!result.ok) return Response.json({ error: result.message }, { status: result.status });
  return Response.json({ assetId: result.assetId, uploadUrl: result.uploadUrl }, { status: 201 });
}
