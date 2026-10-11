"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { CourseEnrollmentState } from "@/server/actions/course-enrollment";

export const primary = "min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
export const secondary =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60";
export const field = "min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base focus:border-blue-500";
export const empty: CourseEnrollmentState = { ok: false, message: "" };
export const people = (n: number) => (n === 1 ? "1 estudiante" : `${n} estudiantes`);
export type Group = { id: string; name: string; members: number };
export type EnrollmentProps = {
  courseId: string;
  onDone: (state: CourseEnrollmentState) => void;
  onBusyChange: (busy: boolean) => void;
};

export function EnrollmentNotice({ message, submission = false }: { message: string; submission?: boolean }) {
  const notice = useRef<HTMLDivElement>(null);
  useEffect(() => { if (message) notice.current?.focus(); }, [message]);
  if (!message) return null;
  return <div ref={notice} tabIndex={-1} role="alert"
    className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 [overflow-wrap:anywhere]">
    <p>{message}</p>
    {submission && <p className="mt-2">Revisa la lista de inscritos antes de volver a confirmar.</p>}
  </div>;
}

export function useEnrollmentSubmission({ onDone, onBusyChange }: Omit<EnrollmentProps, "courseId">) {
  const router = useRouter();
  const busy = useRef(false);
  const mounted = useRef(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [, startSaving] = useTransition();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  function refreshList() {
    try { router.refresh(); } catch { /* El borrador y el aviso permiten revisar la lista más tarde. */ }
  }
  function submit(action: (state: CourseEnrollmentState, data: FormData) => Promise<CourseEnrollmentState>, data: FormData) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    onBusyChange(true);
    startSaving(async () => {
      try {
        const result = await action(empty, data);
        if (!mounted.current) return;
        if (!result.ok) {
          setError(result.message);
          refreshList();
          return;
        }
        router.refresh();
        onDone(result);
      } catch {
        if (mounted.current) {
          setError("No pudimos confirmar cómo terminó la inscripción. La selección se conserva.");
          refreshList();
        }
      } finally {
        if (mounted.current) {
          busy.current = false;
          setSaving(false);
          onBusyChange(false);
        }
      }
    });
  }
  return { busy, saving, error, clearError: () => setError(""), submit };
}
