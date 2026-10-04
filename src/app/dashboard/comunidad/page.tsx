import type { Prisma } from "@prisma/client";
import Image from "next/image";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { getCommunityAnnouncementWhere } from "@/lib/announcement-data";
import { announcementAudienceLabel, canOpenRelatedCourse, canSeeAnnouncementAudienceDetails, canTargetAnnouncementPeople, safeAnnouncementHref } from "@/lib/announcements";
import { courseWhereForScope, resolveCourseReadScope, resolveCourseWriteScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import { roleLabel } from "@/lib/ux";
import { AnnouncementComposer } from "@/components/dashboard/AnnouncementComposer";
import { AnnouncementContent } from "@/components/dashboard/AnnouncementContent";
import { Calendar, ExternalLink, Megaphone, Pin } from "lucide-react";

const announcementSelect = {
  id: true,
  authorId: true,
  title: true,
  content: true,
  externalUrl: true,
  audienceInstitution: true,
  audience: true,
  isPinned: true,
  publishedAt: true,
  author: { select: { name: true, role: true } },
  mentions: { select: { userId: true } },
  assets: { where: { confirmedAt: { not: null } }, select: { id: true, originalName: true, mimeType: true } },
} satisfies Prisma.AnnouncementSelect;
const audienceDetailsSelect = {
  id: true,
  roleTargets: { select: { role: true } },
  courseTargets: { select: { course: { select: { name: true } } } },
  userTargets: { select: { user: { select: { name: true } } } },
  unitTargets: { select: { unit: { select: { name: true } } } },
} satisfies Prisma.AnnouncementSelect;
type AnnouncementBase = Prisma.AnnouncementGetPayload<{ select: typeof announcementSelect }>;
type AudienceDetails = Prisma.AnnouncementGetPayload<{ select: typeof audienceDetailsSelect }>;
type RelatedCourseData = { course: { id: string; name: string; code: string | null; description: string | null } };
type AnnouncementCardData = AnnouncementBase & { audienceDetails?: AudienceDetails; relatedCourses: RelatedCourseData[] };

export default async function ComunidadPage() {
  const session = await auth();
  const user = session!.user;
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  const canManage = capabilities.has("announcement.manage");
  const canPublish = capabilities.has("announcement.publish");
  const canTargetPeople = canTargetAnnouncementPeople(capabilities);
  const where = await getCommunityAnnouncementWhere(user, { canManage, canPublish });
  const courseWhere = canPublish ? courseWhereForScope(user.institutionId, resolveCourseWriteScope(user, capabilities)) : null;
  const readableCourseWhere = courseWhereForScope(user.institutionId, resolveCourseReadScope(user, capabilities));
  const [announcementRows, courses, people, units] = await Promise.all([
    db.announcement.findMany({ where, select: announcementSelect, orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }], take: 50 }),
    courseWhere ? db.course.findMany({ where: courseWhere, select: { id: true, name: true, code: true }, orderBy: { name: "asc" }, take: 500 }) : [],
    canTargetPeople ? db.user.findMany({ where: { institutionId: user.institutionId, status: "ACTIVE" }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" }, take: 1000 }) : [],
    canPublish ? db.organizationalUnit.findMany({ where: { institutionId: user.institutionId }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }) : [],
  ]);
  const announcementIds = announcementRows.map((announcement) => announcement.id);
  const detailIds = announcementRows
    .filter((announcement) => canSeeAnnouncementAudienceDetails({ id: user.id, canManage }, announcement.authorId))
    .map((announcement) => announcement.id);
  const [details, relatedRows] = await Promise.all([
    detailIds.length ? db.announcement.findMany({
      where: { institutionId: user.institutionId, id: { in: detailIds } },
      select: audienceDetailsSelect,
    }) : [],
    announcementIds.length ? db.announcementRelatedCourse.findMany({
      where: { institutionId: user.institutionId, announcementId: { in: announcementIds }, course: { institutionId: user.institutionId } },
      select: { announcementId: true, course: { select: { id: true, name: true, code: true, description: true } } },
    }) : [],
  ]);
  const relatedCourseIds = [...new Set(relatedRows.map((row) => row.course.id))];
  const readableCourses = readableCourseWhere && relatedCourseIds.length ? await db.course.findMany({
    where: { id: { in: relatedCourseIds }, ...readableCourseWhere },
    select: { id: true },
  }) : [];
  const readableCourseIds = new Set(readableCourses.map((course) => course.id));
  const detailMap = new Map(details.map((detail) => [detail.id, detail]));
  const relatedMap = new Map<string, RelatedCourseData[]>();
  for (const row of relatedRows) {
    const values = relatedMap.get(row.announcementId) ?? [];
    values.push({ course: row.course });
    relatedMap.set(row.announcementId, values);
  }
  const announcements: AnnouncementCardData[] = announcementRows.map((announcement) => ({ ...announcement, audienceDetails: detailMap.get(announcement.id), relatedCourses: relatedMap.get(announcement.id) ?? [] }));

  return <div className="mx-auto max-w-5xl p-4 sm:p-8">
    <header className="mb-8"><h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Comunidad</h1><p className="mt-1 text-sm text-slate-500">Anuncios y comunicados institucionales</p></header>
    {canPublish && <details className="mb-6"><summary className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-semibold text-white">Crear anuncio</summary><div className="mt-3"><AnnouncementComposer canTargetPeople={canTargetPeople} courses={courses.map((course) => ({ id: course.id, name: course.name, detail: course.code ?? undefined }))} people={people.map((person) => ({ id: person.id, name: person.name, detail: roleLabel(person.role) }))} units={units} /></div></details>}
    <div className="space-y-4">{announcements.map((announcement) => <AnnouncementCard announcement={announcement} key={announcement.id} readableCourseIds={readableCourseIds} viewerRole={user.role} />)}{announcements.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center"><Megaphone className="mx-auto mb-3 text-slate-300" size={40} /><p className="font-semibold">Sin anuncios disponibles</p><p className="mt-1 text-sm text-slate-500">Los comunicados para tu audiencia aparecerán aquí.</p></div>}</div>
  </div>;
}

export function AnnouncementCard({ announcement, readableCourseIds, viewerRole }: { announcement: AnnouncementCardData; readableCourseIds: ReadonlySet<string>; viewerRole: "SUPER_ADMIN" | "ADMIN" | "COORDINATOR" | "TEACHER" | "STUDENT" | "PARENT" }) {
  const safeUrl = announcement.externalUrl ? safeAnnouncementHref(announcement.externalUrl) : null;
  const details = announcement.audienceDetails;
  const detailedLabels = details ? [
    ...(announcement.audienceInstitution ? ["Toda la institución"] : []),
    ...details.roleTargets.map((target) => target.role),
    ...details.courseTargets.map((target) => target.course.name),
    ...details.userTargets.map((target) => target.user.name),
    ...details.unitTargets.map((target) => target.unit.name),
  ] : [];
  const legacyLabel = { ALL: "Toda la comunidad", COURSE: "Curso", ROLE: "Rol específico" }[announcement.audience];
  const audience = announcementAudienceLabel(detailedLabels.length ? detailedLabels : [legacyLabel], Boolean(details));
  return <article className={`rounded-2xl border p-5 sm:p-6 ${announcement.isPinned ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}>
    <div className="mb-3 flex items-start justify-between gap-3"><h2 className="text-lg font-bold" style={{ color: "var(--navy)" }}>{announcement.title}</h2>{announcement.isPinned && <Pin aria-label="Anuncio fijado" className="shrink-0 text-red-500" size={16} />}</div>
    <AnnouncementContent content={announcement.content} mentionIds={new Set(announcement.mentions.map((mention) => mention.userId))} />
    {announcement.assets.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-2">{announcement.assets.map((asset) => asset.mimeType.startsWith("image/") ? <Image alt={asset.originalName} className="h-56 w-full rounded-xl object-cover" height={448} key={asset.id} src={`/api/assets/${asset.id}`} unoptimized width={800} /> : <video aria-label={asset.originalName} className="h-56 w-full rounded-xl bg-black object-contain" controls key={asset.id} preload="metadata" src={`/api/assets/${asset.id}`} />)}</div>}
    {announcement.relatedCourses.length > 0 && <section aria-label="Cursos relacionados" className="mt-4 grid gap-3 sm:grid-cols-2">{announcement.relatedCourses.map(({ course }) => canOpenRelatedCourse(viewerRole, readableCourseIds, course.id) ? <Link className="rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-300" href={`/dashboard/aula/${course.id}`} key={course.id}><RelatedCourseCard course={course} /></Link> : <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={course.id}><RelatedCourseCard course={course} /><p className="mt-2 text-xs text-slate-500">Vista informativa; no tienes acceso directo a este curso.</p></div>)}</section>}
    {safeUrl && <a className="mt-4 inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700" href={safeUrl} rel="noopener noreferrer" target={safeUrl.startsWith("https:") ? "_blank" : undefined}>Abrir enlace <ExternalLink aria-hidden="true" size={15} /></a>}
    <footer className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-3 text-xs text-slate-500"><Calendar aria-hidden="true" size={12} /><span>{new Intl.DateTimeFormat("es", { dateStyle: "long" }).format(announcement.publishedAt)}</span><span>·</span><span>{announcement.author.name}</span><span>·</span><span className="break-words">{audience}</span></footer>
  </article>;
}


function RelatedCourseCard({ course }: { course: RelatedCourseData["course"] }) {
  return <><p className="font-bold text-slate-900">{course.name}</p><p className="text-xs text-slate-500">{course.code ?? "Sin código"}</p>{course.description && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{course.description}</p>}</>;
}
