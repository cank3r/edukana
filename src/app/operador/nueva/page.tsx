import Link from "next/link";
import { notFound } from "next/navigation";
import { INSTITUTION_TYPE_OPTIONS } from "@/server/platform/institution-settings";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { NewInstitutionForm } from "./NewInstitutionForm";

export const dynamic = "force-dynamic";

export default async function NewInstitutionPage() {
  if (!(await getOperatorEmail())) notFound();
  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-8">
      <header>
        <Link href="/operador" className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline">Volver a instituciones</Link>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Crear institución</h1>
        <p className="mt-1 text-sm text-slate-600">Escribe sus datos y los de quien la va a administrar. Esa persona recibe la invitación por correo y después agrega al resto.</p>
      </header>
      <NewInstitutionForm types={INSTITUTION_TYPE_OPTIONS.map((option) => ({ ...option }))} />
    </div>
  );
}
