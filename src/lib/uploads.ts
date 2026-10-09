/**
 * Reglas de los archivos que suben estudiantes, docentes y administración fuera de las lecciones:
 * archivos de una entrega, imagen del curso, foto de perfil y logo de la institución.
 * Sin dependencias de servidor: la pantalla usa los mismos límites para avisar antes de subir.
 */

export type UploadPurpose = "submission" | "course-image" | "avatar" | "logo";

const MB = 1024 * 1024;

export const SUBMISSION_MAX_FILES = 5;
export const SUBMISSION_MAX_BYTES = 25 * MB;
export const IMAGE_MAX_BYTES = 5 * MB;

/** Firma de bytes con la que debe empezar cada formato. */
type Signature = "pdf" | "png" | "jpeg" | "webp" | "gif" | "zip" | "ole";

const IMAGE_TYPES: Record<string, Signature> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

const SUBMISSION_TYPES: Record<string, Signature> = {
  "application/pdf": "pdf",
  ...IMAGE_TYPES,
  "image/gif": "gif",
  // Office moderno (Word, Excel, PowerPoint) es un ZIP por dentro.
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "zip",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "zip",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "zip",
  // Office anterior a 2007.
  "application/msword": "ole",
  "application/vnd.ms-excel": "ole",
  "application/vnd.ms-powerpoint": "ole",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
};

export const SUBMISSION_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip";
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

function allowedTypes(purpose: UploadPurpose) {
  return purpose === "submission" ? SUBMISSION_TYPES : IMAGE_TYPES;
}

export function maxBytes(purpose: UploadPurpose) {
  return purpose === "submission" ? SUBMISSION_MAX_BYTES : IMAGE_MAX_BYTES;
}

/**
 * Nombre visible del archivo: sin carpetas, sin caracteres de control ni separadores de ruta,
 * con espacios simples y como máximo 180 caracteres conservando la extensión.
 */
export function cleanFileName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "")
    .replace(/[\u0000-\u001f\u007f<>:"|?*]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  if (base.length <= 180) return base;
  const dot = base.lastIndexOf(".");
  const extension = dot > 0 && base.length - dot <= 10 ? base.slice(dot) : "";
  return `${base.slice(0, 180 - extension.length)}${extension}`;
}

/** Valida lo que la persona declara antes de autorizar la subida. Devuelve el error o null. */
export function validateUploadRequest(purpose: UploadPurpose, file: { name: string; type: string; size: number }): string | null {
  const name = cleanFileName(file.name);
  if (!name) return "El archivo no tiene un nombre válido. Cámbiale el nombre e inténtalo de nuevo.";
  if (!Object.hasOwn(allowedTypes(purpose), file.type)) {
    return purpose === "submission"
      ? "Ese tipo de archivo no se puede entregar. Usa PDF, una imagen, un documento de Word, Excel o PowerPoint, o un ZIP."
      : "Usa una imagen JPG, PNG o WebP.";
  }
  const max = maxBytes(purpose);
  if (!Number.isInteger(file.size) || file.size <= 0) return "El archivo está vacío.";
  if (file.size > max) return `El archivo pesa más de ${max / MB} MB. Redúcelo e inténtalo de nuevo.`;
  return null;
}

/** Bytes mínimos que hay que leer del inicio del archivo para reconocer su formato. */
export const SIGNATURE_BYTES = 16;

function startsWith(bytes: Uint8Array, prefix: number[], offset = 0) {
  return bytes.length >= offset + prefix.length && prefix.every((value, index) => bytes[offset + index] === value);
}

function signatureOf(bytes: Uint8Array): Signature | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "webp"; // RIFF....WEBP
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "gif"; // GIF8
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return "zip"; // PK.. (un ZIP vacío no sirve como entrega)
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "ole";
  return null;
}

/** El contenido real coincide con el tipo declarado y permitido para ese uso. */
export function contentMatchesType(purpose: UploadPurpose, mimeType: string, head: Uint8Array): boolean {
  const types = allowedTypes(purpose);
  return Object.hasOwn(types, mimeType) && signatureOf(head) === types[mimeType];
}

/** Ruta pública con la que se muestran la imagen del curso y el logo. */
export function publicImageUrl(assetId: string) {
  return `/api/public-images/${assetId}`;
}

/** Ruta privada (con permiso) de un archivo, por ejemplo la foto de perfil. */
export function privateAssetUrl(assetId: string) {
  return `/api/assets/${assetId}`;
}

/** Lee el id del activo guardado en un campo de imagen. Null si el valor no es de Edukana. */
export function assetIdFromUrl(value: string | null | undefined, kind: "public" | "private"): string | null {
  const prefix = kind === "public" ? "/api/public-images/" : "/api/assets/";
  if (!value?.startsWith(prefix)) return null;
  const id = value.slice(prefix.length);
  return /^[a-z0-9]{10,40}$/i.test(id) ? id : null;
}
