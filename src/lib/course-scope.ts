import type { Prisma } from "@prisma/client";
import type { Capability } from "@/lib/capabilities";
import type { EdukanaRole } from "@/types/next-auth";

export type CourseScope =
  | { kind: "all" }
  | { kind: "teacher"; teacherId: string }
  | { kind: "student"; studentId: string }
  | { kind: "none" };

type CourseActor = { id: string; role: EdukanaRole };

export function resolveCourseReadScope(actor: CourseActor, capabilities: ReadonlySet<Capability>): CourseScope {
  if (!capabilities.has("course.view") || actor.role === "PARENT") return { kind: "none" };
  if (actor.role === "STUDENT") return { kind: "student", studentId: actor.id };
  if (capabilities.has("course.view.all")) return { kind: "all" };
  if (actor.role === "TEACHER") return { kind: "teacher", teacherId: actor.id };
  return { kind: "none" };
}

export function resolveCourseWriteScope(actor: CourseActor, capabilities: ReadonlySet<Capability>): CourseScope {
  if (!capabilities.has("course.view") || !capabilities.has("course.manage") || actor.role === "STUDENT" || actor.role === "PARENT") return { kind: "none" };
  if (actor.role === "TEACHER") return { kind: "teacher", teacherId: actor.id };
  if (capabilities.has("course.view.all")) return { kind: "all" };
  return { kind: "none" };
}

export function courseWhereForScope(institutionId: string, scope: CourseScope): Prisma.CourseWhereInput | null {
  if (!institutionId || scope.kind === "none") return null;
  if (scope.kind === "all") return { institutionId };
  if (scope.kind === "teacher") return { institutionId, teacherId: scope.teacherId };
  return {
    institutionId,
    enrollments: { some: { studentId: scope.studentId, status: { in: ["ACTIVE", "COMPLETED"] } } },
  };
}

export function courseWhereForParticipation(institutionId: string, actor: CourseActor, capabilities: ReadonlySet<Capability>): Prisma.CourseWhereInput | null {
  if (!institutionId || actor.role !== "STUDENT" || !capabilities.has("course.participate")) return null;
  return { institutionId, enrollments: { some: { studentId: actor.id, status: "ACTIVE" } } };
}

export function canManageCourse(scope: CourseScope, teacherId: string): boolean {
  return scope.kind === "all" || (scope.kind === "teacher" && scope.teacherId === teacherId);
}
