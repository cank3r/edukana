import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rm, stat } from "node:fs/promises";
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

/** Archivos de una entrega. Fuera de `<institución>/<curso>/` para que solo los confirme `/api/uploads`. */
export async function createSubmissionFileUpload(input: { institutionId: string; courseId: string; assignmentId: string; userId: string; fileName: string }) {
  return createUpload(`${input.institutionId}/submissions/${input.courseId}/${input.assignmentId}/${input.userId}/${randomUUID()}-${safeObjectName(input.fileName)}`);
}

/** Imagen del curso o logo: se sirven sin sesión por `/api/public-images/[assetId]`. */
export async function createPublicImageUpload(input: { institutionId: string; scope: "course" | "logo"; ownerId: string; fileName: string }) {
  return createUpload(`${input.institutionId}/public/${input.scope}/${input.ownerId}/${randomUUID()}-${safeObjectName(input.fileName)}`);
}

/** Foto de perfil: privada de la persona. */
export async function createAvatarUpload(input: { institutionId: string; userId: string; fileName: string }) {
  return createUpload(`${input.institutionId}/avatars/${input.userId}/${randomUUID()}-${safeObjectName(input.fileName)}`);
}

/** Primeros bytes de un archivo guardado, para comprobar su formato real. */
export async function readPrivateAssetHead(bucket: string, objectPath: string, length: number): Promise<Uint8Array> {
  const value = config();
  if (value.mode === "local") {
    if (bucket !== value.bucket) throw new Error("Bucket local no autorizado.");
    const handle = await open(resolveLocalStorageObject(value.root, objectPath), "r");
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, 0);
      return new Uint8Array(buffer.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
  }
  const { data, error } = await storageAdmin(value).from(bucket).createSignedUrl(objectPath, 60);
  if (error) throw new Error(`No se pudo leer la carga (${error.message}).`);
  const response = await fetch(data.signedUrl, { headers: { range: `bytes=0-${length - 1}` }, cache: "no-store" });
  if (!response.ok) throw new Error(`No se pudo leer la carga (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer()).subarray(0, length);
}

/** Contenido completo de un archivo guardado (solo para imágenes pequeñas que se sirven públicamente). */
export async function readPrivateAsset(bucket: string, objectPath: string): Promise<Uint8Array> {
  const value = config();
  if (value.mode === "local") {
    if (bucket !== value.bucket) throw new Error("Bucket local no autorizado.");
    return new Uint8Array(await readFile(resolveLocalStorageObject(value.root, objectPath)));
  }
  const { data, error } = await storageAdmin(value).from(bucket).download(objectPath);
  if (error) throw new Error(`No se pudo leer el archivo (${error.message}).`);
  return new Uint8Array(await data.arrayBuffer());
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
