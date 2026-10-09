"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { createCourseAction, updateCourseAction, type CourseActionState } from "@/server/actions/courses";

const input = "mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200";
const label = "block text-sm font-medium text-slate-900";
const empty: CourseActionState = { ok: false, message: "" };

type Option = { id: string; name: string };
export type CourseFormValues = {
  id: string;
  name: string;
  description: string;
  teacherId: string;
  periodId: string;
  code: string;
  maxStudents: string;
};

export function CourseForm({
  course,
  teachers,
  periods,
  fixedTeacherId,
}: {
  course?: CourseFormValues;
  teachers: Option[];
  periods: Option[];
  fixedTeacherId?: string;
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
      <label className={label} htmlFor="course-name">
        Nombre del curso
      </label>
      <input
        className={input}
        id="course-name"
        name="name"
        required
        minLength={3}
        maxLength={160}
        defaultValue={course?.name}
        placeholder="Ej.: Matemática 1"
      />

      <label className={label} htmlFor="course-description">
        Descripción <span className="font-normal text-slate-500">(opcional)</span>
      </label>
      <textarea
        className={input}
        id="course-description"
        name="description"
        rows={3}
        maxLength={2000}
        defaultValue={course?.description}
        placeholder="De qué trata y qué aprenderán los estudiantes."
      />

      {fixedTeacherId ? (
        <input type="hidden" name="teacherId" value={fixedTeacherId} />
      ) : (
        <div>
          <label className={label} htmlFor="course-teacher">Docente</label>
          <select className={input} id="course-teacher" name="teacherId" required defaultValue={course?.teacherId ?? ""}>
            <option value="" disabled>Elige un docente</option>
            {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
          </select>
        </div>
      )}

      <div>
        <label className={label} htmlFor="course-period">Período</label>
        <select
          className={input}
          id="course-period"
          name="periodId"
          required
          defaultValue={course?.periodId ?? (periods.length === 1 ? periods[0].id : "")}
        >
          <option value="" disabled>Elige un período</option>
          {periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
        </select>
      </div>

      <details className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2" open={Boolean(course?.code || course?.maxStudents)}>
        <summary className="min-h-11 cursor-pointer py-2.5 font-semibold text-slate-900">Opciones avanzadas</summary>
        <div className="mb-2 mt-2 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="course-code">Código <span className="font-normal text-slate-500">(opcional)</span></label>
            <input className={input} id="course-code" name="code" maxLength={30} defaultValue={course?.code} placeholder="Ej.: MAT-101" />
            <p className="mt-1 text-xs text-slate-600">Letras, números, puntos y guiones.</p>
          </div>
          <div>
            <label className={label} htmlFor="course-capacity">Cupo <span className="font-normal text-slate-500">(opcional)</span></label>
            <input className={input} id="course-capacity" name="maxStudents" type="number" inputMode="numeric" min={1} max={10000} defaultValue={course?.maxStudents} />
            <p className="mt-1 text-xs text-slate-600">Vacío significa que no tiene límite.</p>
          </div>
        </div>
      </details>

      {!course && <p className="text-sm text-slate-600">El curso nace como borrador. Los estudiantes no lo ven hasta que lo publiques.</p>}
      {state.message && (
        <p aria-live="polite" role={state.ok ? "status" : "alert"} className={`rounded-lg p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
          {state.message}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Link
          href={course ? `/dashboard/aula/${course.id}` : "/dashboard/aula"}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800"
        >
          Cancelar
        </Link>
        <button type="submit" disabled={pending || Boolean(created)} className="min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60">
          {pending ? "Guardando…" : course ? "Guardar cambios" : "Crear curso"}
        </button>
      </div>
    </form>
  );
}
