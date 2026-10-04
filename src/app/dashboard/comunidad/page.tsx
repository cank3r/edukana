import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { AnnouncementForm } from "@/components/dashboard/MutationForms";
import { Calendar, Megaphone, Pin } from "lucide-react";

type AnnouncementWithAuthor = Prisma.AnnouncementGetPayload<{ include: { author: { select: { name: true; role: true } } } }>;

export default async function ComunidadPage() {
  const session = await auth();
  const user = session!.user;
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  const canPublish = capabilities.has("announcement.publish");
  const parentLinks = user.role === "PARENT" && capabilities.has("child.portal.view") && capabilities.has("child.announcements.view")
    ? await db.guardianship.findMany({
        where: { institutionId: user.institutionId, parentId: user.id, status: "ACTIVE", canViewAnnouncements: true, parent: { institutionId: user.institutionId, role: "PARENT", status: "ACTIVE" }, student: { institutionId: user.institutionId, role: "STUDENT", status: "ACTIVE" } },
        select: { student: { select: { enrollments: { where: { status: { in: ["ACTIVE", "COMPLETED"] }, course: { institutionId: user.institutionId } }, select: { courseId: true } } } } },
      })
    : [];
  const courseIds = user.role === "STUDENT"
    ? (await db.enrollment.findMany({ where: { studentId: user.id, status: "ACTIVE", course: { institutionId: user.institutionId } }, select: { courseId: true } })).map((item) => item.courseId)
    : parentLinks.flatMap((link) => link.student.enrollments.map((item) => item.courseId));
  const where: Prisma.AnnouncementWhereInput = canPublish
    ? { institutionId: user.institutionId }
    : user.role === "PARENT" && parentLinks.length === 0
      ? { institutionId: user.institutionId, id: "__restricted__" }
      : {
          institutionId: user.institutionId,
          OR: [
            { audience: "ALL" },
            { audience: "ROLE", audienceId: user.role },
            ...(courseIds.length ? [{ audience: "COURSE" as const, audienceId: { in: courseIds } }] : []),
          ],
        };
  const announcements = await db.announcement.findMany({
    where,
    include: { author: { select: { name: true, role: true } } },
    orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
    take: 50,
  });

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8"><div className="mb-8"><h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Comunidad</h1><p className="mt-1 text-sm text-slate-500">Anuncios y comunicados institucionales</p></div>
      {canPublish && <details className="mb-6"><summary className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-semibold text-white">Nuevo anuncio</summary><div className="mt-3"><AnnouncementForm /></div></details>}
      <div className="space-y-3">{announcements.map((announcement) => <AnnouncementCard key={announcement.id} announcement={announcement} />)}{announcements.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center"><Megaphone size={40} className="mx-auto mb-3 text-slate-300" /><p className="font-semibold">Sin anuncios disponibles</p><p className="mt-1 text-sm text-slate-500">Los comunicados para tu audiencia aparecerán aquí.</p></div>}</div>
    </div>
  );
}

function AnnouncementCard({ announcement }: { announcement: AnnouncementWithAuthor }) {
  const audience = { ALL: "Toda la comunidad", COURSE: "Curso", ROLE: "Rol específico" }[announcement.audience];
  return <article className={`rounded-2xl border p-5 ${announcement.isPinned ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}><div className="mb-2 flex items-start justify-between gap-3"><h2 className="font-semibold" style={{ color: "var(--navy)" }}>{announcement.title}</h2>{announcement.isPinned && <Pin size={16} className="shrink-0 text-red-500" />}</div><p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{announcement.content}</p><div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400"><Calendar size={12} /><span>{new Intl.DateTimeFormat("es", { dateStyle: "long" }).format(announcement.publishedAt)}</span><span>·</span><span>{announcement.author.name}</span><span>·</span><span>{audience}</span></div></article>;
}
