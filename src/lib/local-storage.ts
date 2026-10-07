import { createHmac, timingSafeEqual } from "node:crypto";
import { resolve, sep } from "node:path";

export type LocalStorageAction = "read" | "write";

function payload(action: LocalStorageAction, bucket: string, objectPath: string, expiresAt: number) {
  return `${action}\n${bucket}\n${objectPath}\n${expiresAt}`;
}

export function signLocalStorageToken(secret: string, action: LocalStorageAction, bucket: string, objectPath: string, expiresAt: number) {
  return createHmac("sha256", secret).update(payload(action, bucket, objectPath, expiresAt)).digest("hex");
}

export function verifyLocalStorageToken(input: {
  secret: string;
  action: LocalStorageAction;
  bucket: string;
  objectPath: string;
  expiresAt: number;
  signature: string;
  now?: number;
}) {
  if (!Number.isSafeInteger(input.expiresAt) || input.expiresAt < (input.now ?? Date.now())) return false;
  const expected = signLocalStorageToken(input.secret, input.action, input.bucket, input.objectPath, input.expiresAt);
  const actualBuffer = Buffer.from(input.signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function resolveLocalStorageObject(root: string, objectPath: string) {
  if (!root || !objectPath || objectPath.includes("\\") || objectPath.startsWith("/") || objectPath.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Ruta de almacenamiento inválida.");
  }
  const absoluteRoot = resolve(root);
  const absoluteObject = resolve(absoluteRoot, ...objectPath.split("/"));
  if (!absoluteObject.startsWith(`${absoluteRoot}${sep}`)) throw new Error("Ruta de almacenamiento fuera del espacio privado.");
  return absoluteObject;
}
