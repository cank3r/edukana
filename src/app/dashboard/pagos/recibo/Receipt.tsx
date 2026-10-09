import Link from "next/link";
import type { PaymentReceipt } from "@/server/finance/charges";
import { formatMoney } from "@/server/finance/money";
import { formatDateKey, METHOD_LABEL } from "../labels";
import { PrintReceiptButton } from "./PrintReceiptButton";

// Al imprimir solo sale el recibo: sin menú, sin migas ni botones, en una hoja blanca.
const PRINT_CSS = `@media print {
  @page { size: auto; margin: 12mm; }
  html, body { background: #fff !important; }
  body * { visibility: hidden !important; }
  .recibo, .recibo * { visibility: visible !important; }
  .recibo { position: fixed; top: 0; left: 0; width: 100%; margin: 0 !important; border: 0 !important; box-shadow: none !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .no-print { display: none !important; }
}`;

/** Recibo imprimible de un pago. Quién puede verlo ya se decidió en el servidor (`getPaymentReceipt`). */
export function Receipt({ receipt, backHref, backLabel }: { receipt: PaymentReceipt; backHref: string; backLabel: string }) {
  const rows: Array<[string, string]> = [
    ["Estudiante", receipt.student.name],
    ["Concepto", receipt.periodName ? `${receipt.concept} · ${receipt.periodName}` : receipt.concept],
    ["Forma de pago", METHOD_LABEL[receipt.method] ?? "Otro"],
    ["Fecha del pago", formatDateKey(receipt.paidOn)],
    ["Registró", `${receipt.recordedByName}, el ${formatDateKey(receipt.recordedOn)}`],
  ];
  if (receipt.note) rows.push(["Nota", receipt.note]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-8">
      <style>{PRINT_CSS}</style>
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline" href={backHref}>{backLabel}</Link>
        <PrintReceiptButton />
      </div>

      <article className="recibo relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 sm:p-8" aria-labelledby="recibo-titulo">
        {receipt.voided && (
          <p aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center text-6xl font-black tracking-widest text-red-600/15 sm:text-8xl" style={{ transform: "rotate(-18deg)" }}>
            ANULADO
          </p>
        )}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="min-w-0">
            <p className="break-words text-lg font-bold text-slate-950">{receipt.institution.name}</p>
            <h1 id="recibo-titulo" className="text-sm font-semibold uppercase tracking-wider text-slate-600">Recibo de pago</h1>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-600">Recibo n.º</p>
            <p className="font-mono text-lg font-bold tracking-wider text-slate-950">{receipt.number}</p>
          </div>
        </header>

        {receipt.voided && (
          <div role="status" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <p className="font-bold">ANULADO el {formatDateKey(receipt.voided.on)}</p>
            {receipt.voided.reason && <p className="mt-1">Motivo: {receipt.voided.reason}</p>}
            <p className="mt-1">Este pago ya no cuenta como pagado.</p>
          </div>
        )}

        <div className="mt-5 rounded-lg bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-600">Monto recibido</p>
          <p className={`mt-1 text-3xl font-bold text-slate-950 ${receipt.voided ? "line-through decoration-red-600" : ""}`}>{formatMoney(receipt.amountCents, receipt.currency)}</p>
          <p className="mt-1 text-sm text-slate-700">{receipt.amountWords}</p>
        </div>

        <dl className="mt-5 divide-y divide-slate-100 text-sm">
          {rows.map(([term, value]) => (
            <div key={term} className="grid gap-1 py-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <dt className="text-slate-600">{term}</dt>
              <dd className="break-words font-medium text-slate-950">{value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-6 text-xs text-slate-500">Comprobante emitido por {receipt.institution.name} con Edukana. Consérvalo para cualquier aclaración.</p>
      </article>
    </div>
  );
}

/** Pantalla para un recibo que no existe o que quien pregunta no puede ver (no se dice cuál de las dos). */
export function ReceiptNotFound({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-8">
      <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Recibo no disponible</h1>
      <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
        No encontramos ese recibo o no tienes permiso para verlo. Revisa el enlace o búscalo en el historial de pagos.
      </p>
      <Link className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline" href={backHref}>{backLabel}</Link>
    </div>
  );
}
