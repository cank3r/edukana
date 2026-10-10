import { isInstitutionCatalogAvailable } from "@/server/platform/features";
import { db } from "@/lib/db";

/** Lo que se muestra de la institución en sus páginas públicas. */
export type PublicBrand = { id: string; name: string; slug: string; logoUrl: string | null; brandColor: string | null; settings: unknown };

export type PublicCourseCard = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  teacherName: string;
  priceCents: number | null;
  currency: string;
  lessons: number;
  rating: number | null;
  reviews: number;
};

const publishedLessons = { isPublished: true, section: { isPublished: true } } as const;

/** Un curso aparece en el catálogo si es público, está publicado y no está archivado. */
export const publicCourseWhere = (institutionId: string) => ({ institutionId, isPublic: true, isPublished: true, archivedAt: null });

/** Solo enlaces web seguros o rutas propias: nada de `javascript:` ni datos incrustados. */
export function safeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https:\/\/[^\s"'<>]+$/i.test(url) || /^\/[^\s"'<>/][^\s"'<>]*$/.test(url) ? url : null;
}

/** Color de marca solo si es un hexadecimal válido. */
export const safeColor = (color: string | null | undefined) => (color && /^#[0-9a-f]{6}$/i.test(color) ? color : null);

export async function findBrand(slug: string): Promise<PublicBrand | null> {
  if (!slug || slug.length > 100) return null;
  const institution = await db.institution.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, logoUrl: true, brandColor: true, settings: true },
  });
  if (!institution || !(await isInstitutionCatalogAvailable(institution.id))) return null;
  return { ...institution, logoUrl: safeImageUrl(institution.logoUrl), brandColor: safeColor(institution.brandColor) };
}

async function ratingsFor(courseIds: string[]) {
  if (!courseIds.length) return new Map<string, { rating: number; reviews: number }>();
  const rows = await db.courseReview.groupBy({ by: ["courseId"], where: { courseId: { in: courseIds } }, _avg: { rating: true }, _count: { _all: true } });
  return new Map(rows.map((row) => [row.courseId, { rating: Math.round((row._avg.rating ?? 0) * 10) / 10, reviews: row._count._all }]));
}

/** Cursos del catálogo de una institución, con búsqueda por nombre o descripción. */
export async function listPublicCourses(institutionId: string, query = ""): Promise<PublicCourseCard[]> {
  if (!(await isInstitutionCatalogAvailable(institutionId))) return [];
  const q = query.trim().slice(0, 100);
  const courses = await db.course.findMany({
    where: {
      ...publicCourseWhere(institutionId),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { description: { contains: q, mode: "insensitive" as const } }] } : {}),
    },
    select: {
      id: true,
      name: true,
      description: true,
      imageUrl: true,
      priceCents: true,
      currency: true,
      teacher: { select: { name: true } },
      _count: { select: { lessons: { where: publishedLessons } } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 200,
  });
  const ratings = await ratingsFor(courses.map((course) => course.id));
  return courses.map((course) => ({
    id: course.id,
    name: course.name,
    description: course.description,
    imageUrl: safeImageUrl(course.imageUrl),
    teacherName: course.teacher.name,
    priceCents: course.priceCents,
    currency: course.currency,
    lessons: course._count.lessons,
    rating: ratings.get(course.id)?.rating ?? null,
    reviews: ratings.get(course.id)?.reviews ?? 0,
  }));
}

/** «Ana P.»: en la página pública no se muestra el apellido completo de quien reseña. */
export function publicName(name: string) {
  const [first = "", ...rest] = name.trim().split(/\s+/);
  const initial = rest.length ? ` ${rest[rest.length - 1][0]?.toUpperCase()}.` : "";
  return `${first}${initial}` || "Estudiante";
}

/** Portada pública de un curso: temario (solo títulos), reseñas y precio. null si no está en el catálogo. */
export async function getPublicCourse(institutionId: string, courseId: string) {
  if (!(await isInstitutionCatalogAvailable(institutionId))) return null;
  if (!courseId || courseId.length > 64) return null;
  const course = await db.course.findFirst({
    where: { ...publicCourseWhere(institutionId), id: courseId },
    select: {
      id: true,
      name: true,
      description: true,
      imageUrl: true,
      priceCents: true,
      currency: true,
      maxStudents: true,
      teacher: { select: { name: true } },
      sections: {
        where: { isPublished: true },
        orderBy: { order: "asc" },
        select: { id: true, title: true, lessons: { where: { isPublished: true }, orderBy: { order: "asc" }, select: { id: true, title: true } } },
      },
      reviews: { orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, rating: true, comment: true, updatedAt: true, user: { select: { name: true } } } },
    },
  });
  if (!course) return null;
  const rating = (await ratingsFor([course.id])).get(course.id);
  return {
    ...course,
    imageUrl: safeImageUrl(course.imageUrl),
    teacherName: course.teacher.name,
    lessons: course.sections.reduce((sum, section) => sum + section.lessons.length, 0),
    rating: rating?.rating ?? null,
    reviewCount: rating?.reviews ?? 0,
    reviews: course.reviews.map((review) => ({ id: review.id, rating: review.rating, comment: review.comment, updatedAt: review.updatedAt, author: publicName(review.user.name) })),
  };
}
