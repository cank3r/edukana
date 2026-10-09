import type { Prisma } from "@prisma/client";
import type { Capability } from "@/lib/capabilities";
import { courseWhereForScope, resolveCourseReadScope } from "@/lib/course-scope";
import { getCommunityAnnouncementWhere } from "@/lib/announcement-data";
import { db } from "@/lib/db";
import { STALE_SUBMISSION_DAYS } from "@/server/admin-home";
import { safeTimezone } from "@/server/student-home";
import type { EdukanaRole } from "@/types/next-auth";

export type CoordinatorActor = { id: string; institutionId: string; role: EdukanaRole };

type CourseRef = { courseId: string; name: string; code: string | null; teacherName: string };

/** Curso con entregas que llevan más de `STALE_SUBMISSION_DAYS` días esperando nota. */
export type LateGradingCourse = CourseRef & { waiting: number };
/** Curso que todavía no funciona para sus estudiantes. */
export type CourseGap = CourseRef & { noStudents: boolean; noContent: boolean };
/** Docente con entregas por calificar en sus cursos. */
export type TeacherLoad = { teacherId: string; name: string; waiting: number; courses: number };
export type RecentAnnouncement = { id: string; title: string; publishedAt: Date; authorName: string };

export type CoordinatorHome = {
  institutionName: string;
  timezone: string;
  courseCount: number;
  lateGrading: LateGradingCourse[];
  gaps: CourseGap[];
  teachers: TeacherLoad[];
  announcements: RecentAnnouncement[];
};

/** Cuántos docentes y avisos muestra el inicio; el resto se ve en sus pantallas. */
export const COORDINATOR_TOP_TEACHERS = 5;
export const COORDINATOR_RECENT_ANNOUNCEMENTS = 3;

/**
 * Inicio de quien coordina: qué cursos necesitan atención, qué docentes tienen más pendientes
 * y los avisos recientes. Solo cursos no archivados que su permiso le deja ver, todo dentro de su institución.
 */
export async function getCoordinatorHome(actor: CoordinatorActor, capabilities: ReadonlySet<Capability>, now = new Date()): Promise<CoordinatorHome> {
  const scoped = courseWhereForScope(actor.institutionId, resolveCourseReadScope(actor, capabilities));
  const staleBefore = new Date(now.getTime() - STALE_SUBMISSION_DAYS * 24 * 60 * 60_000);
  const announcementWhere = await getCommunityAnnouncementWhere(actor, {
    canManage: capabilities.has("announcement.manage"),
    canPublish: capabilities.has("announcement.publish"),
  });

  const courseFilter: Prisma.CourseWhereInput | null = scoped ? { ...scoped, institutionId: actor.institutionId, archivedAt: null } : null;
  const waitingWhere = { status: "SUBMITTED" } satisfies Prisma.SubmissionWhereInput;
  const staleWhere = { status: "SUBMITTED", submittedAt: { lt: staleBefore } } satisfies Prisma.SubmissionWhereInput;

  const [institution, courseRows, waitingRows, staleRows, announcementRows] = await Promise.all([
    db.institution.findUnique({ where: { id: actor.institutionId }, select: { name: true, timezone: true } }),
    courseFilter
      ? db.course.findMany({
          where: courseFilter,
          orderBy: [{ name: "asc" }, { id: "asc" }],
          select: {
            id: true,
            name: true,
            code: true,
            teacher: { select: { id: true, name: true } },
            _count: {
              select: {
                enrollments: { where: { status: "ACTIVE" } },
                // Lo que un estudiante ve: lección publicada dentro de un capítulo publicado.
                lessons: { where: { isPublished: true, section: { isPublished: true } } },
              },
            },
          },
        })
      : [],
    courseFilter
      ? db.assignment.findMany({
          where: { course: courseFilter, submissions: { some: waitingWhere } },
          select: { courseId: true, _count: { select: { submissions: { where: waitingWhere } } } },
        })
      : [],
    courseFilter
      ? db.assignment.findMany({
          where: { course: courseFilter, submissions: { some: staleWhere } },
          select: { courseId: true, _count: { select: { submissions: { where: staleWhere } } } },
        })
      : [],
    db.announcement.findMany({
      where: { AND: [announcementWhere, { institutionId: actor.institutionId }] },
      orderBy: { publishedAt: "desc" },
      take: COORDINATOR_RECENT_ANNOUNCEMENTS,
      select: { id: true, title: true, publishedAt: true, author: { select: { name: true } } },
    }),
  ]);

  const byCourse = new Map(courseRows.map((row) => [row.id, row]));
  const ref = (row: (typeof courseRows)[number]): CourseRef => ({ courseId: row.id, name: row.name, code: row.code, teacherName: row.teacher.name });
  const sum = (rows: Array<{ courseId: string; _count: { submissions: number } }>) => {
    const totals = new Map<string, number>();
    for (const row of rows) if (byCourse.has(row.courseId)) totals.set(row.courseId, (totals.get(row.courseId) ?? 0) + row._count.submissions);
    return totals;
  };

  const stale = sum(staleRows);
  const lateGrading = [...stale.entries()]
    .map(([courseId, waiting]) => ({ ...ref(byCourse.get(courseId)!), waiting }))
    .sort((a, b) => b.waiting - a.waiting || a.name.localeCompare(b.name, "es"));

  const gaps = courseRows
    .filter((row) => row._count.enrollments === 0 || row._count.lessons === 0)
    .map((row) => ({ ...ref(row), noStudents: row._count.enrollments === 0, noContent: row._count.lessons === 0 }));

  const loads = new Map<string, TeacherLoad>();
  for (const [courseId, waiting] of sum(waitingRows)) {
    const teacher = byCourse.get(courseId)!.teacher;
    const load = loads.get(teacher.id) ?? { teacherId: teacher.id, name: teacher.name, waiting: 0, courses: 0 };
    load.waiting += waiting;
    load.courses += 1;
    loads.set(teacher.id, load);
  }
  const teachers = [...loads.values()]
    .sort((a, b) => b.waiting - a.waiting || a.name.localeCompare(b.name, "es"))
    .slice(0, COORDINATOR_TOP_TEACHERS);

  return {
    institutionName: institution?.name ?? "",
    timezone: safeTimezone(institution?.timezone),
    courseCount: courseRows.length,
    lateGrading,
    gaps,
    teachers,
    announcements: announcementRows.map((row) => ({ id: row.id, title: row.title, publishedAt: row.publishedAt, authorName: row.author.name })),
  };
}
