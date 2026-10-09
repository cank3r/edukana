import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { normalizeEmail } from "@/server/identity";
import { newPasswordSchema } from "@/server/password-reset";
import { isAttemptAllowed, recordAttempt } from "@/server/security/login-throttle";

/**
 * Docente independiente: una persona que enseña por su cuenta. Por dentro es una institución
 * más (con `settings.kind = "INDEPENDENT"`), con un único administrador que también da los cursos.
 * No necesita migración: la marca vive en `Institution.settings`, que ya existe.
 */

export const INDEPENDENT_KIND = "INDEPENDENT";

/** true si los ajustes de la institución la marcan como espacio de docente independiente. */
export function isIndependentSettings(settings: unknown): boolean {
  return Boolean(settings && typeof settings === "object" && !Array.isArray(settings) && (settings as Record<string, unknown>).kind === INDEPENDENT_KIND);
}

/** Lee la marca de la institución de quien está en sesión. Nunca recibe un id desde el navegador. */
export async function isIndependentInstitution(institutionId: string): Promise<boolean> {
  if (!institutionId) return false;
  const institution = await db.institution.findUnique({ where: { id: institutionId }, select: { settings: true } });
  return isIndependentSettings(institution?.settings);
}

/**
 * `INDEPENDENT_SIGNUP_ENABLED`: "true"/"1" lo activa y "false"/"0" lo apaga. Sin valor, queda
 * activo en desarrollo, pruebas y vistas previas, y apagado en producción.
 */
export function isIndependentSignupEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const value = env.INDEPENDENT_SIGNUP_ENABLED?.trim().toLowerCase();
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  if (env.VERCEL_ENV) return env.VERCEL_ENV !== "production";
  return env.NODE_ENV !== "production";
}

export const independentSignupSchema = z.object({
  name: z.string().trim().min(3, "Escribe tu nombre (al menos 3 letras).").max(120, "El nombre es demasiado largo."),
  email: z.string().trim().toLowerCase().email("Escribe un correo válido.").max(200, "El correo es demasiado largo."),
  password: z.string().min(1, "Escribe una contraseña.").max(200),
  spaceName: z.string().trim().max(160, "El nombre del espacio es demasiado largo.").optional(),
});

export type IndependentSignupInput = z.input<typeof independentSignupSchema>;
export type IndependentSignupResult =
  | { ok: true; institutionId: string; userId: string; slug: string; reusedAccount: boolean }
  | { ok: false; message: string };

const DISABLED = "Por ahora no se pueden crear espacios nuevos.";
const TOO_MANY = "Hiciste demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo.";
const EXISTING_ACCOUNT = "Ese correo ya tiene una cuenta en Edukana y la contraseña no coincide. Escribe la contraseña con la que entras o recupérala desde «¿Olvidaste tu contraseña?».";

/** «Cursos de Ana Pérez» → «cursos-de-ana-perez». Siempre entre 3 y 50 caracteres. */
export function slugFromName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
  return base.length >= 3 ? base : `docente${base ? `-${base}` : ""}`;
}

