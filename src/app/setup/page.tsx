import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await db.institution.count()) redirect("/login");
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-xl">
        <header className="mb-7 text-center">
          <p className="text-sm font-semibold text-blue-700">Puesta en marcha inicial</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">Crea el primer espacio de Edukana</h1>
          <p className="mt-3 text-sm text-slate-600">Esta pantalla solo está disponible mientras la base de datos no tenga instituciones. No necesita seed ni SQL manual.</p>
        </header>
        <SetupForm />
      </div>
    </main>
  );
}
