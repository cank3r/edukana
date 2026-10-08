import type { DefaultSession } from "next-auth";

export type EdukanaRole = "SUPER_ADMIN" | "ADMIN" | "COORDINATOR" | "TEACHER" | "STUDENT" | "PARENT";

declare module "next-auth" {
  interface User {
    role: EdukanaRole;
    institutionId: string;
    institutionSlug: string;
    sessionVersion: number;
    identityId: string | null;
    institutionCount: number;
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: EdukanaRole;
      institutionId: string;
      institutionSlug: string;
      sessionVersion: number;
      identityId: string | null;
      institutionCount: number;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: EdukanaRole;
    institutionId: string;
    institutionSlug: string;
  }
}
