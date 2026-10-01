import { createHash, randomBytes } from "node:crypto";

export type WeightedCategory = {
  weight: number;
  dropLowest?: number;
  scores: Array<{ score: number | null; maxScore: number; itemWeight?: number; excused?: boolean }>;
};

export function calculateWeightedGrade(categories: WeightedCategory[]): number | null {
  const active = categories.filter((category) => category.weight > 0);
  let usedWeight = 0;
  let total = 0;
  for (const category of active) {
    const scored = category.scores
      .filter((item) => !item.excused && item.score !== null && item.maxScore > 0)
      .map((item) => ({ ...item, ratio: Math.max(0, Math.min(1, item.score! / item.maxScore)) }))
      .sort((a, b) => a.ratio - b.ratio)
      .slice(Math.max(0, category.dropLowest ?? 0));
    if (!scored.length) continue;
    const denominator = scored.reduce((sum, item) => sum + (item.itemWeight ?? 1), 0);
    const categoryRatio = scored.reduce((sum, item) => sum + item.ratio * (item.itemWeight ?? 1), 0) / denominator;
    total += categoryRatio * category.weight;
    usedWeight += category.weight;
  }
  return usedWeight ? Math.round((total / usedWeight) * 10000) / 100 : null;
}

export type ScheduleCandidate = {
  id?: string;
  teacherId: string;
  classroom: string;
  weekday: number;
  startMinutes: number;
  endMinutes: number;
};

export function findScheduleConflicts(candidate: ScheduleCandidate, existing: ScheduleCandidate[]) {
  if (candidate.weekday < 1 || candidate.weekday > 7 || candidate.startMinutes < 0 || candidate.endMinutes > 1440 || candidate.startMinutes >= candidate.endMinutes) {
    return [{ type: "INVALID" as const, slot: candidate }];
  }
  return existing
    .filter((slot) => slot.id !== candidate.id && slot.weekday === candidate.weekday && candidate.startMinutes < slot.endMinutes && slot.startMinutes < candidate.endMinutes)
    .flatMap((slot) => [
      ...(slot.teacherId === candidate.teacherId ? [{ type: "TEACHER" as const, slot }] : []),
      ...(slot.classroom.trim().toLowerCase() === candidate.classroom.trim().toLowerCase() ? [{ type: "CLASSROOM" as const, slot }] : []),
    ]);
}

export function normalizeAnswer(value: string) {
  return value.trim().toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

export function autoScoreAnswer(type: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER", response: string, answerKey: string, points: number) {
  if (type === "SHORT_ANSWER") return { score: null, isCorrect: null };
  const isCorrect = normalizeAnswer(response) === normalizeAnswer(answerKey);
  return { score: isCorrect ? points : 0, isCorrect };
}

export function progressPercentage(completed: number, total: number) {
  if (total <= 0) return 0;
  return Math.round(Math.max(0, Math.min(1, completed / total)) * 10000) / 100;
}

export function createCertificateIdentity(enrollmentId: string, courseId: string, secret: string) {
  const code = `EDU-${randomBytes(6).toString("hex").toUpperCase()}`;
  const verificationHash = createHash("sha256").update(`${code}:${enrollmentId}:${courseId}:${secret}`).digest("hex");
  return { code, verificationHash };
}

export function verifyCertificateIdentity(code: string, enrollmentId: string, courseId: string, secret: string, expectedHash: string) {
  return createHash("sha256").update(`${code}:${enrollmentId}:${courseId}:${secret}`).digest("hex") === expectedHash;
}

const DOCUMENT_MIMES = new Set(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain"]);
const VIDEO_MIMES = new Set(["video/mp4", "video/webm"]);

export function validateUpload(file: { name: string; type: string; size: number }, kind: "DOCUMENT" | "VIDEO") {
  const max = kind === "VIDEO" ? 100 * 1024 * 1024 : 20 * 1024 * 1024;
  const allowed = kind === "VIDEO" ? VIDEO_MIMES : DOCUMENT_MIMES;
  if (!file.name || file.name.length > 180) return "Nombre de archivo inválido.";
  if (!allowed.has(file.type)) return `Formato ${file.type || "desconocido"} no permitido.`;
  if (file.size <= 0 || file.size > max) return `El archivo excede el límite de ${kind === "VIDEO" ? "100 MB" : "20 MB"}.`;
  return null;
}

export function safeObjectName(name: string) {
  return name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "archivo";
}
