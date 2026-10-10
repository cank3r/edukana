"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { updateOperatorBrand } from "@/server/platform/operator-branding";
import { prepareUpload, confirmUpload, type UploadActor } from "@/server/courses/uploads";
import { db } from "@/lib/db";

export type BrandingState = { ok: boolean; message: string };
async function operatorContext(institutionId: string) {
  const operator = await getOperatorEmail();
  const user = (await auth())?.user;
  if (!operator || !user) throw new Error("No tienes permiso para cambiar esta marca.");
  if (!await db.institution.findUnique({ where: { id: institutionId }, select: { id: true } })) {
    throw new Error("No encontramos esta institución.");
  }
  const actor: UploadActor = { id: user.id, institutionId, role: user.role, capabilities: new Set(["tenant.settings.manage"]) };
  return { operator, actor };
}
export async function saveOperatorBrandAction(_: BrandingState, data: FormData): Promise<BrandingState> {
  try {
    const institutionId = String(data.get("institutionId") ?? "");
    const { operator, actor } = await operatorContext(institutionId);
    const result = await updateOperatorBrand(operator, actor.id, institutionId, {
      brandColor: String(data.get("brandColor") ?? ""), domain: String(data.get("domain") ?? ""),
      hideEdukanaBrand: data.get("hideEdukanaBrand") === "on", assetId: String(data.get("assetId") ?? ""),
      removeLogo: data.get("removeLogo") === "on", confirmation: String(data.get("confirmation") ?? ""),
    });
    if (result.ok) {
      revalidatePath(`/operador/${institutionId}`); revalidatePath("/login");
      revalidatePath("/dashboard", "layout"); revalidatePath("/catalogo", "layout");
    }
    return result;
  } catch { return { ok: false, message: "No pudimos guardar la marca. Revisa tu sesión e intenta de nuevo." }; }
}
export async function prepareOperatorLogoAction(institutionId: string, input: { name: string; type: string; size: number }) {
  try {
    const { actor } = await operatorContext(institutionId);
    return await prepareUpload(actor, { purpose: "logo", name: input.name, type: input.type, size: input.size });
  } catch { return { ok: false as const, message: "No pudimos preparar el logo. Revisa tu sesión." }; }
}
export async function confirmOperatorLogoAction(institutionId: string, assetId: string) {
  try {
    const { actor } = await operatorContext(institutionId);
    // Scope confirmation to logos; never confirm another kind of upload as the operator.
    const asset = await db.storageAsset.findFirst({ where: { id: assetId, institutionId, uploaderId: actor.id,
      objectPath: { startsWith: `${institutionId}/public/logo/${institutionId}/` } }, select: { id: true } });
    if (!asset) return { ok: false as const, message: "No encontramos ese logo." };
    return await confirmUpload(actor, asset.id);
  } catch { return { ok: false as const, message: "No pudimos comprobar el logo. Intenta de nuevo." }; }
}