async function freeSlug(name: string): Promise<string> {
  const base = slugFromName(name);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 7)}`;
    if (!(await db.institution.findUnique({ where: { slug: candidate }, select: { id: true } }))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Período por omisión: abierto desde hoy y por diez años, para crear cursos sin pensar en fechas. */
function defaultPeriod(now: Date) {
  const end = new Date(now);
  end.setUTCFullYear(end.getUTCFullYear() + 10);
  return { name: "Mis cursos", startDate: now, endDate: end, isActive: true };
}

/**
 * Crea en una transacción la cuenta (o reutiliza la existente si la contraseña coincide), el espacio
 * del docente, su membresía de administrador y un período abierto. Cada intento cuenta para el límite
 * de intentos (por correo y por IP), haya salido bien o no, para frenar altas en masa.
 */
export async function registerIndependentTeacher(input: IndependentSignupInput, ip: string, now = new Date()): Promise<IndependentSignupResult> {
  if (!isIndependentSignupEnabled()) return { ok: false, message: DISABLED };
  const parsed = independentSignupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const data = parsed.data;
  const email = normalizeEmail(data.email);
  const attempt = { email, ip, kind: "signup" as const };
  if (!(await isAttemptAllowed(attempt, now))) return { ok: false, message: TOO_MANY };
  await recordAttempt(attempt, false, now);

  const existing = await db.identity.findUnique({ where: { email }, select: { id: true, passwordHash: true, status: true } });
  if (existing) {
    const matches = existing.passwordHash ? await bcrypt.compare(data.password, existing.passwordHash) : false;
    if (!matches || existing.status !== "ACTIVE") return { ok: false, message: EXISTING_ACCOUNT };
  } else {
    const password = newPasswordSchema.safeParse(data.password);
    if (!password.success) return { ok: false, message: password.error.issues[0]?.message ?? "Elige otra contraseña." };
  }

  const spaceName = data.spaceName || `Cursos de ${data.name}`;
  const passwordHash = existing ? null : await bcrypt.hash(data.password, 12);
  for (let retry = 0; retry < 2; retry += 1) {
    const slug = await freeSlug(spaceName);
    try {
      const created = await db.$transaction(async (tx) => {
        const identityId = existing?.id ?? (await tx.identity.create({ data: { email, passwordHash }, select: { id: true } })).id;
        const institution = await tx.institution.create({
          data: { name: spaceName, slug, type: "OTHER", settings: { kind: INDEPENDENT_KIND } },
          select: { id: true },
        });
        const user = await tx.user.create({
          data: { identityId, institutionId: institution.id, name: data.name, email, role: "ADMIN", status: "ACTIVE" },
          select: { id: true },
        });
        await tx.academicPeriod.create({ data: { institutionId: institution.id, ...defaultPeriod(now) } });
        await tx.auditLog.create({
          data: {
            institutionId: institution.id,
            userId: user.id,
            action: "INDEPENDENT_SPACE_CREATED",
            entity: "Institution",
            entityId: institution.id,
            changes: { slug, reusedAccount: Boolean(existing) },
          },
        });
        return { institutionId: institution.id, userId: user.id };
      });
      return { ok: true, ...created, slug, reusedAccount: Boolean(existing) };
    } catch (error) {
      // Dos altas simultáneas con el mismo correo o la misma dirección: se reintenta una vez.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && retry === 0) {
        if (!existing && (await db.identity.findUnique({ where: { email }, select: { id: true } }))) return { ok: false, message: EXISTING_ACCOUNT };
        continue;
      }
      throw error;
    }
  }
  return { ok: false, message: "No pudimos crear tu espacio. Intenta de nuevo." };
}

export type IndependentHome = {
  name: string;
  slug: string;
  numbers: { courses: number; publicCourses: number; activeStudents: number; pendingOrders: number };
};

/** Datos del inicio del docente independiente, siempre de su propio espacio. Null si no es uno. */
export async function getIndependentHome(institutionId: string): Promise<IndependentHome | null> {
  const institution = await db.institution.findUnique({ where: { id: institutionId }, select: { name: true, slug: true, settings: true } });
  if (!institution || !isIndependentSettings(institution.settings)) return null;
  const live = { institutionId, archivedAt: null };
  const [courses, publicCourses, activeStudents, pendingOrders] = await Promise.all([
    db.course.count({ where: live }),
    db.course.count({ where: { ...live, isPublic: true, isPublished: true } }),
    db.enrollment.count({ where: { status: "ACTIVE", course: { institutionId } } }),
    db.courseOrder.count({ where: { institutionId, status: "PENDING" } }),
  ]);
  return { name: institution.name, slug: institution.slug, numbers: { courses, publicCourses, activeStudents, pendingOrders } };
}
