import "server-only";
import { randomUUID } from "node:crypto";
import { safeObjectName } from "@/lib/lms";

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "edukana";
  if (!url || !key) throw new Error("Supabase Storage no está configurado.");
  return { url: url.replace(/\/$/, ""), key, bucket };
}

function headers(key: string, contentType?: string) {
  return { Authorization: `Bearer ${key}`, apikey: key, ...(contentType ? { "Content-Type": contentType } : {}) };
}

export async function uploadPrivateAsset(input: { institutionId: string; courseId?: string | null; file: File }) {
  const { url, key, bucket } = config();
  const objectPath = `${input.institutionId}/${input.courseId ?? "institucion"}/${randomUUID()}-${safeObjectName(input.file.name)}`;
  const response = await fetch(`${url}/storage/v1/object/${bucket}/${objectPath}`, {
    method: "POST",
    headers: { ...headers(key, input.file.type), "x-upsert": "false" },
    body: await input.file.arrayBuffer(),
  });
  if (!response.ok) throw new Error(`Storage rechazó la carga (${response.status}).`);
  return { bucket, objectPath };
}

export async function createPrivateAssetUrl(bucket: string, objectPath: string, expiresIn = 300) {
  const { url, key } = config();
  const response = await fetch(`${url}/storage/v1/object/sign/${bucket}/${objectPath}`, {
    method: "POST",
    headers: headers(key, "application/json"),
    body: JSON.stringify({ expiresIn }),
  });
  if (!response.ok) throw new Error(`No se pudo autorizar la descarga (${response.status}).`);
  const payload = (await response.json()) as { signedURL?: string; signedUrl?: string };
  const signed = payload.signedURL ?? payload.signedUrl;
  if (!signed) throw new Error("Storage no devolvió una URL firmada.");
  return signed.startsWith("http") ? signed : `${url}/storage/v1${signed}`;
}
