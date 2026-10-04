import "server-only";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { safeObjectName } from "@/lib/lms";

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "edukana";
  if (!url || !key) throw new Error("Supabase Storage no está configurado.");
  return { url: url.replace(/\/$/, ""), key, bucket };
}

function storageAdmin() {
  const { url, key } = config();
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).storage;
}

export async function createPrivateAssetUpload(input: { institutionId: string; courseId: string; fileName: string }) {
  const { bucket } = config();
  const objectPath = `${input.institutionId}/${input.courseId}/${randomUUID()}-${safeObjectName(input.fileName)}`;
  const { data, error } = await storageAdmin().from(bucket).createSignedUploadUrl(objectPath, { upsert: false });
  if (error) throw new Error(`Storage rechazó la preparación (${error.message}).`);
  return { bucket, objectPath, signedUrl: data.signedUrl };
}

export async function createPrivateAnnouncementAssetUpload(input: { institutionId: string; uploaderId: string; fileName: string }) {
  const { bucket } = config();
  const objectPath = `${input.institutionId}/announcements/drafts/${input.uploaderId}/${randomUUID()}-${safeObjectName(input.fileName)}`;
  const { data, error } = await storageAdmin().from(bucket).createSignedUploadUrl(objectPath, { upsert: false });
  if (error) throw new Error(`Storage rechazó la preparación (${error.message}).`);
  return { bucket, objectPath, signedUrl: data.signedUrl };
}

export async function inspectPrivateAsset(bucket: string, objectPath: string) {
  const { data, error } = await storageAdmin().from(bucket).info(objectPath);
  if (error) throw new Error(`No se pudo verificar la carga (${error.message}).`);
  return { size: data.size ?? null, contentType: data.contentType ?? null, etag: data.etag ?? null };
}

export async function removePrivateAsset(bucket: string, objectPath: string) {
  const { error } = await storageAdmin().from(bucket).remove([objectPath]);
  if (error) throw new Error(`No se pudo limpiar la carga (${error.message}).`);
}

export async function createPrivateAssetUrl(bucket: string, objectPath: string, expiresIn = 300) {
  const { data, error } = await storageAdmin().from(bucket).createSignedUrl(objectPath, expiresIn);
  if (error) throw new Error(`No se pudo autorizar la descarga (${error.message}).`);
  return data.signedUrl;
}
