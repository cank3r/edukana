"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { deleteAttendanceSession, saveAttendance, type AttendanceCounts, type AttendanceEntry } from "@/server/courses/attendance";
import type { EdukanaRole } from "@/types/next-auth";

export type AttendanceState = { ok: boolean; message: string };

type Actor = { id: string; institutionId: string; role: EdukanaRole };
const SESSION_ENDED = "Tu sesión terminó. Vuelve a iniciar sesión.";

// El permiso sobre el curso se comprueba en `src/server/courses/attendance.ts` con cada operación.
async function currentActor(): Promise<Actor | null> {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return null;
  return { id: user.id, institutionId: user.institutionId, role: user.role };
}

function failure(name: string, error: unknown): AttendanceState {
  const correlationId = crypto.randomUUID();
  console.error(`${name} failed`, { correlationId, error });
  return { ok: false, message: `No se pudo completar. Intenta de nuevo. Código: ${correlationId}` };
}

function refresh(courseId: string) {
  revalidatePath(`/dashboard/aula/${courseId}/asistencia`);
  revalidatePath(`/dashboard/aula/${courseId}`);
}

function summary(counts: AttendanceCounts) {
  const parts = [
    `${counts.present} ${counts.present === 1 ? "presente" : "presentes"}`,
    counts.absent ? `${counts.absent} ${counts.absent === 1 ? "ausente" : "ausentes"}` : "",
    counts.late ? `${counts.late} ${counts.late === 1 ? "tarde" : "tardes"}` : "",
    counts.excused ? `${counts.excused} ${counts.excused === 1 ? "justificado" : "justificados"}` : "",
  ];
  return parts.filter(Boolean).join(" · ");
}

function parseEntries(raw: string): AttendanceEntry[] {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.map((item) => ({
      studentId: String((item as AttendanceEntry)?.studentId ?? ""),
      status: String((item as AttendanceEntry)?.status ?? ""),
      note: String((item as AttendanceEntry)?.note ?? ""),
    }));
  } catch {
    return [];
  }
}

/** Guarda o corrige la asistencia de un día. Campos: `courseId`, `date`, `title`, `entries` (lista en JSON). */
export async function saveAttendanceAction(_state: AttendanceState, formData: FormData): Promise<AttendanceState> {
  const actor = await currentActor();
  if (!actor) return { ok: false, message: SESSION_ENDED };
  const courseId = String(formData.get("courseId") ?? "");
  try {
    const result = await saveAttendance(actor, courseId, {
      date: String(formData.get("date") ?? ""),
      title: String(formData.get("title") ?? ""),
      entries: parseEntries(String(formData.get("entries") ?? "")),
    });
    if (!result.ok) return result;
    refresh(courseId);
    return { ok: true, message: `${result.created ? "Asistencia guardada" : "Asistencia corregida"}: ${summary(result.counts)}.` };
  } catch (error) {
    return failure("saveAttendanceAction", error);
  }
}

/** Borra la asistencia de un día. Campos: `courseId`, `sessionId`. */
export async function deleteAttendanceSessionAction(_state: AttendanceState, formData: FormData): Promise<AttendanceState> {
  const actor = await currentActor();
  if (!actor) return { ok: false, message: SESSION_ENDED };
  const courseId = String(formData.get("courseId") ?? "");
  try {
    const result = await deleteAttendanceSession(actor, courseId, String(formData.get("sessionId") ?? ""));
    if (!result.ok) return result;
    refresh(courseId);
    return { ok: true, message: "Asistencia de ese día borrada." };
  } catch (error) {
    return failure("deleteAttendanceSessionAction", error);
  }
}
