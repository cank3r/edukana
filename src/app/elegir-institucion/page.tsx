import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard, authLink } from "@/components/auth/AuthCard";
import { roleLabel } from "@/lib/ux";
import type { EdukanaRole } from "@/types/next-auth";
import { listMyInstitutions, switchInstitutionAction } from "@/server/actions/institutions";

export const metadata: Metadata = { title: "Elegir institución · Edukana" };
export const dynamic = "force-dynamic";

export default async function ChooseInstitutionPage() {
  const choices = await listMyInstitutions();
  if (choices.length < 2) redirect("/dashboard");
  return (
    <AuthCard title="¿A dónde quieres entrar?" intro="Tu cuenta pertenece a varias instituciones. Puedes cambiar cuando quieras sin volver a escribir tu contraseña.">
      <ul className="space-y-3">
        {choices.map((choice) => (
          <li key={choice.userId}>
            <form action={switchInstitutionAction}>
              <input type="hidden" name="userId" value={choice.userId} />
              <button type="submit" className={`flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 text-left ${choice.current ? "border-blue-600" : "border-slate-300 hover:border-blue-500"}`}>
                <span>
                  <span className="block font-semibold text-slate-950">{choice.institutionName}</span>
                  <span className="block text-sm text-slate-600">{roleLabel(choice.role as EdukanaRole)}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-blue-700">{choice.current ? "Estás aquí" : "Entrar"}</span>
              </button>
            </form>
          </li>
        ))}
      </ul>
      <Link className={`${authLink} mt-6`} href="/dashboard">Volver</Link>
    </AuthCard>
  );
}
