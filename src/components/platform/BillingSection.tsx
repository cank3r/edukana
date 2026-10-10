import { notFound } from "next/navigation";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { getInstitutionBilling } from "@/server/platform/limits";
import { listPlatformPlans } from "@/server/platform/plans";
import { formatMoney, formatOperatorDay, formatStorageUsage, formatUsage } from "@/app/operador/format";
import { BillingForm, BillingInput } from "./BillingForm";

/** Valor para los campos de fecha (`AAAA-MM-DD`, UTC). Lo que se muestra usa `formatOperatorDay`. */
const date = (value: Date) => value.toISOString().slice(0, 10);
const invoiceStatus = (status: string, dueDate: Date, now: Date) =>
  status === "PAID" ? "Pagada" : status === "VOID" ? "Anulada" : dueDate < now ? "Vencida" : "Abierta";
const summary = "flex min-h-11 cursor-pointer items-center font-semibold text-blue-700";
const statuses = { TRIAL: "Prueba", ACTIVE: "Activo", PAST_DUE: "Vencido", CANCELED: "Cancelado" };
export async function BillingSection({ institutionId }: { institutionId: string }) {
  const operator = await getOperatorEmail(); if (!operator) notFound();
  const [{ institution, usage, invoices }, plans] = await Promise.all([
    getInstitutionBilling(operator, institutionId), listPlatformPlans(operator),
  ]);
  const sub = usage?.subscription;
  const now = new Date();
  return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
    <h2 className="text-lg font-semibold" style={{ color: "var(--navy)" }}>Plan y facturación</h2>
    {sub ? <>
      <p className="text-slate-950"><span className="font-semibold">{sub.plan.name}</span> · {statuses[sub.status]} · Vence el {formatOperatorDay(sub.currentPeriodEnd)}</p>
      <dl className="grid gap-3 text-sm min-[360px]:grid-cols-2">
        <div><dt className="text-slate-600">Precio pactado</dt><dd className="font-semibold text-slate-950">{formatMoney(sub.priceCents, sub.plan.currency)} al mes</dd></div>
        <div><dt className="text-slate-600">Estudiantes</dt><dd className="font-semibold text-slate-950">{formatUsage(usage.students, sub.plan.maxStudents)}</dd></div>
        <div><dt className="text-slate-600">Almacenamiento</dt><dd className="font-semibold text-slate-950">{formatStorageUsage(usage.storageMb, sub.plan.maxStorageMb)}</dd></div>
        <div><dt className="text-slate-600">Pedidos de IA del mes</dt><dd className="font-semibold text-slate-950">{formatUsage(usage.aiRequests, sub.plan.aiRequestsPerMonth)}</dd></div>
      </dl></>
      : <p className="text-sm text-slate-700">Esta institución todavía no tiene suscripción. Elige un plan para comenzar.</p>}
    <details><summary className={summary}>Cambiar plan</summary>
      <BillingForm operation="change" institutionId={institutionId} label="Confirmar cambio de plan">
        <div><label htmlFor={`billing-plan-${institutionId}`} className="block">Plan</label>
          <select id={`billing-plan-${institutionId}`} name="planCode" defaultValue={sub?.planCode ?? "FREE"} className="block min-h-11 w-full border">
          {plans.filter((plan) => plan.active).map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}</select></div>
        <BillingInput label="Precio pactado en centavos" name="priceCents" type="number" value={sub?.priceCents ?? 0} />
        <BillingInput label="Notas" name="notes" value={sub?.notes ?? ""} required={false} />
        <BillingInput label={`Para confirmar, escribe ${institution.name}`} name="confirmation" />
      </BillingForm></details>
    {sub && <><details><summary className={summary}>Extender período</summary>
      <BillingForm operation="extend" institutionId={institutionId} label="Extender período">
        <BillingInput label="Nuevo vencimiento" name="end" type="date" />
      </BillingForm></details>
      <details><summary className={summary}>Generar factura del período</summary>
        <BillingForm operation="invoice" institutionId={institutionId} label="Generar factura">
          <BillingInput label="Inicio (UTC)" name="start" type="datetime-local" value={sub.currentPeriodStart.toISOString().slice(0, -1)} />
          <BillingInput label="Fin (UTC)" name="end" type="datetime-local" value={sub.currentPeriodEnd.toISOString().slice(0, -1)} />
          <BillingInput label="Fecha de vencimiento" name="due" type="date" value={date(sub.currentPeriodEnd)} />
        </BillingForm></details></>}
    <h3 className="font-semibold text-slate-950">Facturas</h3>{invoices.length === 0 && <p className="text-sm text-slate-700">Aún no hay facturas. Genera la primera para registrar el cobro.</p>}
    {invoices.map((invoice) => <article key={invoice.id} className="space-y-2 rounded-lg border border-slate-200 p-4">
      <p className="font-semibold text-slate-950">{formatMoney(invoice.amountCents, invoice.currency)}</p>
      <p className="text-sm text-slate-700">Período del {formatOperatorDay(invoice.periodStart)} al {formatOperatorDay(invoice.periodEnd)}</p>
      <p className="text-sm text-slate-700">{invoiceStatus(invoice.status, invoice.dueDate, now)} · Vence el {formatOperatorDay(invoice.dueDate)}</p>
      {invoice.status === "OPEN" && <><details><summary className={summary}>Marcar como pagada</summary>
        <BillingForm operation="pay" institutionId={institutionId} label="Registrar pago">
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <div><label htmlFor={`billing-method-${invoice.id}`} className="block">Método</label>
            <select id={`billing-method-${invoice.id}`} name="paymentMethod" className="block min-h-11 w-full border">
            {['transferencia', 'efectivo', 'tarjeta', 'otro'].map((method) => <option key={method}>{method}</option>)}</select></div>
          <BillingInput label="Referencia" name="reference" required={false} />
          <BillingInput label="Fecha del pago" name="paidAt" type="date" value={date(new Date())} />
        </BillingForm></details>
        <BillingForm operation="void" institutionId={institutionId} label="Anular factura">
          <input type="hidden" name="invoiceId" value={invoice.id} />
        </BillingForm></>}
    </article>)}
  </section>;
}
