import { db } from "@/lib/db";
import { isPlatformOperator } from "./institutions";
import { publicCourseWhere } from "@/server/catalog/public";
import { salesMonth } from "./sales";

export async function listIndependentTeachers(operatorEmail: string | null | undefined, q = "", now = new Date()) {
  if (!isPlatformOperator(operatorEmail)) return null;
  const search = q.trim().slice(0, 100);
  const institutions = await db.institution.findMany({
    where: { settings: { path: ["kind"], equals: "INDEPENDENT" },
      ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" as const } },
        { users: { some: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, email: { contains: search, mode: "insensitive" as const } } } }] } : {}),
    },
    select: { id: true, name: true, slug: true, createdAt: true,
      users: { where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } }, orderBy: { createdAt: "asc" }, take: 1,
        select: { name: true, email: true } },
      _count: { select: { courses: { where: { isPublic: true, isPublished: true, archivedAt: null } } } },
    }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 200,
  });
  const sales = await db.courseOrder.groupBy({
    by: ["institutionId", "currency"],
    where: { institutionId: { in: institutions.map((row) => row.id) }, status: "PAID", paidAt: salesMonth(now) },
    _sum: { amountCents: true }, _count: { _all: true },
  });
  return institutions.map(({ users, _count, ...institution }) => ({ ...institution,
    teacherName: users[0]?.name ?? institution.name, email: users[0]?.email ?? null, publishedCourses: _count.courses,
    sales: sales.filter((row) => row.institutionId === institution.id).map((row) => ({
      currency: row.currency, amountCents: row._sum.amountCents ?? 0, count: row._count._all,
    })),
  }));
}

export async function getOperatorPublicCourses(operatorEmail: string | null | undefined, institutionId: string) {
  if (!isPlatformOperator(operatorEmail)) return null;
  return db.course.findMany({ where: publicCourseWhere(institutionId),
    select: { id: true, name: true, institution: { select: { slug: true } } }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 200 });
}
