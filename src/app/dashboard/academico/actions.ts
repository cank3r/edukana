"use server";

import { auth } from "@/lib/auth";
import { type Capability } from "@/lib/capabilities";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { courseWhereForScope, resolveCourseWriteScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import { findScheduleConflicts } from "@/lib/lms";
import type { EdukanaRole } from "@/types/next-auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/app/dashboard/actions";

// Solo queda el horario semanal que usa la portada del curso («Más herramientas › Horario»).
// El resto de acciones académicas viven en `src/server/actions/*`.

type SessionUser = { id: string; institutionId: string; role: EdukanaRole; capabilities: ReadonlySet<Capability> };
const failed = (message = "No se pudo completar la operación."): ActionState => ({ ok: false, message });
const success = (message: string): ActionState => ({ ok: true, message });
const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

async function requireUser(capability?: Capability): Promise<SessionUser> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.institutionId) throw new Error("No autorizado");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (capability && !capabilities.has(capability)) throw new Error("Permisos insuficientes");
  return { id: user.id, institutionId: user.institutionId, role: user.role, capabilities };
}

function managementCourseWhere(user: SessionUser) {
  return courseWhereForScope(user.institutionId, resolveCourseWriteScope(user, user.capabilities))
    ?? { institutionId: user.institutionId, id: "__restricted__" };
}

async function manageableCourse(user: SessionUser, courseId: string) {
  return db.course.findFirst({
    where: { id: courseId, ...managementCourseWhere(user) },
    select: { id: true, periodId: true, teacherId: true, completionThreshold: true },
  });
}

export async function saveScheduleSlot(_state: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("course.manage");
    const parsed = z.object({ courseId: z.string().min(1), weekday: z.coerce.number().int().min(1).max(7), startMinutes: z.coerce.number().int().min(0).max(1439), endMinutes: z.coerce.number().int().min(1).max(1440), classroom: z.string().min(1).max(100) }).safeParse({ courseId: text(fd, "courseId"), weekday: text(fd, "weekday"), startMinutes: text(fd, "startMinutes"), endMinutes: text(fd, "endMinutes"), classroom: text(fd, "classroom") });
    if (!parsed.success) return failed(parsed.error.issues[0]?.message);
    const course = await manageableCourse(user, parsed.data.courseId);
    if (!course) return failed("Curso no encontrado o sin acceso.");
    const existing = await db.scheduleSlot.findMany({ where: { institutionId: user.institutionId, weekday: parsed.data.weekday }, select: { id: true, teacherId: true, classroom: true, weekday: true, startMinutes: true, endMinutes: true } });
    const candidate = { ...parsed.data, teacherId: course.teacherId };
    const conflicts = findScheduleConflicts(candidate, existing);
    if (conflicts.length) return failed(`Conflicto de ${conflicts.map((c) => c.type === "TEACHER" ? "docente" : c.type === "CLASSROOM" ? "aula" : "horario").join(" y ")}.`);
    await db.scheduleSlot.create({ data: { institutionId: user.institutionId, courseId: course.id, teacherId: course.teacherId, weekday: parsed.data.weekday, startMinutes: parsed.data.startMinutes, endMinutes: parsed.data.endMinutes, classroom: parsed.data.classroom } });
    revalidatePath("/dashboard/calendario");
    revalidatePath(`/dashboard/aula/${course.id}`);
    return success("Horario guardado sin conflictos.");
  } catch { return failed(); }
}
