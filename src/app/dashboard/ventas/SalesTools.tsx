"use client";

import { useActionState, useState } from "react";
import {
  cancelOrderAction,
  confirmOrderAction,
  createCouponAction,
  deleteCouponAction,
  setCouponActiveAction,
  setCourseCatalogAction,
  type SalesState,
} from "@/server/actions/catalog";

const primary = "min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const secondary = "min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 disabled:opacity-60";
const danger = "min-h-11 rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const field = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500";
const label = "block text-sm font-medium text-slate-900";
const empty: SalesState = { ok: false, message: "" };

const STATUS: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Por confirmar", className: "bg-amber-50 text-amber-800" },
  PAID: { label: "Pagado", className: "bg-emerald-50 text-emerald-800" },
  CANCELLED: { label: "Cancelado", className: "bg-slate-200 text-slate-700" },
};
const METHODS = [
  { value: "TRANSFER", label: "Transferencia" },
  { value: "CASH", label: "Efectivo" },
  { value: "CARD", label: "Tarjeta" },
  { value: "OTHER", label: "Otro" },
];

function Notice({ state }: { state: SalesState }) {
  if (!state.message) return null;
  return <p role={state.ok ? "status" : "alert"} className={`mt-3 rounded-lg p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p>;
}

export type OrderView = {
  id: string;
  number: string;
  courseName: string;
  buyerName: string;
  buyerEmail: string;
  amount: string;
  status: string;
  couponCode: string | null;
  createdOn: string;
  paidOn: string;
  paymentMethod: string;
  paymentNote: string;
};

export function OrderItem({ order }: { order: OrderView }) {
  const [panel, setPanel] = useState<"confirm" | "cancel" | null>(null);
  const [confirmState, confirmAction, confirming] = useActionState(confirmOrderAction, empty);
  const [cancelState, cancelAction, cancelling] = useActionState(cancelOrderAction, empty);
  const status = STATUS[order.status] ?? STATUS.PENDING;
  const pending = order.status === "PENDING";
  const result = panel === "cancel" ? cancelState : confirmState;

  return (
    <li className="rounded-xl border border-slate-200 p-4 md:rounded-none md:border-0 md:px-0">
      <div className="md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] md:items-center md:gap-4">
        <div className="min-w-0">
          <p className="font-semibold text-slate-950">{order.buyerName}</p>
          <p className="truncate text-sm text-slate-600">{order.buyerEmail}</p>
          <p className="text-sm text-slate-800">{order.courseName}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-1 font-semibold ${status.className}`}>{status.label}</span>
            <span className="text-slate-600">Pedido {order.number} · {order.createdOn}</span>
          </p>
        </div>
        <div className="mt-2 text-sm md:mt-0">
          <p className="text-lg font-bold text-slate-950">{order.amount}</p>
          {order.couponCode && <p className="text-slate-600">Cupón {order.couponCode}</p>}
          {order.status === "PAID" && (
            <p className="text-slate-600">Pagado el {order.paidOn}{order.paymentMethod ? ` · ${METHODS.find((item) => item.value === order.paymentMethod)?.label ?? "Otro"}` : ""}</p>
          )}
          {order.paymentNote && <p className="text-slate-600">{order.paymentNote}</p>}
        </div>
        {pending && !panel && (
          <div className="mt-3 flex flex-wrap gap-2 md:mt-0 md:justify-end">
            <button type="button" className={primary} onClick={() => setPanel("confirm")}>Confirmar pago</button>
            <button type="button" className={secondary} onClick={() => setPanel("cancel")}>Cancelar</button>
          </div>
        )}
      </div>

      {pending && panel === "confirm" && (
        <form action={confirmAction} className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3">
          <input type="hidden" name="orderId" value={order.id} />
          <p className="text-sm text-slate-800">Confirma solo si ya recibiste <strong>{order.amount}</strong>. {order.buyerName} quedará inscrito en «{order.courseName}» y recibirá su acceso por correo.</p>
          <label className={label}>
            Cómo se pagó
            <select name="method" defaultValue="TRANSFER" className={field}>{METHODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          </label>
          <label className={label}>
            Nota (opcional)
            <input name="note" maxLength={300} placeholder="Ej.: referencia de la transferencia" className={field} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={primary} disabled={confirming}>{confirming ? "Confirmando…" : "Sí, confirmar pago"}</button>
            <button type="button" className={secondary} onClick={() => setPanel(null)}>Volver</button>
          </div>
        </form>
      )}
      {pending && panel === "cancel" && (
        <form action={cancelAction} className="mt-3 space-y-3 rounded-lg bg-red-50/60 p-3">
          <input type="hidden" name="orderId" value={order.id} />
          <p className="text-sm text-slate-800">El pedido {order.number} quedará cancelado y no se podrá confirmar. {order.buyerName} no será inscrito. No se borra nada.</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={danger} disabled={cancelling}>{cancelling ? "Cancelando…" : "Sí, cancelar pedido"}</button>
            <button type="button" className={secondary} onClick={() => setPanel(null)}>Volver</button>
          </div>
        </form>
      )}
      <Notice state={result} />
    </li>
  );
}

