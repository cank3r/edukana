import { notFound } from "next/navigation";
import { getOperatorEmail } from "@/server/platform/operator-session";
import { listPlatformPlans } from "@/server/platform/plans";
import { BillingForm, BillingInput } from "@/components/platform/BillingForm";

export default async function PlansPage() {
  const operator = await getOperatorEmail();
  if (!operator) notFound();
  const plans = await listPlatformPlans(operator);
  return <main className="mx-auto max-w-5xl space-y-6 p-4"><h1 className="text-2xl font-bold text-[var(--navy)]">Planes</h1>
    <p>Los precios se expresan en centavos. Deja un límite vacío si no tiene máximo. Cambiar un precio no altera acuerdos existentes.</p>
    {plans.length === 0 && <p>No hay planes cargados. Ejecuta la semilla de planes antes de configurar la facturación.</p>}
    <div className="grid gap-4 md:grid-cols-2">{plans.map((plan) => {
      const features = plan.features && typeof plan.features === "object" && !Array.isArray(plan.features) ? plan.features : {};
      return <section key={plan.code} className="rounded-xl border bg-white p-5"><h2 className="mb-3 text-xl font-semibold">{plan.name}</h2>
        <BillingForm operation="plan" label="Guardar plan"><input type="hidden" name="code" value={plan.code} />
          <BillingInput label="Nombre" name="name" value={plan.name} />
          <BillingInput label="Precio mensual en centavos" name="priceCents" type="number" value={plan.priceCents} />
          <BillingInput label="Moneda (por ejemplo DOP)" name="currency" value={plan.currency} />
          <BillingInput label="Máximo de estudiantes" name="maxStudents" type="number" value={plan.maxStudents ?? ""} required={false} />
          <BillingInput label="Almacenamiento máximo (MB)" name="maxStorageMb" type="number" value={plan.maxStorageMb ?? ""} required={false} />
          <BillingInput label="Pedidos de IA al mes" name="aiRequestsPerMonth" type="number" value={plan.aiRequestsPerMonth ?? ""} required={false} />
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="catalog" defaultChecked={features.catalog === true} />Catálogo</label>
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="ai" defaultChecked={features.ai === true} />Asistente de IA</label>
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="active" defaultChecked={plan.active} />Disponible para nuevas suscripciones</label>
        </BillingForm></section>;
    })}</div></main>;
}
