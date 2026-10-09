import { validateUploadRequest, type UploadPurpose } from "@/lib/uploads";

/**
 * Sube un archivo desde el navegador con el mecanismo de Edukana: reserva (`POST /api/uploads`),
 * subida directa firmada al almacenamiento y confirmación (`PATCH /api/uploads/[id]`), que
 * comprueba el contenido. Si algo falla, descarta la reserva. Devuelve el id del archivo.
 */
export async function uploadFile(file: File, target: { purpose: UploadPurpose; assignmentId?: string; courseId?: string }): Promise<string> {
  const invalid = validateUploadRequest(target.purpose, { name: file.name, type: file.type, size: file.size });
  if (invalid) throw new Error(invalid);
  let assetId = "";
  try {
    const prepared = await fetch("/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ purpose: target.purpose, name: file.name, type: file.type, size: file.size, assignmentId: target.assignmentId ?? null, courseId: target.courseId ?? null }),
    });
    const intent = (await prepared.json().catch(() => ({}))) as { error?: string; assetId?: string; uploadUrl?: string };
    if (!prepared.ok || !intent.assetId || !intent.uploadUrl) throw new Error(intent.error ?? "No pudimos preparar la subida. Intenta de nuevo.");
    assetId = intent.assetId;
    const uploaded = await fetch(intent.uploadUrl, { method: "PUT", headers: { "content-type": file.type, "x-upsert": "false" }, body: file });
    if (!uploaded.ok) throw new Error("El archivo no se pudo subir. Revisa tu conexión e intenta de nuevo.");
    const confirmed = await fetch(`/api/uploads/${assetId}`, { method: "PATCH" });
    if (!confirmed.ok) {
      const body = (await confirmed.json().catch(() => ({}))) as { error?: string };
      if (confirmed.status === 409) assetId = ""; // El servidor ya lo borró.
      throw new Error(body.error ?? "No pudimos comprobar el archivo. Intenta de nuevo.");
    }
    return assetId;
  } catch (error) {
    if (assetId) await fetch(`/api/uploads/${assetId}`, { method: "DELETE" }).catch(() => undefined);
    throw error instanceof Error ? error : new Error("No se pudo subir el archivo. Intenta de nuevo.");
  }
}

/** Tamaño en palabras: «850 KB», «2,4 MB». */
export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("es", { maximumFractionDigits: 1 })} MB`;
}
