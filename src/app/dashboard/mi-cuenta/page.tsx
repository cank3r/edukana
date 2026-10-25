import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { accountStudentsFor, getStudentAccount } from "@/server/finance/charges";
import { formatMoney } from "@/server/finance/money";
import { formatDateKey, METHOD_LABEL, STATUS_LABEL } from "../pagos/labels";

export const dynamic = "force-dynamic";

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] ?? "" : value ?? "");

/** Estado de cuenta, solo lectura: el estudiante ve el suyo; el tutor, el de los hijos que su vínculo permite. */
export default async function MiCuentaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const viewer = { id: user.id, institutionId: user.institutionId, role: user.role };
  // Quién puede ver qué cuenta se decide en `src/server/finance/charges.ts` (rol, vínculo y permiso del tutor).
  const students = await accountStudentsFor(viewer);
  const isParent = user.role === "PARENT";

  if (students.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-8">
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>{isParent ? "Estado de cuenta" : "Mi cuenta"}</h1>
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          {isParent
            ? "Todavía no tienes permiso para ver el estado de cuenta de tus hijos. Pídelo en la administración de la institución."
            : "Aquí se muestra el estado de cuenta de los estudiantes. Tu usuario no tiene uno."}
        </p>
        <Link className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline" href="/dashboard">Volver al inicio</Link>
      </div>
    );
  }

  const requested = one((await searchParams).estudiante);
  const chosen = students.find((student) => student.id === requested) ?? students[0];
  const account = await getStudentAccount(viewer, chosen.id);
  if (!account) redirect("/dashboard");
  const money = (cents: number) => formatMoney(cents, account.currency);
  const open = account.charges.filter((charge) => charge.balanceCents > 0);
  const payments = account.charges
    .flatMap((charge) => charge.payments.map((payment) => ({ ...payment, concept: charge.concept, currency: charge.currency })))
    .sort((a, b) => b.paidOn.localeCompare(a.paidOn));

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>{isParent ? `Cuenta de ${account.student.name}` : "Mi cuenta"}</h1>
        <p className="mt-1 text-sm text-slate-600">Lo que se debe, lo que ya venció y los pagos recibidos. Para pagar, acércate a la administración.</p>
      </header>

      {students.length > 1 && (
        <nav className="flex flex-wrap gap-2" aria-label="Elegir hijo">
          {students.map((student) => (
            <Link
              key={student.id}
              href={`/dashboard/mi-cuenta?estudiante=${encodeURIComponent(student.id)}`}
              aria-current={student.id === chosen.id ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-lg px-4 py-2.5 font-semibold ${student.id === chosen.id ? "bg-blue-600 text-white" : "border border-slate-300 bg-white text-slate-800"}`}
            >
              {student.name}
            </Link>
          ))}
        </nav>
      )}

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: isParent ? "Debe" : "Debes", value: money(account.owedCents), tone: "text-slate-950" },
          { label: "Vencido", value: money(account.overdueCents), tone: account.overdueCents > 0 ? "text-red-700" : "text-slate-950" },
          { label: "Pagado", value: money(account.paidCents), tone: "text-slate-950" },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <dt className="text-xs font-medium text-slate-600">{item.label}</dt>
            <dd className={`mt-1 text-2xl font-bold ${item.tone}`}>{item.value}</dd>
          </div>
        ))}
      </dl>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="por-pagar">
        <h2 id="por-pagar" className="text-lg font-bold text-slate-950">Por pagar ({open.length})</h2>
        {open.length === 0 ? (
          <p className="mt-2 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">
            {account.charges.length === 0 ? "No hay cargos registrados. Cuando la institución cree uno, aparecerá aquí." : "Todo al día: no hay nada pendiente de pago."}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {open.map((charge) => (
              <li key={charge.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-950">{charge.concept}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold">
                    <span className={`rounded-full px-2 py-1 ${STATUS_LABEL[charge.status].className}`}>{STATUS_LABEL[charge.status].label}</span>
                    {charge.dueKey && <span className="font-normal text-slate-600">{charge.status === "OVERDUE" ? "Venció el" : "Vence el"} {formatDateKey(charge.dueKey)}</span>}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-950">{formatMoney(charge.balanceCents, charge.currency)}</p>
                  {charge.paidCents > 0 && <p className="text-xs text-slate-600">de {formatMoney(charge.amountCents, charge.currency)}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="historial">
        <h2 id="historial" className="text-lg font-bold text-slate-950">Historial</h2>
        {account.charges.length === 0 ? (
          <p className="mt-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Aquí verás cada cargo y cada pago recibido.</p>
        ) : (
          <>
            <h3 className="mt-3 text-sm font-semibold text-slate-700">Pagos recibidos</h3>
            {payments.length === 0 ? (
              <p className="mt-1 text-sm text-slate-600">Todavía no se ha registrado ningún pago.</p>
            ) : (
              <ul className="mt-1 divide-y divide-slate-100">
                {payments.map((payment) => (
                  <li key={payment.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0 text-slate-800">
                      {payment.concept}
                      <span className="block text-slate-600">{formatDateKey(payment.paidOn) || "Sin fecha"} · {METHOD_LABEL[payment.method] ?? "Otro"}</span>
                    </span>
                    <span className="font-semibold text-slate-950">{formatMoney(payment.amountCents, payment.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
            <h3 className="mt-4 text-sm font-semibold text-slate-700">Todos los cargos</h3>
            <ul className="mt-1 divide-y divide-slate-100">
              {account.charges.map((charge) => (
                <li key={charge.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 text-slate-800">
                    {charge.concept}
                    <span className="block text-slate-600">
                      {STATUS_LABEL[charge.status].label}
                      {charge.dueKey ? ` · Vencimiento: ${formatDateKey(charge.dueKey)}` : ""}
                    </span>
                  </span>
                  <span className="font-semibold text-slate-950">{formatMoney(charge.amountCents, charge.currency)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
