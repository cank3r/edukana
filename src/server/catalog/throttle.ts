import { createHmac } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Límite de solicitudes del formulario público del catálogo. Usa la misma tabla que el inicio
 * de sesión, con su propio prefijo en el HMAC: los contadores no se mezclan y no se guardan
 * correos ni IP en claro. Aquí cuenta toda solicitud, no solo las fallidas.
 */
export const CATALOG_WINDOW_MINUTES = 15;
export const MAX_REQUESTS_PER_EMAIL = 5;
export const MAX_REQUESTS_PER_IP = 20;

function digest(scope: string, value: string) {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET es obligatorio para el límite de intentos.");
  return createHmac("sha256", secret).update(`catalog:${scope}:${value.trim().toLowerCase()}`).digest("hex");
}

/** Registra la solicitud y dice si cabe dentro del límite. Las que exceden no se registran. */
export async function takeCatalogAttempt(subject: { email: string; ip: string }, now = new Date()) {
  const emailHash = digest("email", subject.email);
  const ipHash = digest("ip", subject.ip || "unknown");
  const since = new Date(now.getTime() - CATALOG_WINDOW_MINUTES * 60_000);
  const [byEmail, byIp] = await Promise.all([
    db.loginAttempt.count({ where: { emailHash, createdAt: { gte: since } } }),
    db.loginAttempt.count({ where: { ipHash, createdAt: { gte: since } } }),
  ]);
  if (byEmail >= MAX_REQUESTS_PER_EMAIL || byIp >= MAX_REQUESTS_PER_IP) return false;
  await db.$transaction([
    db.loginAttempt.deleteMany({ where: { emailHash, createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60_000) } } }),
    db.loginAttempt.create({ data: { emailHash, ipHash, succeeded: true, createdAt: now } }),
  ]);
  return true;
}
