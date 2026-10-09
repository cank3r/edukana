"use client";

import { useActionState, useState, type ChangeEvent } from "react";
import { requestCourseAction, type CheckoutState } from "@/server/actions/catalog";
import { formatMoney } from "@/server/finance/money";

const field = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500";
const initial: CheckoutState = { ok: false, message: "" };

/** Formulario de inscripción (gratis) o de pedido (con precio). */
export function EnrollForm({ slug, courseId, free }: { slug: string; courseId: string; free: boolean }) {
  const [state, action, pending] = useActionState(requestCourseAction, initial);
  // Controlados: si algo falla, lo escrito no se borra al recibir la respuesta.
  const [values, setValues] = useState({ name: "", email: "", coupon: "" });
  const bind = (name: keyof typeof values) => ({ name, value: values[name], onChange: (event: ChangeEvent<HTMLInputElement>) => setValues((current) => ({ ...current, [name]: event.target.value })) });

  if (state.ok && state.kind === "order") {
    return (
      <div className="mt-3 space-y-3 text-sm" role="status" aria-live="polite">
        <p className="rounded-lg bg-emerald-50 p-3 text-emerald-800">{state.message}</p>
        <dl className="space-y-2 rounded-lg bg-slate-50 p-3">
          <div><dt className="text-xs text-slate-500">Número de pedido</dt><dd className="text-xl font-bold tracking-wider text-slate-950">{state.orderNumber}</dd></div>
          <div>
            <dt className="text-xs text-slate-500">Total a pagar</dt>
            <dd className="text-lg font-bold text-slate-950">
              {formatMoney(state.amountCents, state.currency)}
              {state.amountCents < state.priceCents && <span className="ml-2 text-sm font-normal text-slate-500 line-through">{formatMoney(state.priceCents, state.currency)}</span>}
            </dd>
          </div>
        </dl>
        <div>
          <p className="font-semibold text-slate-900">Cómo pagar</p>
          <p className="mt-1 whitespace-pre-line text-slate-700">{state.instructions}</p>
        </div>
        <p className="text-slate-600">Cuando la institución confirme tu pago, te llegará un correo para entrar al curso.</p>
      </div>
    );
  }
  if (state.ok) {
    return <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{state.message}</p>;
  }

  return (
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="courseId" value={courseId} />
      {/* Campo trampa para robots: oculto para personas y lectores de pantalla. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>Sitio web<input name="website" tabIndex={-1} autoComplete="off" defaultValue="" /></label>
      </div>
      <label className="block text-sm font-medium text-slate-900">
        Nombre completo
        <input {...bind("name")} required minLength={3} maxLength={120} autoComplete="name" className={field} />
      </label>
      <label className="block text-sm font-medium text-slate-900">
        Correo
        <input {...bind("email")} type="email" required maxLength={254} autoComplete="email" inputMode="email" className={field} />
      </label>
      {!free && (
        <details>
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-blue-700">¿Tienes un cupón de descuento?</summary>
          <label className="block text-sm font-medium text-slate-900">
            Cupón
            <input {...bind("coupon")} maxLength={40} autoComplete="off" className={`${field} uppercase`} />
          </label>
        </details>
      )}
      <button type="submit" disabled={pending} className="flex min-h-11 w-full items-center justify-center rounded-lg bg-blue-600 px-4 font-semibold text-white disabled:opacity-60">
        {pending ? "Enviando…" : free ? "Inscribirme gratis" : "Comprar curso"}
      </button>
      <p className="text-xs text-slate-500">
        {free ? "Te enviaremos por correo cómo entrar al curso." : "Primero registramos tu pedido; luego te decimos cómo pagar. Aún no se cobra nada."}
      </p>
      {state.message && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{state.message}</p>}
    </form>
  );
}
