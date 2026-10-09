import { db } from "@/lib/db";

/** Cómo está el acceso de la persona: ya creó su contraseña, tiene un enlace vigente, o nunca se la invitó. */
export type PersonAccessState = "ready" | "invited" | "pending";

/**
 * Ficha de cualquier persona de la institución: datos, acceso, cursos que enseña,
 * cursos en los que está inscrita e hijos vinculados si es tutor.
 * Devuelve null si la persona no es de la institución indicada.
 */
export async function getPersonDetail(institutionId: string, userId: string, now = new Date()) {
  const person = await db.user.findFirst({
    where: { id: userId, institutionId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      createdAt: true,
      identity: { select: { passwordHash: true } },
      _count: { select: { passwordResetTokens: { where: { usedAt: null, expiresAt: { gt: now } } } } },
      taughtCourses: {
        where: { institutionId },
        orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
        take: 50,
        select: { id: true, name: true, code: true, archivedAt: true, _count: { select: { enrollments: { where: { status: { in: ["ACTIVE", "COMPLETED"] } } } } } },
      },
      enrollments: {
        where: { course: { institutionId } },
        orderBy: { enrolledAt: "desc" },
        take: 50,
        select: { id: true, status: true, progressPercent: true, course: { select: { id: true, name: true, code: true } } },
      },
      parentGuardianships: {
        where: { institutionId, status: { not: "REVOKED" } },
        orderBy: { createdAt: "asc" },
        select: { id: true, relationship: true, status: true, student: { select: { id: true, name: true } } },
      },
    },
  });
  if (!person) return null;
  const { identity, _count, taughtCourses, enrollments, parentGuardianships, ...data } = person;
  const access: PersonAccessState = identity?.passwordHash ? "ready" : _count.passwordResetTokens > 0 ? "invited" : "pending";
  return {
    ...data,
    access,
    taughtCourses: taughtCourses.map(({ _count: counts, ...course }) => ({ ...course, students: counts.enrollments })),
    enrollments,
    children: parentGuardianships.map((link) => ({ id: link.id, relationship: link.relationship, status: link.status, student: link.student })),
  };
}

export type PersonDetail = NonNullable<Awaited<ReturnType<typeof getPersonDetail>>>;
