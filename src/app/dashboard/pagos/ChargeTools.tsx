"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  cancelChargeAction,
  createChargeAction,
  createGroupChargesAction,
  deleteChargeAction,
  recordPaymentAction,
  searchChargeStudentsAction,
  updateChargeAction,
  voidPaymentAction,
  type FinanceState,
} from "@/server/actions/finance";
import { centsToInput, formatMoney, parseMoneyToCents, type ShownStatus } from "@/server/finance/money";
import { formatDateKey, METHOD_LABEL, STATUS_LABEL } from "./labels";

const primary = "min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const secondary = "min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60";
const danger = "min-h-11 rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const field = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500";
const label = "block text-sm font-medium text-slate-900";
const empty: FinanceState = { ok: false, message: "" };

function Notice({ ok, message, receiptHref }: { ok: boolean; message: string; receiptHref?: string }) {
  if (!message) return null;
  return (
    <div role={ok ? "status" : "alert"} className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg p-3 text-sm ${ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
      <p>{message}</p>
      {ok && receiptHref && <Link className="inline-flex min-h-11 items-center font-semibold text-emerald-900 underline" href={receiptHref}>Ver recibo</Link>}
    </div>
  );
}

type Option = { id: string; name: string };
type Target = { kind: "group" | "course"; id: string; name: string; students: number };

export function CreatePanel({ periods, targets, currency, startOpen }: { periods: Option[]; targets: Target[]; currency: string; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [mode, setMode] = useState<"one" | "group">("one");
  const [result, setResult] = useState<FinanceState>(empty);

  function finished(state: FinanceState) {
    setResult(state);
    setOpen(false);
  }

  if (!open) {
    return (
      <div>
        <button type="button" className={primary} onClick={() => { setResult(empty); setOpen(true); }}>Crear cargo</button>
        <Notice ok={result.ok} message={result.message} />
      </div>
    );
  }
  return (
    <section className="rounded-xl border border-blue-200 bg-white p-4 sm:p-5" aria-labelledby="crear-cargo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="crear-cargo" className="text-lg font-bold text-slate-950">Crear cargo</h2>
        <button type="button" className={secondary} onClick={() => setOpen(false)}>Cerrar</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="A quién le cobras">
        <button type="button" aria-pressed={mode === "one"} className={mode === "one" ? primary : secondary} onClick={() => setMode("one")}>A un estudiante</button>
        <button type="button" aria-pressed={mode === "group"} className={mode === "group" ? primary : secondary} onClick={() => setMode("group")}>A un grupo o curso completo</button>
      </div>
      {mode === "one" ? <OneChargeForm periods={periods} onDone={finished} /> : <GroupChargeForm periods={periods} targets={targets} currency={currency} onDone={finished} />}
    </section>
  );
}

function ChargeFields({ values, onChange, periods }: { values: { concept: string; amount: string; dueDate: string; periodId?: string }; onChange: (name: string, value: string) => void; periods?: Option[] }) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className={`${label} sm:col-span-2`}>
        Concepto
        <input name="concept" required maxLength={160} value={values.concept} onChange={(event) => onChange("concept", event.target.value)} className={`${field} mt-1`} placeholder="Ejemplo: Mensualidad de octubre" autoComplete="off" />
      </label>
      <label className={label}>
        Monto
        <input name="amount" required inputMode="decimal" value={values.amount} onChange={(event) => onChange("amount", event.target.value)} className={`${field} mt-1`} placeholder="3500.00" autoComplete="off" />
      </label>
      <label className={label}>
        Fecha de vencimiento
        <input name="dueDate" type="date" required value={values.dueDate} onChange={(event) => onChange("dueDate", event.target.value)} className={`${field} mt-1`} />
      </label>
      {periods && periods.length > 0 && (
        <label className={`${label} sm:col-span-2`}>
          Período (opcional)
          <select name="periodId" value={values.periodId ?? ""} onChange={(event) => onChange("periodId", event.target.value)} className={`${field} mt-1`}>
            <option value="">Sin período</option>
            {periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

type Candidate = { id: string; name: string; email: string };

function StudentPicker({ selected, onSelect }: { selected: Candidate | null; onSelect: (student: Candidate | null) => void }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ students: Candidate[]; more: boolean; error: string; loaded: boolean }>({ students: [], more: false, error: "", loaded: false });

  useEffect(() => {
    if (selected) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await searchChargeStudentsAction(query);
      if (!cancelled) setFound({ students: result.students, more: result.more, error: result.ok ? "" : result.message, loaded: true });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, selected]);

  if (selected) {
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3">
        <input type="hidden" name="studentId" value={selected.id} />
        <div className="min-w-0">
          <p className="text-xs text-slate-600">Estudiante</p>
          <p className="truncate font-semibold text-slate-950">{selected.name}</p>
          <p className="truncate text-sm text-slate-600">{selected.email}</p>
        </div>
        <button type="button" className={secondary} onClick={() => onSelect(null)}>Cambiar</button>
      </div>
    );
  }
  return (
    <div className="mt-3">
      <label className={label} htmlFor="buscar-estudiante-cargo">Estudiante</label>
      <input id="buscar-estudiante-cargo" type="search" value={query} onChange={(event) => setQuery(event.target.value)} className={`${field} mt-1`} placeholder="Busca por nombre o correo…" autoComplete="off" />
      {found.error && <Notice ok={false} message={found.error} />}
      {found.loaded && !found.error && found.students.length === 0 && (
        <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No encontramos estudiantes activos con ese nombre. Revisa cómo está escrito.</p>
      )}
      {found.students.length > 0 && (
        <ul className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          {found.students.map((student) => (
            <li key={student.id}>
              <button type="button" className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left hover:bg-blue-50 focus:bg-blue-50" onClick={() => onSelect(student)}>
                <span className="font-medium text-slate-950">{student.name}</span>
                <span className="text-sm text-slate-600">{student.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {found.more && <p className="mt-2 text-sm text-slate-600">Hay más resultados. Escribe más letras para acortar la lista.</p>}
    </div>
  );
}

function OneChargeForm({ periods, onDone }: { periods: Option[]; onDone: (state: FinanceState) => void }) {
  const [student, setStudent] = useState<Candidate | null>(null);
  const [values, setValues] = useState({ concept: "", amount: "", dueDate: "", periodId: "" });
  const [state, action, pending] = useActionState(async (previous: FinanceState, formData: FormData) => {
    const result = await createChargeAction(previous, formData);
    if (result.ok) onDone({ ok: true, message: `Cargo creado para ${student?.name ?? "el estudiante"}.` });
    return result;
  }, empty);

  return (
    <form action={action}>
      <StudentPicker selected={student} onSelect={setStudent} />
      <ChargeFields values={values} periods={periods} onChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))} />
      <div className="mt-4">
        <button className={primary} type="submit" disabled={pending || !student}>{pending ? "Creando…" : "Crear cargo"}</button>
        {!student && <p className="mt-2 text-sm text-slate-600">Primero elige al estudiante.</p>}
      </div>
      <Notice ok={state.ok} message={state.ok ? "" : state.message} />
    </form>
  );
}

function GroupChargeForm({ periods, targets, currency, onDone }: { periods: Option[]; targets: Target[]; currency: string; onDone: (state: FinanceState) => void }) {
  const [target, setTarget] = useState("");
  const [values, setValues] = useState({ concept: "", amount: "", dueDate: "", periodId: "" });
  // La clave identifica esta operación: si el formulario se envía dos veces, el servidor crea los cargos una sola vez.
  const [operationKey, setOperationKey] = useState("");
  const [problem, setProblem] = useState("");
  const [state, action, pending] = useActionState(async (previous: FinanceState, formData: FormData) => {
    const result = await createGroupChargesAction(previous, formData);
    if (result.ok) onDone(result);
    return result;
  }, empty);

  const chosen = targets.find((item) => `${item.kind}:${item.id}` === target) ?? null;
  const cents = parseMoneyToCents(values.amount);
  const groups = targets.filter((item) => item.kind === "group");
  const courses = targets.filter((item) => item.kind === "course");

  function review() {
    if (!chosen) return setProblem("Elige un grupo o un curso.");
    if (chosen.students === 0) return setProblem(`«${chosen.name}» no tiene estudiantes activos.`);
    if (values.concept.trim().length < 2) return setProblem("Escribe el concepto del cargo.");
    if (cents === null || cents <= 0) return setProblem("Escribe el monto solo con números, por ejemplo 3500.00.");
    if (!values.dueDate) return setProblem("Elige la fecha de vencimiento.");
    setProblem("");
    setOperationKey(crypto.randomUUID());
  }

  if (targets.length === 0) {
    return <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Todavía no hay grupos ni cursos. Crea uno primero, o cobra a un estudiante a la vez.</p>;
  }

  if (operationKey && chosen && cents !== null) {
    const count = chosen.students;
    return (
      <form action={action} className="mt-3 rounded-lg bg-amber-50 p-4">
        <input type="hidden" name="target" value={target} />
        <input type="hidden" name="concept" value={values.concept} />
        <input type="hidden" name="amount" value={values.amount} />
        <input type="hidden" name="dueDate" value={values.dueDate} />
        <input type="hidden" name="periodId" value={values.periodId} />
        <input type="hidden" name="operationKey" value={operationKey} />
        <p className="font-semibold text-amber-950">
          {count === 1 ? `Se creará 1 cargo de ${formatMoney(cents, currency)}` : `Se crearán ${count} cargos de ${formatMoney(cents, currency)}`}
        </p>
        <p className="mt-1 text-sm text-amber-900">
          «{values.concept.trim()}» para cada estudiante activo de «{chosen.name}», con vencimiento el {formatDateKey(values.dueDate)}. En total: {formatMoney(cents * count, currency)}.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={primary} type="submit" disabled={pending}>{pending ? "Creando…" : count === 1 ? "Sí, crear 1 cargo" : `Sí, crear ${count} cargos`}</button>
          <button className={secondary} type="button" disabled={pending} onClick={() => setOperationKey("")}>Volver a corregir</button>
        </div>
        <Notice ok={state.ok} message={state.ok ? "" : state.message} />
      </form>
    );
  }

  return (
    <div>
      <label className={`${label} mt-3`}>
        Grupo o curso
        <select value={target} onChange={(event) => setTarget(event.target.value)} className={`${field} mt-1`}>
          <option value="">Elige uno…</option>
          {groups.length > 0 && (
            <optgroup label="Grupos">
              {groups.map((item) => <option key={item.id} value={`group:${item.id}`}>{item.name} ({item.students})</option>)}
            </optgroup>
          )}
          {courses.length > 0 && (
            <optgroup label="Cursos">
              {courses.map((item) => <option key={item.id} value={`course:${item.id}`}>{item.name} ({item.students})</option>)}
            </optgroup>
          )}
        </select>
      </label>
      <ChargeFields values={values} periods={periods} onChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))} />
      <div className="mt-4">
        <button className={primary} type="button" onClick={review}>Revisar antes de crear</button>
      </div>
      <Notice ok={false} message={problem} />
    </div>
  );
}

export type ChargeView = {
  id: string;
  studentName: string;
  concept: string;
  periodName: string;
  currency: string;
  amountCents: number;
  paidCents: number;
  balanceCents: number;
  dueKey: string | null;
  status: ShownStatus;
  cancelReason: string;
  payments: Array<{
    id: string;
    amountCents: number;
    paidOn: string;
    method: string;
    note: string;
    recordedByName: string;
    voided: { at: string; reason: string } | null;
    legacy: boolean;
  }>;
};
type PaymentView = ChargeView["payments"][number];

type Panel = "pay" | "edit" | "cancel" | "delete" | null;

export function ChargeItem({ charge, todayKey }: { charge: ChargeView; todayKey: string }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [result, setResult] = useState<FinanceState>(empty);
  const [showHistory, setShowHistory] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const status = STATUS_LABEL[charge.status];
  const cancelled = charge.status === "CANCELLED";
  const money = (cents: number) => formatMoney(cents, charge.currency);
  const hasPayments = charge.paidCents > 0 || charge.payments.length > 0;
  const voidedCount = charge.payments.filter((payment) => payment.voided).length;

  function finished(state: FinanceState) {
    setResult(state);
    setPanel(null);
    setVoiding(null);
    // Tras registrar o anular un pago, el historial queda a la vista con el cambio.
    if (state.receiptHref || panel === null) setShowHistory(true);
  }
  function open(next: Panel) {
    setResult(empty);
    setVoiding(null);
    setPanel(next);
  }

  return (
    <li className={`rounded-xl border p-4 md:rounded-none md:border-0 md:px-0 md:py-4 ${charge.status === "OVERDUE" ? "border-red-200 bg-red-50/40 md:bg-transparent" : "border-slate-200"}`}>
      <div className="md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_auto] md:items-center md:gap-4">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-950">{charge.studentName}</p>
          <p className="text-sm text-slate-700">{charge.concept}{charge.periodName ? ` · ${charge.periodName}` : ""}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className={`rounded-full px-2 py-1 ${status.className}`}>{status.label}</span>
            {charge.dueKey && <span className="font-normal text-slate-600">{charge.status === "OVERDUE" ? "Venció el" : "Vence el"} {formatDateKey(charge.dueKey)}</span>}
          </p>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm md:mt-0">
          <div><dt className="text-xs text-slate-500">Monto</dt><dd className="font-semibold text-slate-950">{money(charge.amountCents)}</dd></div>
          <div><dt className="text-xs text-slate-500">Pagado</dt><dd className="font-medium text-slate-900">{money(charge.paidCents)}</dd></div>
          <div><dt className="text-xs text-slate-500">Debe</dt><dd className="font-semibold text-slate-950">{money(charge.balanceCents)}</dd></div>
        </dl>
        {!panel && (
          <div className="mt-3 flex flex-wrap gap-2 md:mt-0 md:justify-end">
            {!cancelled && charge.balanceCents > 0 && <button type="button" className={primary} onClick={() => open("pay")}>Registrar pago</button>}
            {!cancelled && <button type="button" className={secondary} onClick={() => open("edit")}>Editar</button>}
            {!cancelled && <button type="button" className={secondary} onClick={() => open("cancel")}>Anular</button>}
            {!hasPayments && <button type="button" className={secondary} onClick={() => open("delete")}>Borrar</button>}
          </div>
        )}
      </div>

      {cancelled && charge.cancelReason && <p className="mt-2 text-sm text-slate-700">Motivo de la anulación: {charge.cancelReason}</p>}

      {charge.payments.length > 0 && (
        <details className="mt-2" open={showHistory} onToggle={(event) => setShowHistory(event.currentTarget.open)}>
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-blue-700">
            Historial de pagos ({charge.payments.length}){voidedCount > 0 ? ` · ${voidedCount === 1 ? "1 anulado" : `${voidedCount} anulados`}` : ""}
          </summary>
          <ul className="divide-y divide-slate-100 rounded-lg bg-slate-50 px-3">
            {charge.payments.map((payment) => (
              <PaymentLine
                key={payment.id}
                payment={payment}
                charge={charge}
                voiding={voiding === payment.id}
                onVoid={() => { setResult(empty); setPanel(null); setVoiding(payment.id); }}
                onClose={() => setVoiding(null)}
                onDone={finished}
              />
            ))}
          </ul>
        </details>
      )}

      {panel === "pay" && <PayForm charge={charge} todayKey={todayKey} onDone={finished} onClose={() => setPanel(null)} />}
      {panel === "edit" && <EditForm charge={charge} onDone={finished} onClose={() => setPanel(null)} />}
      {panel === "cancel" && <CancelForm charge={charge} onDone={finished} onClose={() => setPanel(null)} />}
      {panel === "delete" && <DeleteForm charge={charge} onClose={() => setPanel(null)} />}
      <Notice ok={result.ok} message={result.message} receiptHref={result.receiptHref} />
    </li>
  );
}

function PaymentLine({ payment, charge, voiding, onVoid, onClose, onDone }: {
  payment: PaymentView;
  charge: ChargeView;
  voiding: boolean;
  onVoid: () => void;
  onClose: () => void;
  onDone: (state: FinanceState) => void;
}) {
  const money = (cents: number) => formatMoney(cents, charge.currency);
  return (
    <li className="py-3 text-sm text-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={payment.voided ? "text-slate-500 line-through" : ""}>
            <span className="font-semibold">{money(payment.amountCents)}</span> · {formatDateKey(payment.paidOn) || "Sin fecha"} · {METHOD_LABEL[payment.method] ?? "Otro"}
          </p>
          {payment.voided && (
            <p className="mt-1 text-xs font-semibold text-red-800">
              <span className="rounded-full bg-red-50 px-2 py-1">Anulado</span>
              {payment.voided.reason && <span className="ml-2 font-normal text-slate-700">Motivo: {payment.voided.reason}</span>}
            </p>
          )}
          {payment.recordedByName && <p className="text-xs text-slate-600">Lo registró {payment.recordedByName}</p>}
          {payment.legacy && <p className="text-xs text-slate-600">Pago anterior al historial nuevo: no tiene recibo.</p>}
          {payment.note && <p className="text-slate-600">{payment.note}</p>}
        </div>
        {!payment.legacy && !voiding && (
          <div className="flex flex-wrap gap-2">
            <Link className={`${secondary} inline-flex items-center`} href={`/dashboard/pagos/recibo/${encodeURIComponent(payment.id)}`}>Ver recibo</Link>
            {!payment.voided && <button type="button" className={secondary} onClick={onVoid}>Anular pago</button>}
          </div>
        )}
      </div>
      {voiding && <VoidPaymentForm payment={payment} charge={charge} onDone={onDone} onClose={onClose} />}
    </li>
  );
}

function VoidPaymentForm({ payment, charge, onDone, onClose }: { payment: PaymentView; charge: ChargeView; onDone: (state: FinanceState) => void; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [state, action, pending] = useActionState(async (previous: FinanceState, formData: FormData) => {
    const result = await voidPaymentAction(previous, formData);
    if (result.ok) onDone(result);
    return result;
  }, empty);
  const money = (cents: number) => formatMoney(cents, charge.currency);
  const owedAfter = Math.min(charge.amountCents, charge.balanceCents + payment.amountCents);

  return (
    <form action={action} className="mt-3 rounded-lg bg-amber-50 p-4">
      <input type="hidden" name="paymentId" value={payment.id} />
      <p className="text-sm font-semibold text-amber-950">
        Se anulará el pago de {money(payment.amountCents)} del {formatDateKey(payment.paidOn) || "día registrado"}.{" "}
        {charge.status === "CANCELLED"
          ? "El cargo ya está anulado: este dinero dejará de contar como cobrado."
          : `${charge.studentName} volverá a deber ${money(owedAfter)} por «${charge.concept}».`}{" "}
        El pago no se borra: queda en el historial y su recibo dirá «Anulado». No se puede deshacer.
      </p>
      <label className={`${label} mt-3`}>
        ¿Por qué se anula el pago?
        <input name="reason" required maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} className={`${field} mt-1`} placeholder="Ejemplo: la transferencia fue rechazada" autoComplete="off" />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={danger} type="submit" disabled={pending}>{pending ? "Anulando…" : "Sí, anular pago"}</button>
        <button className={secondary} type="button" disabled={pending} onClick={onClose}>No anular</button>
      </div>
      <Notice ok={state.ok} message={state.ok ? "" : state.message} />
    </form>
  );
}

type PanelProps = { charge: ChargeView; onDone: (state: FinanceState) => void; onClose: () => void };

function PayForm({ charge, todayKey, onDone, onClose }: PanelProps & { todayKey: string }) {
  const [values, setValues] = useState({ amount: centsToInput(charge.balanceCents), paidOn: todayKey, method: "CASH", note: "" });
  const [state, action, pending] = useActionState(async (previous: FinanceState, formData: FormData) => {
    const result = await recordPaymentAction(previous, formData);
    if (result.ok) onDone(result);
    return result;
  }, empty);
  const set = (name: string, value: string) => setValues((current) => ({ ...current, [name]: value }));

  return (
    <form action={action} className="mt-3 rounded-lg bg-slate-50 p-4">
      <input type="hidden" name="chargeId" value={charge.id} />
      <p className="text-sm font-semibold text-slate-950">Registrar pago de {charge.studentName}</p>
      <p className="text-sm text-slate-600">Debe {formatMoney(charge.balanceCents, charge.currency)}. Puedes registrar una parte o todo.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className={label}>
          Monto recibido
          <input name="amount" required inputMode="decimal" value={values.amount} onChange={(event) => set("amount", event.target.value)} className={`${field} mt-1`} autoComplete="off" />
        </label>
        <label className={label}>
          Fecha del pago
          <input name="paidOn" type="date" required max={todayKey} value={values.paidOn} onChange={(event) => set("paidOn", event.target.value)} className={`${field} mt-1`} />
        </label>
        <label className={label}>
          Forma de pago
          <select name="method" value={values.method} onChange={(event) => set("method", event.target.value)} className={`${field} mt-1`}>
            {Object.entries(METHOD_LABEL).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </label>
        <label className={`${label} sm:col-span-3`}>
          Nota (opcional)
          <input name="note" maxLength={300} value={values.note} onChange={(event) => set("note", event.target.value)} className={`${field} mt-1`} placeholder="Ejemplo: número de recibo o de transferencia" autoComplete="off" />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={primary} type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar pago"}</button>
        <button className={secondary} type="button" disabled={pending} onClick={onClose}>Cancelar</button>
      </div>
      <Notice ok={state.ok} message={state.ok ? "" : state.message} />
    </form>
  );
}

function EditForm({ charge, onDone, onClose }: PanelProps) {
  const [values, setValues] = useState({ concept: charge.concept, amount: centsToInput(charge.amountCents), dueDate: charge.dueKey ?? "" });
  const [state, action, pending] = useActionState(async (previous: FinanceState, formData: FormData) => {
    const result = await updateChargeAction(previous, formData);
    if (result.ok) onDone(result);
    return result;
  }, empty);

  return (
    <form action={action} className="mt-3 rounded-lg bg-slate-50 p-4">
      <input type="hidden" name="chargeId" value={charge.id} />
      <p className="text-sm font-semibold text-slate-950">Editar cargo de {charge.studentName}</p>
      {charge.paidCents > 0 && <p className="text-sm text-slate-600">Ya se pagaron {formatMoney(charge.paidCents, charge.currency)}: el monto no puede quedar por debajo.</p>}
      <ChargeFields values={values} onChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))} />
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={primary} type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar cambios"}</button>
        <button className={secondary} type="button" disabled={pending} onClick={onClose}>Cancelar</button>
      </div>
      <Notice ok={state.ok} message={state.ok ? "" : state.message} />
    </form>
  );
}

function CancelForm({ charge, onDone, onClose }: PanelProps) {
  const [reason, setReason] = useState("");
  const [state, action, pending] = useActionState(async (previous: FinanceState, formData: FormData) => {
    const result = await cancelChargeAction(previous, formData);
    if (result.ok) onDone(result);
    return result;
  }, empty);

  return (
    <form action={action} className="mt-3 rounded-lg bg-amber-50 p-4">
      <input type="hidden" name="chargeId" value={charge.id} />
      <p className="text-sm font-semibold text-amber-950">
        {charge.studentName} dejará de deber {formatMoney(charge.balanceCents, charge.currency)} por «{charge.concept}». El cargo queda guardado como anulado
        {charge.paidCents > 0 ? ` y los ${formatMoney(charge.paidCents, charge.currency)} ya pagados siguen en su historial` : ""}. No se puede deshacer.
      </p>
      <label className={`${label} mt-3`}>
        ¿Por qué se anula?
        <input name="reason" required maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} className={`${field} mt-1`} placeholder="Ejemplo: se cobró dos veces por error" autoComplete="off" />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={danger} type="submit" disabled={pending}>{pending ? "Anulando…" : "Sí, anular cargo"}</button>
        <button className={secondary} type="button" disabled={pending} onClick={onClose}>No anular</button>
      </div>
      <Notice ok={state.ok} message={state.ok ? "" : state.message} />
    </form>
  );
}

function DeleteForm({ charge, onClose }: { charge: ChargeView; onClose: () => void }) {
  const [state, action, pending] = useActionState(deleteChargeAction, empty);
  return (
    <form action={action} className="mt-3 rounded-lg bg-red-50 p-4">
      <input type="hidden" name="chargeId" value={charge.id} />
      <p className="text-sm font-semibold text-red-900">
        Se borrará el cargo «{charge.concept}» de {charge.studentName} por {formatMoney(charge.amountCents, charge.currency)}. No tiene pagos, así que no se pierde ningún historial. No se puede deshacer.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={danger} type="submit" disabled={pending}>{pending ? "Borrando…" : "Sí, borrar cargo"}</button>
        <button className={secondary} type="button" disabled={pending} onClick={onClose}>No borrar</button>
      </div>
      <Notice ok={state.ok} message={state.ok ? "" : state.message} />
    </form>
  );
}
