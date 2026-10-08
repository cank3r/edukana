import type { DefaultSession } from "next-auth";

export type EdukanaRole = "SUPER_ADMIN" | "ADMIN" | "COORDINATOR" | "TEACHER" | "STUDENT" | "PARENT";

declare module "next-auth" {
  interface User {
    role: EdukanaRole;
    institutionId: string;
    institutionSlug: string;
    sessionVersion: number;
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: EdukanaRole;
      institutionId: string;
      institutionSlug: string;
      sessionVersion: number;
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
