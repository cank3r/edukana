import Link from "next/link";
import { notFound } from "next/navigation";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { getOperatorPublicCourses } from "@/server/platform/independent-report";
import { getInstitutionFeatures } from "@/server/platform/features";

export async function PublicCoursesSection({ institutionId }: { institutionId: string }) {
  const courses = await getOperatorPublicCourses(await getOperatorEmail(), institutionId);
  if (!courses) notFound();
  const features = await getInstitutionFeatures(institutionId);
  return <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
    <h2 className="text-lg font-semibold" style={{ color: "var(--navy)" }}>Cursos públicos</h2>
    {!features.catalog && <p className="text-sm text-amber-800">El catálogo está desactivado; los enlaces no están disponibles al público.</p>}
    {courses.length === 0 ? <p className="text-sm text-slate-600">Todavía no hay cursos públicos publicados.</p> :
      <ul>{courses.map((course) => <li key={course.id}><Link className="inline-flex min-h-11 items-center text-blue-700 underline"
        href={`/catalogo/${course.institution.slug}/${course.id}`}>{course.name}</Link></li>)}</ul>}
  </section>;
}
