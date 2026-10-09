import { db } from "@/lib/db";
import { institutionCurrency, parseMoneyToCents } from "@/server/finance/money";
import { canManageSales, NO_PERMISSION, type SalesActor, type SalesResult } from "./access";

export type CatalogCourseRow = {
  id: string;
  name: string;
  teacherName: string;
  isPublic: boolean;
  isPublished: boolean;
  priceCents: number | null;
  currency: string;
  imageUrl: string | null;
};

/** Cursos no archivados de la institución con su estado en el catálogo. */
export async function listCatalogCourses(actor: SalesActor): Promise<CatalogCourseRow[] | null> {
  if (!(await canManageSales(actor))) return null;
  const courses = await db.course.findMany({
    where: { institutionId: actor.institutionId, archivedAt: null },
    orderBy: [{ isPublic: "desc" }, { name: "asc" }],
    take: 300,
    select: { id: true, name: true, isPublic: true, isPublished: true, priceCents: true, currency: true, imageUrl: true, teacher: { select: { name: true } } },
  });
  return courses.map(({ teacher, ...course }) => ({ ...course, teacherName: teacher.name }));
}

/**
 * Pone o quita un curso del catálogo y fija su precio. `price` vacío o «0» = gratis.
 * `imageUrl` (opcional): enlace https a la imagen de portada.
 */
export async function setCourseCatalog(
  actor: SalesActor,
  courseId: string,
  input: { isPublic: boolean; price: string; imageUrl?: string },
): Promise<SalesResult> {
  if (!(await canManageSales(actor))) return { ok: false, message: NO_PERMISSION };
  const priceText = String(input.price ?? "").trim();
  const priceCents = priceText ? parseMoneyToCents(priceText) : 0;
  if (priceCents === null) return { ok: false, message: "Escribe el precio como un número, por ejemplo 2500 o 2,500.00. Déjalo en 0 si es gratis." };
  const imageUrl = String(input.imageUrl ?? "").trim();
  if (imageUrl && (imageUrl.length > 500 || !/^https:\/\/[^\s"'<>]+$/i.test(imageUrl))) {
    return { ok: false, message: "La imagen debe ser un enlace que empiece con https://. Déjalo vacío si no tienes una." };
  }

  const [course, institution] = await Promise.all([
    db.course.findFirst({ where: { id: String(courseId ?? ""), institutionId: actor.institutionId, archivedAt: null }, select: { id: true, name: true, isPublished: true } }),
    db.institution.findUnique({ where: { id: actor.institutionId }, select: { settings: true } }),
  ]);
  if (!course) return { ok: false, message: "No encontramos ese curso en tu institución." };

  await db.course.update({
    where: { id: course.id },
    data: { isPublic: Boolean(input.isPublic), priceCents: priceCents || null, currency: institutionCurrency(institution?.settings), imageUrl: imageUrl || null },
  });
  await db.auditLog.create({
    data: { institutionId: actor.institutionId, userId: actor.id, action: "CATALOG_COURSE_UPDATED", entity: "Course", entityId: course.id, changes: { isPublic: Boolean(input.isPublic), priceCents } },
  });
  if (input.isPublic && !course.isPublished) {
    return { ok: true, message: `Guardado. «${course.name}» aún no está publicado: aparecerá en el catálogo cuando lo publiques.` };
  }
  return { ok: true, message: input.isPublic ? `«${course.name}» está en el catálogo.` : `«${course.name}» ya no aparece en el catálogo.` };
}
