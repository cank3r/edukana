import type { Capability } from "@/lib/capabilities";

export type GuardianArea = "academics" | "attendance" | "schedule" | "announcements" | "finance";
export type GuardianStatus = "PENDING" | "ACTIVE" | "REVOKED";
export type GuardianFlag = "canViewAcademics" | "canViewAttendance" | "canViewSchedule" | "canViewAnnouncements" | "canViewFinance";
export type GuardianFlagValues = Record<GuardianFlag, boolean>;
export type GuardianFlagChange = { flag: string; enabled: boolean };
export type GuardianLink = {
  id: string;
  institutionId: string;
  parentId: string;
  studentId: string;
  status: GuardianStatus;
} & GuardianFlagValues;

export const GUARDIAN_FLAG_CAPABILITY = {
  canViewAcademics: "child.academics.view",
  canViewAttendance: "child.attendance.view",
  canViewSchedule: "child.schedule.view",
  canViewAnnouncements: "child.announcements.view",
  canViewFinance: "child.finance.view",
} as const satisfies Record<GuardianFlag, Capability>;
export const GUARDIAN_FLAGS = Object.freeze(Object.keys(GUARDIAN_FLAG_CAPABILITY) as GuardianFlag[]);

const AREA_FLAG: Record<GuardianArea, GuardianFlag> = {
  academics: "canViewAcademics",
  attendance: "canViewAttendance",
  schedule: "canViewSchedule",
  announcements: "canViewAnnouncements",
  finance: "canViewFinance",
};

export class GuardianFlagPolicyError extends Error {}

export function isGuardianFlag(value: string): value is GuardianFlag {
  return Object.hasOwn(GUARDIAN_FLAG_CAPABILITY, value);
}

export function assertGuardianFlagsWithinAuthority(flags: GuardianFlagValues, capabilities: ReadonlySet<Capability>): void {
  for (const flag of GUARDIAN_FLAGS) {
    if (flags[flag] && !capabilities.has(GUARDIAN_FLAG_CAPABILITY[flag])) {
      throw new GuardianFlagPolicyError("No puedes autorizar un área cuya capacidad no posees.");
    }
  }
}

export function applyGuardianFlagChanges(
  current: GuardianFlagValues,
  changes: readonly GuardianFlagChange[],
  capabilities: ReadonlySet<Capability>,
): GuardianFlagValues {
  const next = { ...current };
  const seen = new Set<string>();
  for (const change of changes) {
    if (!isGuardianFlag(change.flag)) throw new GuardianFlagPolicyError("La solicitud contiene una bandera desconocida.");
    if (seen.has(change.flag)) throw new GuardianFlagPolicyError("La solicitud contiene cambios duplicados.");
    seen.add(change.flag);
    if (!capabilities.has(GUARDIAN_FLAG_CAPABILITY[change.flag])) {
      throw new GuardianFlagPolicyError("No puedes conceder ni revocar un área cuya capacidad no posees.");
    }
    next[change.flag] = change.enabled;
  }
  return next;
}

export function canTransitionGuardianship(status: GuardianStatus, operation: "update" | "activate" | "revoke"): boolean {
  if (operation === "activate") return status === "PENDING";
  if (operation === "revoke") return status === "PENDING" || status === "ACTIVE";
  return status === "PENDING" || status === "ACTIVE";
}

export function selectActiveGuardianLink(
  links: readonly GuardianLink[],
  identity: { institutionId: string; parentId: string },
  studentId: string,
): GuardianLink | null {
  return links.find((link) =>
    link.institutionId === identity.institutionId
    && link.parentId === identity.parentId
    && link.studentId === studentId
    && link.status === "ACTIVE"
  ) ?? null;
}

export function canViewGuardianArea(link: GuardianLink | null, capabilities: ReadonlySet<Capability>, area: GuardianArea): boolean {
  const flag = AREA_FLAG[area];
  return Boolean(link && link.status === "ACTIVE" && capabilities.has("child.portal.view") && capabilities.has(GUARDIAN_FLAG_CAPABILITY[flag]) && link[flag]);
}
