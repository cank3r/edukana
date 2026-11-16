import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { EnrollPanel } from "../../src/app/dashboard/aula/[courseId]/estudiantes/StudentTools";

export type EnrollmentCall = {
  action: "search" | "students" | "group"; courseId: string; query?: string;
  fields?: Array<[string, string]>; completed: boolean;
};
type Action = EnrollmentCall["action"] | null;
declare global {
  interface Window {
    enrollmentFixture: {
      calls: EnrollmentCall[]; refreshes: number; throwAction: Action; failAction: Action; delay: number;
      searchDelayByQuery: Record<string, number>; boundaryErrors: string[];
      students: Array<{ id: string; name: string; email: string }>;
    };
  }
}
const thrown = new URLSearchParams(window.location.search).get("throw");
window.enrollmentFixture = {
  calls: [], refreshes: 0, throwAction: thrown === "search" ? "search" : null, failAction: null, delay: 0,
  searchDelayByQuery: {}, boundaryErrors: [], students: [
    { id: "student-a", name: "Ana Ejemplo", email: "ana@example.invalid" },
    { id: "student-b", name: "Beto Ejemplo", email: "beto@example.invalid" },
  ],
};
class FixtureBoundary extends Component<{ children: ReactNode }, { message: string }> {
  state = { message: "" };
  static getDerivedStateFromError(error: Error) { return { message: error.message }; }
  componentDidCatch(error: Error) { window.enrollmentFixture.boundaryErrors.push(error.message); }
  render() {
    return this.state.message
      ? <p role="alert" data-testid="fixture-error-boundary">Excepción no gestionada en el componente: {this.state.message}</p>
      : this.props.children;
  }
}
function Fixture() {
  return <main className="mx-auto max-w-4xl space-y-4 p-4 sm:p-8">
    <header><p className="text-sm text-slate-600">Fixture aislado: sin base, correo ni servicios externos</p>
      <h1 className="text-2xl font-bold">Matrícula: componente real</h1></header>
    <FixtureBoundary><EnrollPanel courseId="course-fixture" seatsLeft={10} startOpen={true}
      groups={[{ id: "group-a", name: "Grupo A", members: 2 }, { id: "group-b", name: "Grupo B", members: 3 }]} /></FixtureBoundary>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
