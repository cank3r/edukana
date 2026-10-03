import type { EdukanaRole } from "@/types/next-auth";

export type Capability =
  | "student.portal.view"
  | "course.view"
  | "course.view.all"
  | "course.manage"
  | "course.participate"
  | "course.roster.view"
  | "schedule.view"
  | "people.view"
  | "admissions.manage"
  | "announcement.publish"
  | "finance.manage"
  | "analytics.view"
  | "tenant.settings.manage";

const ROLE_CAPABILITIES: Record<EdukanaRole, ReadonlySet<Capability>> = {
  SUPER_ADMIN: new Set([
    "course.view",
    "course.view.all",
    "course.manage",
    "course.roster.view",
    "schedule.view",
    "people.view",
    "admissions.manage",
    "announcement.publish",
    "finance.manage",
    "analytics.view",
    "tenant.settings.manage",
  ]),
  ADMIN: new Set([
    "course.view",
    "course.view.all",
    "course.manage",
    "course.roster.view",
    "schedule.view",
    "people.view",
    "admissions.manage",
    "announcement.publish",
    "finance.manage",
    "analytics.view",
    "tenant.settings.manage",
  ]),
  COORDINATOR: new Set([
    "course.view",
    "course.view.all",
    "course.manage",
    "course.roster.view",
    "schedule.view",
    "people.view",
    "admissions.manage",
    "announcement.publish",
  ]),
  TEACHER: new Set(["course.view", "course.manage", "course.roster.view", "schedule.view"]),
  STUDENT: new Set(["student.portal.view", "course.view", "course.participate", "schedule.view"]),
  // PARENT remains deny-by-default until a persisted guardian-student relationship exists.
  PARENT: new Set(),
};

export function hasCapability(role: EdukanaRole, capability: Capability) {
  return ROLE_CAPABILITIES[role].has(capability);
}
