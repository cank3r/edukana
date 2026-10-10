import Link from "next/link";
import { AlertCircle, CheckCircle2, ChevronRight } from "lucide-react";
import { Panel } from "./parts";

export type AttentionItem = { id: string; title: string; detail: string; href: string; action: string };

/**
 * «Requiere tu atención»: un renglón por tema (qué pasa y cuánto) y, al tocarlo, la pantalla donde se resuelve.
 * Solo dice «Todo al día» cuando de verdad no hay nada pendiente.
 */
export function Attention({ items, empty }: { items: AttentionItem[]; empty?: { title: string; detail: string } }) {
  const calm = empty ?? { title: "Todo al día", detail: "No hay entregas atrasadas, estudiantes en riesgo, cobros vencidos ni solicitudes sin atender." };
  return (
    <Panel id="requiere-atencion" title="Requiere tu atención" className="h-full">
      {items.length === 0 ? (
        <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4">
          <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-700" size={20} aria-hidden="true" />
          <div>
            <p className="font-semibold text-emerald-900">{calm.title}</p>
            <p className="text-sm text-emerald-800">{calm.detail}</p>
          </div>
        </div>
      ) : (
        <ul className="-mx-2 divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={item.href} className="group flex min-h-11 items-start gap-2.5 rounded-lg px-2 py-2.5 hover:bg-amber-50">
                <AlertCircle className="mt-0.5 shrink-0 text-amber-600" size={18} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-semibold text-slate-950 group-hover:underline">{item.title}</span>
                  <span className="mt-0.5 block text-sm text-slate-600">{item.detail}</span>
                  <span className="sr-only">{item.action}</span>
                </span>
                <ChevronRight className="mt-0.5 shrink-0 text-slate-400 group-hover:text-slate-700" size={18} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
