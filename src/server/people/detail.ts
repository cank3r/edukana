import { db } from "@/lib/db";
import type { EdukanaRole } from "@/types/next-auth";

type Viewer = { id: string; institutionId: string; role: EdukanaRole };

/**
 * Cómo está el acceso de una persona:
 * - `SUSPENDED`: no puede entrar en esta institución.
 * - `HAS_PASSWORD`: ya creó su contraseña y puede entrar.
 * - `INVITED`: tiene una invitación vigente y aún no crea su contraseña.
 * - `EXPIRED`: se le invitó, pero el enlace venció sin usarse.
 * - `NOT_INVITED`: nunca se le envió la invitación.
 */
export type PersonAccessState = "SUSPENDED" | "HAS_PASSWORD" | "INVITED" | "EXPIRED" | "NOT_INVITED";

/**
 * Ficha de una persona de la institución de quien consulta. Devuelve null si no existe
 * o si es de otra institución.
 *
 * Un docente solo ve su propia ficha y la de estudiantes inscritos en sus cursos; de ellos
 * ve solo esos cursos y no ve los vínculos con tutores.
 */
export async function getPersonDetail(viewer: Viewer, userId: string, now = new Date()) {
  const institutionId = viewer.institutionId;
  const isTeacher = viewer.role === "TEACHER" && viewer.id !== userId;
  const person = await db.user.findFirst({
    where: {
      id: userId,
      institutionId,
      ...(isTeacher ? { role: "STUDENT" as const, enrollments: { some: { course: { teacherId: viewer.id, institutionId } } } } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      createdAt: true,
      identity: { select: { passwordHash: true, status: true } },
      passwordResetTokens: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, expiresAt: true, usedAt: true } },
    },
  });
  if (!person) return null;

  const courseScope = { institutionId, ...(isTeacher ? { teacherId: viewer.id } : {}) };
  const showFamily = !isTeacher && viewer.role !== "TEACHER";
  const [teaches, enrollments, children, guardians] = await Promise.all([
    isTeacher
      ? []
      : db.course.findMany({
          where: { institutionId, teacherId: person.id },
          orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
          take: 100,
          select: { id: true, name: true, code: true, archivedAt: true, _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } },
        }),
    db.enrollment.findMany({
      where: { studentId: person.id, course: courseScope },
      orderBy: { enrolledAt: "desc" },
      take: 100,
      select: { id: true, status: true, progressPercent: true, course: { select: { id: true, name: true, code: true } } },
    }),
    showFamily
      ? db.guardianship.findMany({
          where: { institutionId, parentId: person.id, status: { not: "REVOKED" }, student: { institutionId } },
          orderBy: { student: { name: "asc" } },
          select: { id: true, relationship: true, status: true, student: { select: { id: true, name: true } } },
        })
      : [],
    showFamily
      ? db.guardianship.findMany({
          where: { institutionId, studentId: person.id, status: { not: "REVOKED" }, parent: { institutionId } },
          orderBy: { parent: { name: "asc" } },
          select: { id: true, relationship: true, status: true, parent: { select: { id: true, name: true } } },
        })
      : [],
  ]);

  const lastToken = person.passwordResetTokens[0] ?? null;
  const access: PersonAccessState =
    person.status !== "ACTIVE" || person.identity?.status === "SUSPENDED"
      ? "SUSPENDED"
      : person.identity?.passwordHash
        ? "HAS_PASSWORD"
        : lastToken && !lastToken.usedAt && lastToken.expiresAt > now
          ? "INVITED"
          : lastToken
            ? "EXPIRED"
            : "NOT_INVITED";

  return {
    person: { id: person.id, name: person.name, email: person.email, phone: person.phone, role: person.role, status: person.status, createdAt: person.createdAt },
    access,
    hasPassword: Boolean(person.identity?.passwordHash),
    invitedAt: lastToken?.createdAt ?? null,
    teaches: teaches.map((course) => ({ id: course.id, name: course.name, code: course.code, archived: Boolean(course.archivedAt), activeStudents: course._count.enrollments })),
    enrollments: enrollments.map((row) => ({ id: row.id, status: row.status, progressPercent: row.progressPercent, course: row.course })),
    children: children.map((row) => ({ id: row.id, relationship: row.relationship, status: row.status, person: row.student })),
    guardians: guardians.map((row) => ({ id: row.id, relationship: row.relationship, status: row.status, person: row.parent })),
  };
}

export type PersonDetail = NonNullable<Awaited<ReturnType<typeof getPersonDetail>>>;
