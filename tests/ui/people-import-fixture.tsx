import { createRoot } from "react-dom/client";
import { ImportPeople } from "../../src/app/dashboard/gestion/accesos/ImportPeople";

export type ImportCall = { confirm: boolean; name: string; content: string; completed: boolean };
type Phase = "preview" | "confirm" | null;
declare global {
  interface Window {
    peopleImportFixture: {
      calls: ImportCall[]; delay: number; failPhase: Phase; throwPhase: Phase; refreshes: number;
      toCreate: number; alreadyExisted: number; rejected: number; createdOnConfirm: number | null;
      sampleErrors: Array<{ line: number; field: string; message: string }>; errorsCsv: string;
    };
  }
}
window.peopleImportFixture = {
  calls: [], delay: 0, failPhase: null, throwPhase: null, refreshes: 0,
  toCreate: 2, alreadyExisted: 1, rejected: 1, createdOnConfirm: null,
  sampleErrors: [{ line: 5, field: "Correo", message: "El correo no es válido." }],
  errorsCsv: "Fila,Columna,Problema,Nombre,Correo\n5,Correo,El correo no es válido.,Fila Inválida,sin-correo\n",
};

function Fixture() {
  return <main className="mx-auto max-w-4xl space-y-4 p-4 sm:p-8">
    <header><p className="text-sm text-slate-600">Fixture aislado: sin base, correo ni servicios externos</p>
      <h1 className="text-2xl font-bold">Importación de personas: componentes reales</h1></header>
    <section aria-label="Importar personas" className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Agregar personas desde un archivo</h2>
      <ImportPeople />
    </section>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
