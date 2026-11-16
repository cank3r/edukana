import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { DeleteSession, TakeAttendance } from "../../src/app/dashboard/aula/[courseId]/asistencia/AttendanceTools";

type Result = "ok" | "error" | "throw";
export type AttendanceCall = {
  kind: "save" | "delete"; data: Record<string, string>; completed: boolean;
};
declare global {
  interface Window {
    attendanceFixture: {
      calls: AttendanceCall[]; saveResult: Result; deleteResult: Result;
      hold: boolean; release: null | (() => void); caught: number; refreshes: number; navigations: string[];
    };
  }
}
window.attendanceFixture = {
  calls: [], saveResult: "ok", deleteResult: "ok", hold: false, release: null,
  caught: 0, refreshes: 0, navigations: [],
};

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { window.attendanceFixture.caught++; }
  render() {
    return this.state.failed ? <div data-testid="boundary">
      <p role="alert">El componente salió al límite de errores de prueba.</p>
      <button onClick={() => this.setState({ failed: false })}>Reabrir componente</button>
    </div> : this.props.children;
  }
}

function Fixture() {
  return <main className="mx-auto max-w-4xl space-y-4 p-4 sm:p-8">
    <h1 className="text-2xl font-bold">Asistencia: componentes reales</h1>
    <p>Fixture aislado sin base ni servicios externos.</p>
    <section aria-label="Tomar asistencia" className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <Boundary><TakeAttendance courseId="course-fixture" date="2026-10-12" dateLabel="12 de octubre"
        isCorrection={false} initialTitle="Clase inicial" classTitles={["Clase sugerida"]}
        rows={[
          { studentId: "student-ana", name: "Ana Prueba", status: "PRESENT", note: "", withdrawn: false, completed: false },
          { studentId: "student-luis", name: "Luis Prueba", status: "LATE", note: "Nota inicial", withdrawn: true, completed: false },
        ]} /></Boundary>
    </section>
    <section aria-label="Borrar asistencia" className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <Boundary><DeleteSession courseId="course-fixture" sessionId="session-fixture" dateLabel="12 de octubre" total={2} /></Boundary>
    </section>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
