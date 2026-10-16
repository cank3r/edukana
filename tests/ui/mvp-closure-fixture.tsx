import { createRoot } from "react-dom/client";
import { SubmitWithFiles } from "../../src/app/dashboard/aula/[courseId]/tareas/[assignmentId]/SubmissionFiles";
import { CreateAssignment } from "../../src/app/dashboard/aula/[courseId]/tareas/AssignmentTools";
import { CourseForm } from "../../src/app/dashboard/aula/nuevo/CourseForm";

declare global {
  interface Window {
    closureFixture: {
      calls: Array<{ action: string; fields: Array<[string, string]> }>;
      navigation: string[];
      rejectSubmit: boolean;
    };
  }
}
window.closureFixture = { calls: [], navigation: [], rejectSubmit: false };
const query = new URLSearchParams(window.location.search);
const view = query.get("view") ?? "submission";
const pending = query.get("pending") === "1";
const current = query.get("current") === "1";
const file = (id: string) => ({ id, name: `${id}.pdf`, sizeBytes: 38, url: `/api/assets/${id}` });
createRoot(document.getElementById("root")!).render(
  <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-8">
    <h1 className="text-2xl font-bold">Recorrido con datos ficticios</h1>
    <p className="text-sm text-slate-600">Componentes reales; acciones simuladas. Sin cuentas ni servicios externos.</p>
    {view === "submission" && <SubmitWithFiles assignmentId="assignment-fixture" content="" link=""
      resubmitting={current} currentFiles={current ? [file("current-a")] : []}
      pendingFiles={pending ? [file("pending-a")] : []} />}
    {view === "assignment" && <CreateAssignment courseId="course-fixture" categories={[]} />}
    {view === "period" && <CourseForm fixedTeacherId="teacher-fixture" teachers={[]}
      periods={[{ id: "past", name: "Primer semestre 2026" }, { id: "current", name: "Segundo semestre 2026" }]} />}
  </main>,
);
