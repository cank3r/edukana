import { createHmac } from "node:crypto";
import { db } from "@/lib/db";

export const LOGIN_WINDOW_MINUTES = 15;
export const MAX_FAILURES_PER_EMAIL = Number(process.env.LOGIN_MAX_FAILURES_PER_EMAIL ?? 5);
export const MAX_FAILURES_PER_IP = Number(process.env.LOGIN_MAX_FAILURES_PER_IP ?? 20);

export type ThrottleKind = "login" | "reset" | "signup";
export type ThrottleSubject = { email: string; ip: string; kind?: ThrottleKind };

function secret() {
  const value = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET es obligatorio para el límite de intentos.");
  return value;
}

/** Los correos y las IP se guardan como HMAC: la tabla no contiene datos personales en claro. */
function digest(scope: string, value: string) {
  return createHmac("sha256", secret()).update(`${scope}:${value.trim().toLowerCase()}`).digest("hex");
}

function keys({ email, ip, kind = "login" }: ThrottleSubject) {
  return { emailHash: digest(`${kind}:email`, email), ipHash: digest(`${kind}:ip`, ip || "unknown") };
}

/** IP del cliente tal como la entrega el proxy de la plataforma. */
export function clientIpFromHeaders(headers: Headers | undefined | null) {
  const forwarded = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers?.get("x-real-ip")?.trim() || "unknown";
}

/** true mientras el correo y la IP estén por debajo de sus límites de fallos en la ventana. */
export async function isAttemptAllowed(subject: ThrottleSubject, now = new Date()) {
  const { emailHash, ipHash } = keys(subject);
  const since = new Date(now.getTime() - LOGIN_WINDOW_MINUTES * 60_000);
  const [byEmail, byIp] = await Promise.all([
    db.loginAttempt.count({ where: { emailHash, succeeded: false, createdAt: { gte: since } } }),
    db.loginAttempt.count({ where: { ipHash, succeeded: false, createdAt: { gte: since } } }),
  ]);
  return byEmail < MAX_FAILURES_PER_EMAIL && byIp < MAX_FAILURES_PER_IP;
}

/** Registra el intento y elimina los registros de ese correo con más de un día. */
export async function recordAttempt(subject: ThrottleSubject, succeeded: boolean, now = new Date()) {
  const { emailHash, ipHash } = keys(subject);
  await db.$transaction([
    db.loginAttempt.deleteMany({ where: { emailHash, createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60_000) } } }),
    db.loginAttempt.create({ data: { emailHash, ipHash, succeeded, createdAt: now } }),
  ]);
}
