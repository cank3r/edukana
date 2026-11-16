import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import type { FirstStep } from "@/server/first-steps";

/** Guía de arranque para quien administra. Quien la muestra decide si toca verla (ver `getFirstStepsGuide`). */
export function FirstSteps({ steps }: { steps: FirstStep[] }) {
  const done = steps.filter((step) => step.done).length;
  if (done === steps.length) return null;
  const next = steps.find((step) => !step.done);
  return (
    <section className="mb-8 rounded-2xl border border-blue-200 bg-blue-50 p-5" aria-labelledby="primeros-pasos">
      <h2 id="primeros-pasos" className="text-lg font-bold text-slate-950">Primeros pasos</h2>
      <p className="mt-1 text-sm text-slate-700">Llevas {done} de {steps.length}. Sigue el orden: cada paso prepara el siguiente.</p>
      <ol className="mt-4 space-y-2">
        {steps.map((step, index) => {
          const isNext = step.id === next?.id;
          return (
            <li key={step.id} className={`rounded-xl border bg-white p-4 ${isNext ? "border-blue-500" : "border-slate-200"}`}>
              <div className="flex items-start gap-3">
                {step.done ? <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={22} aria-hidden="true" /> : <Circle className="mt-0.5 shrink-0 text-slate-400" size={22} aria-hidden="true" />}
                <div className="min-w-0 flex-1">
                  <p className={`font-semibold ${step.done ? "text-slate-500 line-through" : "text-slate-950"}`}>
                    <span className="sr-only">{step.done ? "Hecho: " : "Pendiente: "}</span>{index + 1}. {step.title}
                  </p>
                  {!step.done && <p className="mt-1 text-sm text-slate-600">{step.detail}</p>}
                  {isNext && <Link href={step.href} className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">{step.action}</Link>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
