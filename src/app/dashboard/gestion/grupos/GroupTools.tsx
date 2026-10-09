"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import type { AcademicActionState } from "@/server/academic/guard";
import type { CourseEnrollmentPlan } from "@/server/academic/groups";
import { createGroupAction, enrollGroupAction, updateGroupAction, type GroupEnrollActionState } from "@/server/actions/groups";
import { fieldClass, Notice, primary, secondary } from "../programas/ProgramTools";

const empty: AcademicActionState = { ok: false, message: "" };

type GroupValues = { id: string; name: string; description: string; programId: string; startsOn: string; endsOn: string; capacity: string };

/** Crear (sin `group`) o editar un grupo. Al crear lleva al detalle para agregar estudiantes y cursos. */
export function GroupForm({ group, programs, startOpen = false }: { group?: GroupValues; programs: { id: string; name: string }[]; startOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [state, action, pending] = useActionState(async (previous: AcademicActionState, data: FormData) => {
    const result = group ? await updateGroupAction(previous, data) : await createGroupAction(previous, data);
    if (result.ok) {
      setOpen(false);
      if (!group && result.id) router.push(`/dashboard/gestion/grupos/${result.id}`);
    }
    return result;
  }, empty);

  if (!open) {
    return (
      <div>
        <button type="button" className={group ? secondary : primary} onClick={() => setOpen(true)}>{group ? "Editar datos del grupo" : "Crear grupo"}</button>
        {group && <Notice ok={state.ok} message={state.message} />}
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      {group && <input type="hidden" name="groupId" value={group.id} />}
      <label className="block text-sm font-medium text-slate-900">
        Nombre del grupo
        <input name="name" defaultValue={group?.name ?? ""} required minLength={3} maxLength={120} className={fieldClass} placeholder="Ejemplo: Enfermería 2027 — Noche" autoComplete="off" />
      </label>
      <label className="block text-sm font-medium text-slate-900">
        Programa (opcional)
        <select name="programId" defaultValue={group?.programId ?? ""} className={fieldClass}>
          <option value="">Sin programa</option>
          {programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-900">
          Fecha de inicio
          <input type="date" name="startsOn" defaultValue={group?.startsOn ?? ""} required className={fieldClass} />
        </label>
        <label className="block text-sm font-medium text-slate-900">
          Fecha de fin (opcional)
          <input type="date" name="endsOn" defaultValue={group?.endsOn ?? ""} className={fieldClass} />
        </label>
      </div>
      <label className="block text-sm font-medium text-slate-900">
        Cupo (opcional)
        <input type="number" name="capacity" defaultValue={group?.capacity ?? ""} min={1} max={99999} step={1} inputMode="numeric" className={fieldClass} placeholder="Déjalo vacío si no hay límite" />
      </label>
      <label className="block text-sm font-medium text-slate-900">
        Descripción (opcional)
        <textarea name="description" defaultValue={group?.description ?? ""} maxLength={1000} rows={3} className={`${fieldClass} py-2`} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className={primary} type="submit" disabled={pending}>{pending ? "Guardando…" : group ? "Guardar cambios" : "Crear grupo"}</button>
        <button className={secondary} type="button" disabled={pending} onClick={() => setOpen(false)}>Cancelar</button>
      </div>
      <Notice ok={state.ok} message={state.message} />
    </form>
  );
}

const count = (value: number, one: string, many: string) => (value === 1 ? `1 ${one}` : `${value} ${many}`);

function CourseLine({ course, done }: { course: CourseEnrollmentPlan & { enrolled?: number }; done: boolean }) {
  const parts: string[] = [];
  if (course.blocked === "archived") parts.push("está archivado: no se inscribe a nadie");
  else if (course.blocked === "full") {
    parts.push(`no tiene cupo para todos (${count(course.seatsLeft ?? 0, "cupo libre", "cupos libres")}, faltan ${count(course.toEnroll, "estudiante", "estudiantes")} por inscribir): este curso no se toca`);
  } else if (done) parts.push(course.enrolled ? `${count(course.enrolled, "inscripción nueva", "inscripciones nuevas")}` : "sin inscripciones nuevas");
  else parts.push(course.toEnroll ? `${count(course.toEnroll, "inscripción nueva", "inscripciones nuevas")}` : "nadie por inscribir");
  if (course.alreadyEnrolled) parts.push(`${course.alreadyEnrolled} ya ${course.alreadyEnrolled === 1 ? "estaba inscrito" : "estaban inscritos"}`);
  return (
    <li className={course.blocked ? "text-red-800" : "text-slate-700"}>
      <strong className="font-semibold">{course.courseName}:</strong> {parts.join("; ")}.
      {course.withdrawn.length > 0 && (
        <span className="mt-1 block text-amber-900">
          Se {course.withdrawn.length === 1 ? "retiró" : "retiraron"} de este curso y no se {course.withdrawn.length === 1 ? "vuelve" : "vuelven"} a inscribir aquí: {course.withdrawn.join(", ")}.
        </span>
      )}
    </li>
  );
}

/** Resumen de lo que va a pasar, confirmación y resultado de inscribir al grupo en sus cursos. */
export function EnrollGroup({ groupId, students, courses, canEnroll }: { groupId: string; students: number; courses: CourseEnrollmentPlan[]; canEnroll: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(async (previous: GroupEnrollActionState, data: FormData) => {
    const result = await enrollGroupAction(previous, data);
    setConfirming(false);
    return result;
  }, { ok: false, message: "" } as GroupEnrollActionState);

  if (students === 0 || courses.length === 0) {
    return (
      <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
        {students === 0 ? "Primero agrega estudiantes al grupo." : "Primero agrega los cursos del grupo."} Después podrás inscribirlos a todos con un solo botón.
      </p>
    );
  }

  const open = courses.filter((course) => !course.blocked);
  const pendingTotal = open.reduce((sum, course) => sum + course.toEnroll, 0);
  const already = courses.reduce((sum, course) => sum + course.alreadyEnrolled, 0);
  const withdrawn = courses.reduce((sum, course) => sum + course.withdrawn.length, 0);
  const summary =
    pendingTotal === 0
      ? "No hay inscripciones nuevas por hacer."
      : `Se inscribirá a ${count(students, "estudiante", "estudiantes")} en ${count(open.filter((course) => course.toEnroll > 0).length, "curso", "cursos")} (${count(pendingTotal, "inscripción nueva", "inscripciones nuevas")}); ${already} ya ${already === 1 ? "estaba inscrito" : "estaban inscritos"}.`;

  return (
    <div className="mt-3">
      <div className="rounded-lg bg-slate-50 p-4 text-sm" aria-live="polite">
        <p className="font-semibold text-slate-950">{summary}</p>
        {withdrawn > 0 && <p className="mt-1 text-amber-900">{count(withdrawn, "retiro no se reactiva", "retiros no se reactivan")}: si alguien debe volver a un curso, inscríbelo desde ese curso.</p>}
        <ul className="mt-2 space-y-2">
          {courses.map((course) => <CourseLine key={course.courseId} course={course} done={false} />)}
        </ul>
      </div>

      {!canEnroll ? (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Tu cuenta no puede inscribir estudiantes en cursos. Pídele a un administrador que lo haga o que te dé ese permiso.</p>
      ) : pendingTotal === 0 ? null : !confirming ? (
        <button type="button" className={`${primary} mt-3`} disabled={pending} onClick={() => setConfirming(true)}>{pending ? "Inscribiendo…" : "Inscribir al grupo en sus cursos"}</button>
      ) : (
        <form action={action} className="mt-3 rounded-lg bg-amber-50 p-4" role="alertdialog" aria-label="Confirmar inscripción del grupo">
          <input type="hidden" name="groupId" value={groupId} />
          <p className="text-sm font-semibold text-amber-900">{summary}</p>
          <p className="mt-1 text-sm text-amber-900">Los estudiantes verán estos cursos de inmediato. Para deshacerlo habría que retirarlos curso por curso.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={primary} type="submit" disabled={pending}>{pending ? "Inscribiendo…" : `Sí, hacer ${count(pendingTotal, "inscripción", "inscripciones")}`}</button>
            <button className={secondary} type="button" disabled={pending} onClick={() => setConfirming(false)}>Cancelar</button>
          </div>
        </form>
      )}

      <Notice ok={state.ok} message={state.message} />
      {state.ok && state.courses && (
        <div className="mt-3 rounded-lg border border-slate-200 p-4 text-sm">
          <p className="font-semibold text-slate-950">Resultado por curso</p>
          <ul className="mt-2 space-y-2">
            {state.courses.map((course) => <CourseLine key={course.courseId} course={course} done />)}
          </ul>
        </div>
      )}
    </div>
  );
}
