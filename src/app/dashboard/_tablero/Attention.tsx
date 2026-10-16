import Link from "next/link";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Panel } from "./parts";

export type AttentionItem = { id: string; title: string; detail: string; href: string; action: string };

/** «Requiere tu atención» en formato compacto: lo que hay que resolver y el botón para hacerlo. */
export function Attention({ items, empty }: { items: AttentionItem[]; empty?: { title: string; detail: string } }) {
  const calm = empty ?? { title: "Todo al día", detail: "No hay pendientes que requieran tu atención ahora." };
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
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 shrink-0 text-amber-700" size={18} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-slate-950">{item.title}</p>
                  <p className="mt-0.5 text-sm text-slate-700">{item.detail}</p>
                  <Link href={item.href} className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-amber-300 bg-white px-3 text-sm font-semibold text-slate-900 hover:border-amber-500">
                    {item.action}
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
