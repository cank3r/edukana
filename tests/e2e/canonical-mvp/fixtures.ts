/** Public, fictitious identities: only the guarded disposable local harness may use these. */
export const PASSWORD = "CanonicalPilot2026!";
export const BASE_URL = "http://127.0.0.1:3160";
export type PilotUser = { name: string; email: string; institutionName?: string };
export const USERS = {
  admin: { name: "Administración Canónica", email: "admin@canonical.example.test" },
  teacher: { name: "Docente Canónica", email: "teacher@canonical.example.test" },
  student: { name: "Estudiante Canónica", email: "student@canonical.example.test" },
  parent: { name: "Tutor Canónico", email: "parent@canonical.example.test" },
} satisfies Record<string, PilotUser>;
export const NAMES = {
  institution: "Instituto Canónico", slug: "canonical-pilot", period: "Período Canónico",
  unit: "Departamento Canónico", course: "Curso Canónico", courseCode: "CAN-101",
  chapter: "Fundamentos Canónicos", lesson: "Actividad Canónica", assignment: "Entrega Canónica",
  announcement: "Aviso Canónico del Curso", image: "aviso-canonico.png",
  submission: "Mi reflexión canónica persiste después de cerrar la sesión.",
  feedback: "Trabajo correcto; la evidencia persiste para estudiante y tutor.",
};
export const IMAGE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nH0AAAAASUVORK5CYII=", "base64",
);
export function day(offset = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
export type PilotManifest = {
  version: 1; completedBlocks: number[]; names: typeof NAMES; users: typeof USERS;
  courseId: string; chapterId: string; lessonId: string; assignmentId: string; gradeItemId: string;
  teacherId: string; studentId: string; parentId: string; guardianId: string; enrollmentId: string;
  submissionId: string; announcementId: string; assetId: string; periodId: string; unitId: string;
  attendanceDate: string;
};
export function emptyManifest(): PilotManifest {
  return {
    version: 1, completedBlocks: [], names: NAMES, users: USERS, attendanceDate: day(),
    courseId: "", chapterId: "", lessonId: "", assignmentId: "", gradeItemId: "", teacherId: "", studentId: "",
    parentId: "", guardianId: "", enrollmentId: "", submissionId: "", announcementId: "", assetId: "",
    periodId: "", unitId: "",
  };
}
