import { notFound } from "next/navigation";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { getInstitutionBilling } from "@/server/platform/limits";
import { listPlatformPlans } from "@/server/platform/plans";
import { BillingForm, BillingInput } from "./BillingForm";

const date = (value: Date) => value.toISOString().slice(0, 10);
const statuses = { TRIAL: "Prueba", ACTIVE: "Activo", PAST_DUE: "Vencido", CANCELED: "Cancelado" };
export async function BillingSection({ institutionId }: { institutionId: string }) {
  const operator = await getOperatorEmail(); if (!operator) notFound();
  const [{ institution, usage, invoices }, plans] = await Promise.all([
    getInstitutionBilling(operator, institutionId), listPlatformPlans(operator),
  ]);
  const sub = usage?.subscription;
  return <section className="space-y-4 rounded-xl border bg-white p-5"><h2 className="text-xl font-semibold text-[var(--navy)]">Plan y facturación</h2>
    {sub ? <><p>{sub.plan.name} · {statuses[sub.status]} · Vence el {date(sub.currentPeriodEnd)}</p>
      <p>Precio pactado: {(sub.priceCents / 100).toFixed(2)} {sub.plan.currency}</p>
      <ul className="space-y-1"><li>Estudiantes: {usage.students} / {sub.plan.maxStudents ?? "sin límite"}</li>
        <li>Almacenamiento: {usage.storageMb.toFixed(1)} / {sub.plan.maxStorageMb ?? "sin límite"} MB</li>
        <li>Pedidos de IA del mes: {usage.aiRequests} / {sub.plan.aiRequestsPerMonth ?? "sin límite"}</li></ul></>
      : <p>Esta institución todavía no tiene suscripción. Elige un plan para comenzar.</p>}
    <details><summary className="min-h-11 cursor-pointer py-3">Cambiar plan</summary>
      <BillingForm operation="change" institutionId={institutionId} label="Confirmar cambio de plan">
        <div><label htmlFor={`billing-plan-${institutionId}`} className="block">Plan</label>
          <select id={`billing-plan-${institutionId}`} name="planCode" defaultValue={sub?.planCode ?? "FREE"} className="block min-h-11 w-full border">
          {plans.filter((plan) => plan.active).map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}</select></div>
        <BillingInput label="Precio pactado en centavos" name="priceCents" type="number" value={sub?.priceCents ?? 0} />
        <BillingInput label="Notas" name="notes" value={sub?.notes ?? ""} required={false} />
        <BillingInput label={`Para confirmar, escribe ${institution.name}`} name="confirmation" />
      </BillingForm></details>
    {sub && <><details><summary className="min-h-11 cursor-pointer py-3">Extender período</summary>
      <BillingForm operation="extend" institutionId={institutionId} label="Extender período">
        <BillingInput label="Nuevo vencimiento" name="end" type="date" />
      </BillingForm></details>
      <details><summary className="min-h-11 cursor-pointer py-3">Generar factura del período</summary>
        <BillingForm operation="invoice" institutionId={institutionId} label="Generar factura">
          <BillingInput label="Inicio (UTC)" name="start" type="datetime-local" value={sub.currentPeriodStart.toISOString().slice(0, -1)} />
          <BillingInput label="Fin (UTC)" name="end" type="datetime-local" value={sub.currentPeriodEnd.toISOString().slice(0, -1)} />
          <BillingInput label="Fecha de vencimiento" name="due" type="date" value={date(sub.currentPeriodEnd)} />
        </BillingForm></details></>}
    <h3 className="font-semibold">Facturas</h3>{invoices.length === 0 && <p>Aún no hay facturas. Genera la primera para registrar el cobro.</p>}
    {invoices.map((invoice) => <article key={invoice.id} className="space-y-3 rounded-lg border p-4">
      <p>{date(invoice.periodStart)} al {date(invoice.periodEnd)} · {(invoice.amountCents / 100).toFixed(2)} {invoice.currency}</p>
      <p>{invoice.status === "PAID" ? "Pagada" : invoice.status === "VOID" ? "Anulada" : "Abierta"} · Vence {date(invoice.dueDate)}</p>
      {invoice.status === "OPEN" && <><details><summary className="min-h-11 cursor-pointer py-3">Marcar como pagada</summary>
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
