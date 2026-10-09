import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ensureIdentity, normalizeEmail } from "@/server/identity";

type Tx = Prisma.TransactionClient;

export type Buyer = { id: string; name: string; email: string; role: string; status: "ACTIVE" | "INACTIVE" | "SUSPENDED" };

/**
 * La persona del correo en la institución. Si no existe, se crea como estudiante, sin contraseña,
 * reutilizando su identidad si ya tiene cuenta en otra institución. Quien ya es miembro se
 * devuelve tal cual: no se le cambia nombre, rol ni estado.
 *
 * `status` es el estado con que nace: ACTIVE si entra ya al curso; INACTIVE si queda a la espera
 * de que se confirme su pago (no puede entrar hasta entonces).
 */
export async function ensureBuyer(
  institutionId: string,
  input: { name: string; email: string },
  status: "ACTIVE" | "INACTIVE",
): Promise<{ buyer: Buyer; created: boolean }> {
  const email = normalizeEmail(input.email);
  const select = { id: true, name: true, email: true, role: true, status: true } as const;
  const existing = await db.user.findFirst({ where: { institutionId, email }, select });
  if (existing) return { buyer: existing, created: false };
  try {
    const buyer = await db.$transaction(async (tx) => {
      const identityId = await ensureIdentity(tx, { email });
      return tx.user.create({ data: { identityId, institutionId, name: input.name, email, role: "STUDENT", status }, select });
    });
    return { buyer, created: true };
  } catch (error) {
    // Dos solicitudes simultáneas del mismo correo: la segunda reutiliza a la persona creada.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { buyer: await db.user.findFirstOrThrow({ where: { institutionId, email }, select }), created: false };
    }
    throw error;
  }
}

export type SeatCheck =
  | { ok: true; enrollment: { id: string; status: string } | null }
  | { ok: false; message: string };

/**
 * Con el curso bloqueado (FOR UPDATE), comprueba si la persona puede quedar inscrita: el curso
 * no está archivado y, si hace falta un cupo nuevo, queda alguno. No escribe nada.
 */
export async function checkSeat(tx: Tx, institutionId: string, courseId: string, userId: string): Promise<SeatCheck> {
  const rows = await tx.$queryRaw<Array<{ maxStudents: number | null; archivedAt: Date | null }>>`
    SELECT "maxStudents", "archivedAt" FROM "courses" WHERE "id" = ${courseId} AND "institutionId" = ${institutionId} FOR UPDATE`;
  const course = rows[0];
  if (!course || course.archivedAt) return { ok: false, message: "Este curso ya no está disponible." };
  const enrollment = await tx.enrollment.findUnique({ where: { studentId_courseId: { studentId: userId, courseId } }, select: { id: true, status: true } });
  const needsSeat = !enrollment || enrollment.status === "DROPPED";
  if (needsSeat && course.maxStudents !== null) {
    const active = await tx.enrollment.count({ where: { courseId, status: "ACTIVE" } });
    if (active >= course.maxStudents) return { ok: false, message: "Este curso ya no tiene cupos disponibles." };
  }
  return { ok: true, enrollment };
}

/** Inscribe tras `checkSeat`: crea la inscripción, reincorpora a quien estaba retirado o no cambia nada. */
export async function applyEnrollment(
  tx: Tx,
  institutionId: string,
  courseId: string,
  userId: string,
  enrollment: { id: string; status: string } | null,
): Promise<"created" | "reinstated" | "already"> {
  if (!enrollment) {
    await tx.enrollment.create({ data: { institutionId, courseId, studentId: userId, status: "ACTIVE" } });
    return "created";
  }
  if (enrollment.status === "DROPPED") {
    await tx.enrollment.update({ where: { id: enrollment.id }, data: { status: "ACTIVE", withdrawnAt: null, withdrawReason: null } });
    return "reinstated";
  }
  return "already";
}

export const rowLocked = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted } as const;
