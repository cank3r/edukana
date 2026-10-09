import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { verifyCertificateCode } from "@/server/courses/certificates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Comprobar un certificado", robots: { index: false, follow: false } };

/**
 * Buscador público de certificados: se escribe el código y lleva a `/certificados/<código>`.
 * Funciona sin JavaScript: el formulario vuelve a esta misma página con `?codigo=`.
 */
export default async function CertificateSearchPage({ searchParams }: { searchParams: Promise<{ codigo?: string | string[] }> }) {
  const raw = (await searchParams).codigo;
  const code = (typeof raw === "string" ? raw : "").trim().toUpperCase().slice(0, 40);
  if (code) {
    const result = await verifyCertificateCode(code);
    if (result.status !== "not_found") redirect(`/certificados/${encodeURIComponent(code)}`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <article className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <h1 className="text-2xl font-bold text-slate-900">Comprobar un certificado</h1>
        <p className="mt-2 text-slate-700">Escribe el código de verificación que aparece en el certificado para ver si es auténtico y está vigente.</p>
        <form method="get" action="/certificados" className="mt-6 space-y-3">
          <label htmlFor="codigo" className="block text-sm font-semibold text-slate-900">Código del certificado</label>
          <input
            id="codigo"
            name="codigo"
            required
            maxLength={40}
            defaultValue={code}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-describedby={code ? "codigo-error" : undefined}
            className="block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base uppercase tracking-wider outline-none focus:border-blue-500"
          />
          {code && (
            <p id="codigo-error" role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              No encontramos un certificado con el código «{code}». Revisa que esté escrito igual que en el certificado.
            </p>
          )}
          <button type="submit" className="min-h-11 w-full rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white sm:w-auto">Comprobar</button>
        </form>
      </article>
    </main>
  );
}