export function CouponCreate() {
  const [state, action, pending] = useActionState(createCouponAction, empty);
  return (
    <form action={action} className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className={label}>
        Código
        <input name="code" required minLength={3} maxLength={30} placeholder="BIENVENIDA10" className={`${field} uppercase`} />
      </label>
      <label className={label}>
        Descuento (%)
        <input name="percentOff" type="number" required min={1} max={100} step={1} inputMode="numeric" className={field} />
      </label>
      <label className={label}>
        Cuántas veces se puede usar (opcional)
        <input name="maxUses" type="number" min={1} step={1} inputMode="numeric" placeholder="Sin tope" className={field} />
      </label>
      <label className={label}>
        Último día para usarlo (opcional)
        <input name="expiresOn" type="date" className={field} />
      </label>
      <div className="sm:col-span-2">
        <button type="submit" className={primary} disabled={pending}>{pending ? "Creando…" : "Crear cupón"}</button>
        <Notice state={state} />
      </div>
    </form>
  );
}

export type CouponView = { id: string; code: string; percentOff: number; maxUses: number | null; usedCount: number; orders: number; expiresOn: string | null; expired: boolean; isActive: boolean };

export function CouponItem({ coupon }: { coupon: CouponView }) {
  const [toggleState, toggleAction, toggling] = useActionState(setCouponActiveAction, empty);
  const [deleteState, deleteAction, deleting] = useActionState(deleteCouponAction, empty);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const exhausted = coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses;
  const badge = !coupon.isActive ? ["Desactivado", "bg-slate-200 text-slate-700"] : coupon.expired ? ["Vencido", "bg-red-50 text-red-800"] : exhausted ? ["Agotado", "bg-amber-50 text-amber-800"] : ["Activo", "bg-emerald-50 text-emerald-800"];
  const deletable = coupon.usedCount === 0 && coupon.orders === 0;

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold tracking-wider text-slate-950">{coupon.code} <span className="ml-1 font-semibold tracking-normal text-slate-700">−{coupon.percentOff}%</span></p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge[1]}`}>{badge[0]}</span>
            <span>Usado {coupon.usedCount}{coupon.maxUses !== null ? ` de ${coupon.maxUses}` : ""} {coupon.usedCount === 1 ? "vez" : "veces"}</span>
            {coupon.expiresOn && <span>· Hasta el {coupon.expiresOn}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={toggleAction}>
            <input type="hidden" name="couponId" value={coupon.id} />
            <input type="hidden" name="active" value={String(!coupon.isActive)} />
            <button type="submit" className={secondary} disabled={toggling}>{coupon.isActive ? "Desactivar" : "Activar"}</button>
          </form>
          {deletable && !confirmDelete && <button type="button" className={secondary} onClick={() => setConfirmDelete(true)}>Borrar</button>}
        </div>
      </div>
      {confirmDelete && (
        <form action={deleteAction} className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-red-50/60 p-3 text-sm">
          <input type="hidden" name="couponId" value={coupon.id} />
          <span className="text-slate-800">Nadie lo ha usado. ¿Borrar el cupón {coupon.code}?</span>
          <button type="submit" className={danger} disabled={deleting}>Sí, borrar</button>
          <button type="button" className={secondary} onClick={() => setConfirmDelete(false)}>Volver</button>
        </form>
      )}
      <Notice state={deleteState.message ? deleteState : toggleState} />
    </li>
  );
}

export type CatalogCourseView = { id: string; name: string; teacherName: string; isPublic: boolean; isPublished: boolean; price: string; priceInput: string; imageUrl: string };

export function CatalogCourseItem({ course }: { course: CatalogCourseView }) {
  const [state, action, pending] = useActionState(setCourseCatalogAction, empty);
  const [open, setOpen] = useState(false);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-950">{course.name}</p>
          <p className="text-sm text-slate-600">Con {course.teacherName} · {course.price}</p>
          <p className="mt-1 flex flex-wrap gap-2 text-xs font-semibold">
            <span className={`rounded-full px-2 py-1 ${course.isPublic ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{course.isPublic ? "En el catálogo" : "No está en el catálogo"}</span>
            {!course.isPublished && <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-800">Sin publicar</span>}
          </p>
        </div>
        {!open && <button type="button" className={secondary} onClick={() => setOpen(true)}>Cambiar</button>}
      </div>
      {open && (
        <form action={action} className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3">
          <input type="hidden" name="courseId" value={course.id} />
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-900">
            <input type="checkbox" name="isPublic" defaultChecked={course.isPublic} className="h-5 w-5" />
            Mostrar en el catálogo público
          </label>
          <label className={label}>
            Precio (0 = gratis)
            <input name="price" defaultValue={course.priceInput} inputMode="decimal" className={field} />
          </label>
          <label className={label}>
            Imagen de portada (enlace https, opcional)
            <input name="imageUrl" type="url" defaultValue={course.imageUrl} maxLength={500} placeholder="https://…" className={field} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={primary} disabled={pending}>{pending ? "Guardando…" : "Guardar"}</button>
            <button type="button" className={secondary} onClick={() => setOpen(false)}>Cerrar</button>
          </div>
        </form>
      )}
      <Notice state={state} />
    </li>
  );
}
