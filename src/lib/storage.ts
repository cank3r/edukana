import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { safeObjectName } from "@/lib/lms";
import { resolveLocalStorageObject, signLocalStorageToken } from "@/lib/local-storage";

type SupabaseConfig = { mode: "supabase"; url: string; key: string; bucket: string };
type LocalConfig = { mode: "local"; root: string; secret: string; appUrl: string; bucket: string };
type StorageConfig = SupabaseConfig | LocalConfig;

function config(): StorageConfig {
  const localRoot = process.env.LOCAL_STORAGE_ROOT;
  if (localRoot) {
    const secret = process.env.LOCAL_STORAGE_SECRET ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
    const appUrl = process.env.APP_URL ?? process.env.NEXTAUTH_URL;
    if (!secret || secret.length < 32) throw new Error("LOCAL_STORAGE_SECRET debe tener al menos 32 caracteres.");
    if (!appUrl) throw new Error("APP_URL es obligatorio con almacenamiento local.");
    return { mode: "local", root: localRoot, secret, appUrl: appUrl.replace(/\/$/, ""), bucket: "local-private" };
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "edukana";
  if (!url || !key) throw new Error("Supabase Storage no está configurado.");
  return { mode: "supabase", url: url.replace(/\/$/, ""), key, bucket };
}

function storageAdmin(value: SupabaseConfig) {
  return createClient(value.url, value.key, { auth: { autoRefreshToken: false, persistSession: false } }).storage;
}

function localSignedUrl(value: LocalConfig, action: "read" | "write", objectPath: string, expiresInSeconds: number) {
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  const url = new URL("/api/local-storage", value.appUrl);
  url.searchParams.set("bucket", value.bucket);
  url.searchParams.set("path", objectPath);
  url.searchParams.set("expires", String(expiresAt));
  url.searchParams.set("signature", signLocalStorageToken(value.secret, action, value.bucket, objectPath, expiresAt));
  return url.toString();
}

async function createUpload(objectPath: string) {
  const value = config();
  if (value.mode === "local") return { bucket: value.bucket, objectPath, signedUrl: localSignedUrl(value, "write", objectPath, 600) };
  const { data, error } = await storageAdmin(value).from(value.bucket).createSignedUploadUrl(objectPath, { upsert: false });
  if (error) throw new Error(`Storage rechazó la preparación (${error.message}).`);
  return { bucket: value.bucket, objectPath, signedUrl: data.signedUrl };
}

export async function createPrivateAssetUpload(input: { institutionId: string; courseId: string; fileName: string }) {
  const objectPath = `${input.institutionId}/${input.courseId}/${randomUUID()}-${safeObjectName(input.fileName)}`;
  return createUpload(objectPath);
}

export async function createPrivateAnnouncementAssetUpload(input: { institutionId: string; uploaderId: string; fileName: string }) {
  const objectPath = `${input.institutionId}/announcements/drafts/${input.uploaderId}/${randomUUID()}-${safeObjectName(input.fileName)}`;
  return createUpload(objectPath);
}

export async function inspectPrivateAsset(bucket: string, objectPath: string) {
  const value = config();
  if (value.mode === "local") {
    if (bucket !== value.bucket) throw new Error("Bucket local no autorizado.");
    const filePath = resolveLocalStorageObject(value.root, objectPath);
    const [file, rawMetadata] = await Promise.all([stat(filePath), readFile(`${filePath}.meta.json`, "utf8")]);
    const metadata = JSON.parse(rawMetadata) as { size: number; contentType: string; etag: string };
    return { size: file.size, contentType: metadata.contentType, etag: metadata.etag };
  }
  const { data, error } = await storageAdmin(value).from(bucket).info(objectPath);
  if (error) throw new Error(`No se pudo verificar la carga (${error.message}).`);
  return { size: data.size ?? null, contentType: data.contentType ?? null, etag: data.etag ?? null };
}

export async function removePrivateAsset(bucket: string, objectPath: string) {
  const value = config();
  if (value.mode === "local") {
    if (bucket !== value.bucket) throw new Error("Bucket local no autorizado.");
    const filePath = resolveLocalStorageObject(value.root, objectPath);
    await mkdir(dirname(filePath), { recursive: true });
    await Promise.all([rm(filePath, { force: true }), rm(`${filePath}.meta.json`, { force: true })]);
    return;
  }
  const { error } = await storageAdmin(value).from(bucket).remove([objectPath]);
  if (error) throw new Error(`No se pudo limpiar la carga (${error.message}).`);
}

export async function createPrivateAssetUrl(bucket: string, objectPath: string, expiresIn = 300) {
  const value = config();
  if (value.mode === "local") {
    if (bucket !== value.bucket) throw new Error("Bucket local no autorizado.");
    resolveLocalStorageObject(value.root, objectPath);
    return localSignedUrl(value, "read", objectPath, expiresIn);
  }
  const { data, error } = await storageAdmin(value).from(bucket).createSignedUrl(objectPath, expiresIn);
  if (error) throw new Error(`No se pudo autorizar la descarga (${error.message}).`);
  return data.signedUrl;
}
