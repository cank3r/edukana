"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { createCourseAction, updateCourseAction, type CourseActionState } from "@/server/actions/courses";

const input = "mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-blue-500";
const label = "block text-sm font-medium text-slate-900";
const empty: CourseActionState = { ok: false, message: "" };

export type CourseFormValues = { id: string; name: string; description: string; teacherId: string; periodId: string; code: string; maxStudents: string };
type Option = { id: string; name: string };

/**
 * Formulario de curso, para crear y para corregir. Con `fixedTeacherId` quien lo usa es
 * docente: el curso es suyo y no se muestra el selector de docente.
 */
export function CourseForm({ course, teachers, periods, fixedTeacherId, fixedPeriodId }: {
  course?: CourseFormValues; teachers: Option[]; periods: Option[]; fixedTeacherId?: string;
  /** Docente independiente con un solo período: no se le pregunta. */
  fixedPeriodId?: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(course ? updateCourseAction : createCourseAction, empty);
  const created = !course && state.ok ? state.courseId : undefined;

  useEffect(() => {
    if (created) router.push(`/dashboard/aula/${created}`);
  }, [created, router]);

  return (
    <form action={action} className="space-y-4">
      {course && <input type="hidden" name="courseId" value={course.id} />}
      <label className={label}>
        Nombre del curso
        <input className={input} name="name" required minLength={3} maxLength={160} defaultValue={course?.name} placeholder="Ej.: Matemática 1" />
      </label>
      <label className={label}>
        Descripción <span className="font-normal text-slate-500">(opcional)</span>
        <textarea className={input} name="description" rows={3} maxLength={2000} defaultValue={course?.description} placeholder="De qué trata y qué aprenderán los estudiantes." />
      </label>
      {fixedTeacherId ? (
        <input type="hidden" name="teacherId" value={fixedTeacherId} />
      ) : (
        <label className={label}>
          Docente
          <select className={input} name="teacherId" required defaultValue={course?.teacherId ?? ""}>
            <option value="" disabled>Elige un docente</option>
            {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
          </select>
        </label>
      )}
      {fixedPeriodId ? (
        <input type="hidden" name="periodId" value={fixedPeriodId} />
      ) : (
        <label className={label}>
          Período
          <select className={input} name="periodId" required defaultValue={course?.periodId ?? (periods.length === 1 ? periods[0].id : "")}>
            <option value="" disabled>Elige un período</option>
            {periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
          </select>
        </label>
      )}
      <details className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2" open={Boolean(course?.code || course?.maxStudents)}>
        <summary className="min-h-11 cursor-pointer py-2.5 font-semibold text-slate-900">Opciones avanzadas</summary>
        <div className="mb-2 mt-2 grid gap-4 sm:grid-cols-2">
          <label className={label}>
            Código <span className="font-normal text-slate-500">(opcional)</span>
            <input className={input} name="code" maxLength={30} defaultValue={course?.code} placeholder="Ej.: MAT-101" />
            <span className="mt-1 block text-xs font-normal text-slate-600">Una clave corta para reconocer el curso. Letras, números y guiones.</span>
          </label>
          <label className={label}>
            Cupo <span className="font-normal text-slate-500">(opcional)</span>
            <input className={input} name="maxStudents" type="number" inputMode="numeric" min={1} max={10000} defaultValue={course?.maxStudents} />
            <span className="mt-1 block text-xs font-normal text-slate-600">Cuántos estudiantes caben como máximo. Vacío: sin límite.</span>
          </label>
        </div>
      </details>
      {!course && <p className="text-sm text-slate-600">El curso se crea como <strong>borrador</strong>: los estudiantes no lo ven hasta que lo publiques.</p>}
      {state.message && <p role={state.ok ? "status" : "alert"} className={`rounded-lg p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending || Boolean(created)} className="min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60">
          {pending ? "Guardando…" : course ? "Guardar cambios" : "Crear curso"}
        </button>
        <Link href={course ? `/dashboard/aula/${course.id}` : "/dashboard/aula"} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800">
          {course ? "Volver al curso" : "Cancelar"}
        </Link>
      </div>
    </form>
  );
}
