import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { AddPerson } from "../../src/app/dashboard/gestion/AddPerson";
import { InvitePending } from "../../src/app/dashboard/gestion/accesos/AccessTools";
import { PersonAccess, PersonEditor, type Person } from "../../src/app/dashboard/gestion/accesos/PersonActions";

export type RecordedAction = { action: string; fields: Record<string, string> };
declare global {
  interface Window {
    peopleFixture: {
      calls: RecordedAction[]; fail: boolean; throwError: boolean; delay: number;
      refreshes: number; setPending: (value: number) => void;
    };
  }
}
window.peopleFixture = { calls: [], fail: false, throwError: false, delay: 0, refreshes: 0, setPending: () => undefined };
const person: Person = {
  id: "fixture-person", name: "Ana Ejemplo", email: "ana@example.invalid", phone: "8095550100",
  role: "STUDENT", roleLabel: "Estudiante", suspended: false, hasPassword: false,
  isSelf: false, hasIdentity: true, canManageAdminRoles: true,
};
const longPerson = {
  ...person, id: "long-person", name: "Nombre".repeat(20), email: `${"correo".repeat(30)}@example.invalid`,
  detailHref: "#fixture-profile",
};
function Fixture() {
  const [pending, setPending] = useState(3);
  useEffect(() => { window.peopleFixture.setPending = setPending; }, []);
  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
    <header><p className="text-sm text-slate-600">Fixture aislado · sin base ni correo</p>
      <h1 className="text-2xl font-bold">Personas — prueba de componentes reales</h1></header>
    <section id="directory" aria-label="Directorio" className="rounded-xl bg-white p-4">
      <h2 className="text-lg font-bold">Directorio</h2><ul><PersonAccess person={person} /></ul>
    </section>
    <section id="editor" aria-label="Datos personales" className="rounded-xl bg-white p-4">
      <h2 className="mb-3 text-lg font-bold">Datos personales</h2><PersonEditor person={person} />
    </section>
    <section id="restrictions" aria-label="Restricciones" className="rounded-xl bg-white p-4">
      <h2 className="text-lg font-bold">Restricciones</h2>
      <PersonEditor person={{ ...person, id: "super", role: "SUPER_ADMIN", roleLabel: "Superadministrador" }} />
      <ul>
        <PersonAccess person={{ ...person, id: "noidentity", name: "Sin acceso", hasIdentity: false }} />
        <PersonAccess person={{ ...person, id: "restricted", name: "Acceso restringido", accessRestricted: true }} />
        <PersonAccess person={{ ...person, id: "admin", name: "Administrador", role: "ADMIN",
          roleLabel: "Administrador", canManageAdminRoles: false }} />
      </ul>
    </section>
    <section id="longtext" aria-label="Textos largos" className="rounded-xl bg-white p-4">
      <h2 className="text-lg font-bold">Textos largos</h2><ul><PersonAccess person={longPerson} /></ul>
    </section>
    <section id="create" aria-label="Alta" className="rounded-xl bg-white p-4"><AddPerson canAddAdmin={false} /></section>
    <section id="bulk" aria-label="Invitaciones por lote" className="rounded-xl bg-white p-4">
      <h2 className="text-lg font-bold">Invitaciones por lote</h2><InvitePending pending={pending} />
    </section>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
