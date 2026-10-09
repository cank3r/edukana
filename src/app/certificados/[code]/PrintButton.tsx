"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="min-h-11 rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white">
      Imprimir o guardar como PDF
    </button>
  );
}
