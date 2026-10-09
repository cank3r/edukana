"use client";

export function PrintReceiptButton() {
  return (
    <button type="button" onClick={() => window.print()} className="min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white">
      Imprimir o guardar como PDF
    </button>
  );
}
