"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  issueCertificate,
  issueCertificatesToEligible,
  markCourseCompleted,
  reopenCourseCompletion,
  revokeCertificate,
} from "@/server/courses/certificates";
import type { EdukanaRole } from "@/types/next-auth";

export type CertificateActionState = { ok: boolean; message: string };

type Actor = { id: string; institutionId: string; role: EdukanaRole };
const SESSION_ENDED = "Tu sesión terminó. Vuelve a iniciar sesión.";

// El permiso sobre el curso se comprueba en `src/server/courses/certificates.ts` con cada operación.
async function currentActor(): Promise<Actor | null> {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return null;
  return { id: user.id, institutionId: user.institutionId, role: user.role };
}

function failure(name: string, error: unknown): CertificateActionState {
  const correlationId = crypto.randomUUID();
  console.error(`${name} failed`, { correlationId, error });
  return { ok: false, message: `No se pudo completar. Intenta de nuevo. Código: ${correlationId}` };
}

function refresh(courseId: string) {
  revalidatePath(`/dashboard/aula/${courseId}/certificados`);
  revalidatePath(`/dashboard/aula/${courseId}/estudiantes`);
  revalidatePath(`/dashboard/aula/${courseId}`);
  revalidatePath("/dashboard/mis-certificados");
  revalidatePath("/dashboard/portal");
}

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "");

async function run(name: string, formData: FormData, work: (actor: Actor, courseId: string) => Promise<CertificateActionState>): Promise<CertificateActionState> {
  const actor = await currentActor();
  if (!actor) return { ok: false, message: SESSION_ENDED };
  const courseId = field(formData, "courseId");
  try {
    const result = await work(actor, courseId);
    if (result.ok) refresh(courseId);
    return result;
  } catch (error) {
    return failure(name, error);
  }
}

/** Da el curso por completado para un estudiante. Campos: `courseId`, `enrollmentId`. */
export async function markCourseCompletedAction(_state: CertificateActionState, formData: FormData): Promise<CertificateActionState> {
  return run("markCourseCompletedAction", formData, async (actor, courseId) => {
    const result = await markCourseCompleted(actor, courseId, field(formData, "enrollmentId"));
    return result.ok ? { ok: true, message: "Curso marcado como completado. Ya puedes emitir su certificado." } : result;
  });
}

/** Deshace el completado. Campos: `courseId`, `enrollmentId`. */
export async function reopenCourseCompletionAction(_state: CertificateActionState, formData: FormData): Promise<CertificateActionState> {
  return run("reopenCourseCompletionAction", formData, async (actor, courseId) => {
    const result = await reopenCourseCompletion(actor, courseId, field(formData, "enrollmentId"));
    return result.ok ? { ok: true, message: "Curso reabierto para este estudiante." } : result;
  });
}

/** Emite el certificado de un estudiante. Campos: `courseId`, `enrollmentId`. */
export async function issueCertificateAction(_state: CertificateActionState, formData: FormData): Promise<CertificateActionState> {
  return run("issueCertificateAction", formData, async (actor, courseId) => {
    const result = await issueCertificate(actor, courseId, field(formData, "enrollmentId"));
    if (!result.ok) return result;
    return { ok: true, message: result.issued ? "Certificado emitido. El estudiante ya puede verlo y compartirlo." : "Este estudiante ya tenía su certificado. No hubo cambios." };
  });
}

/** Emite a todos los que cumplen los requisitos. Campo: `courseId`. */
export async function issueCertificatesToEligibleAction(_state: CertificateActionState, formData: FormData): Promise<CertificateActionState> {
  return run("issueCertificatesToEligibleAction", formData, async (actor, courseId) => {
    const result = await issueCertificatesToEligible(actor, courseId);
    if (!result.ok) return result;
    if (!result.issued) return { ok: true, message: "No hubo cambios: nadie más cumple los requisitos por ahora." };
    return { ok: true, message: result.issued === 1 ? "Listo: se emitió 1 certificado." : `Listo: se emitieron ${result.issued} certificados.` };
  });
}

/** Anula un certificado. Campos: `courseId`, `enrollmentId`, `reason`. */
export async function revokeCertificateAction(_state: CertificateActionState, formData: FormData): Promise<CertificateActionState> {
  return run("revokeCertificateAction", formData, async (actor, courseId) => {
    const result = await revokeCertificate(actor, courseId, field(formData, "enrollmentId"), field(formData, "reason"));
    return result.ok ? { ok: true, message: "Certificado anulado. Su enlace público ya no verifica." } : result;
  });
}
