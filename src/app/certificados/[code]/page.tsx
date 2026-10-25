import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { verifyCertificateCode } from "@/server/courses/certificates";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Certificado", robots: { index: false, follow: false } };

// Al imprimir: hoja horizontal sin márgenes del navegador y con los colores del diploma.
const PRINT_CSS = `@media print {
  @page { size: landscape; margin: 10mm; }
  html, body { background: #fff !important; }
  .diploma { -webkit-print-color-adjust: exact; print-color-adjust: exact; break-inside: avoid; }
}`;

export default async function CertificatePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const result = await verifyCertificateCode(code);
  if (result.status === "not_found") notFound();

  if (result.status !== "valid") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <article className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[.3em] text-red-700">Certificado no válido</p>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">
            {result.status === "revoked" ? "Este certificado fue anulado" : "No pudimos comprobar este certificado"}
          </h1>
          <p className="mt-3 text-slate-700">
            {result.status === "revoked"
              ? `${result.institutionName} anuló este certificado, así que ya no acredita la finalización de ningún curso.`
              : "El código existe, pero su registro no se pudo comprobar. No lo tomes como válido."}
          </p>
          <p className="mt-4 text-sm text-slate-600">Si crees que es un error, comunícate con {result.institutionName}.</p>
          <p className="mt-6 text-sm text-slate-500">Código consultado: <strong className="text-slate-800">{result.code}</strong></p>
        </article>
      </main>
    );
  }

  const issuedOn = new Intl.DateTimeFormat("es", { timeZone: result.timezone, dateStyle: "long" }).format(result.issuedAt);
  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-10 print:min-h-0 print:bg-white print:p-0">
      <style>{PRINT_CSS}</style>
      <article className="diploma mx-auto max-w-4xl rounded-sm border-[6px] border-double border-blue-800 bg-white p-2 shadow-xl print:max-w-none print:shadow-none">
        <div className="border border-blue-200 px-5 py-10 text-center sm:px-14 sm:py-14">
          <p className="text-lg font-semibold uppercase tracking-[.2em] text-slate-800 sm:text-xl">{result.institutionName}</p>
          <h1 className="mt-8 font-serif text-3xl font-bold text-blue-900 sm:text-5xl">Certificado de finalización</h1>
          <p className="mt-8 text-slate-600">Se otorga a</p>
          <p className="mx-auto mt-3 max-w-2xl break-words border-b border-slate-300 pb-3 font-serif text-3xl font-semibold text-slate-900 sm:text-4xl">{result.studentName}</p>
          <p className="mt-6 text-slate-600">por haber completado satisfactoriamente el curso</p>
          <p className="mt-2 break-words text-2xl font-bold text-slate-900">{result.courseName}</p>
          <dl className="mx-auto mt-10 grid max-w-xl gap-4 border-t border-slate-200 pt-6 text-sm sm:grid-cols-2 print:grid-cols-2">
            <div>
              <dt className="text-slate-500">Fecha de emisión</dt>
              <dd className="font-semibold text-slate-900">{issuedOn}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Código de verificación</dt>
              <dd className="font-semibold tracking-wider text-slate-900">{result.code}</dd>
            </div>
          </dl>
          <p className="mt-6 text-xs text-slate-500">Emitido con Edukana. Cualquiera puede comprobarlo abriendo su enlace o buscando este código.</p>
        </div>
      </article>

      <div className="mx-auto mt-6 flex max-w-4xl flex-col items-center gap-3 text-center print:hidden">
        <p className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">Certificado auténtico y vigente</p>
        <PrintButton />
      </div>
    </main>
  );
}
