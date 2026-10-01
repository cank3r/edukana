"use client";

import { useActionState } from "react";
import {
  createAdmission,
  createAnnouncement,
  createCourseModule,
  savePayment,
  updateInstitution,
  type ActionState,
} from "@/app/dashboard/actions";

const initialState: ActionState = { ok: false, message: "" };
const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500";
const button = "rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60";

function Feedback({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return <p role="status" className={`rounded-lg px-3 py-2 text-sm ${state.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{state.message}</p>;
}

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return <button className={button} disabled={pending} type="submit">{pending ? "Guardando…" : children}</button>;
}

export function CourseModuleForm({ courseId }: { courseId: string }) {
  const [state, action, pending] = useActionState(createCourseModule, initialState);
  return (
    <form action={action} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <input name="courseId" type="hidden" value={courseId} />
      <div><label className="mb-1 block text-sm font-medium" htmlFor="module-title">Título</label><input className={input} id="module-title" name="title" required maxLength={120} /></div>
      <div><label className="mb-1 block text-sm font-medium" htmlFor="module-description">Descripción</label><input className={input} id="module-description" name="description" maxLength={500} /></div>
      <div><label className="mb-1 block text-sm font-medium" htmlFor="module-content">Contenido</label><textarea className={input} id="module-content" name="content" required minLength={10} maxLength={20000} rows={5} /></div>
      <label className="flex items-center gap-2 text-sm"><input name="isPublished" type="checkbox" defaultChecked /> Publicar inmediatamente</label>
      <Feedback state={state} /><Submit pending={pending}>Guardar contenido</Submit>
    </form>
  );
}

export function AnnouncementForm() {
  const [state, action, pending] = useActionState(createAnnouncement, initialState);
  return (
    <form action={action} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div><label className="mb-1 block text-sm font-medium" htmlFor="announcement-title">Título</label><input className={input} id="announcement-title" name="title" required maxLength={140} /></div>
      <div><label className="mb-1 block text-sm font-medium" htmlFor="announcement-content">Comunicado</label><textarea className={input} id="announcement-content" name="content" required minLength={10} maxLength={10000} rows={4} /></div>
      <div><label className="mb-1 block text-sm font-medium" htmlFor="announcement-audience">Audiencia</label><select className={input} id="announcement-audience" name="audience" defaultValue="ALL"><option value="ALL">Toda la comunidad</option><option value="ROLE">Un rol específico</option></select></div>
      <div><label className="mb-1 block text-sm font-medium" htmlFor="announcement-role">Rol (si aplica)</label><select className={input} id="announcement-role" name="audienceId" defaultValue=""><option value="">No aplica</option><option value="STUDENT">Estudiantes</option><option value="TEACHER">Docentes</option><option value="PARENT">Tutores</option></select></div>
      <label className="flex items-center gap-2 text-sm"><input name="isPinned" type="checkbox" /> Fijar anuncio</label>
      <Feedback state={state} /><Submit pending={pending}>Publicar anuncio</Submit>
    </form>
  );
}

export function AdmissionForm() {
  const [state, action, pending] = useActionState(createAdmission, initialState);
  return (
    <form action={action} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <div><label className="mb-1 block text-sm font-medium" htmlFor="admission-name">Nombre completo</label><input className={input} id="admission-name" name="name" required maxLength={120} /></div>
      <div><label className="mb-1 block text-sm font-medium" htmlFor="admission-email">Correo</label><input className={input} id="admission-email" name="email" type="email" required maxLength={200} /></div>
      <div><label className="mb-1 block text-sm font-medium" htmlFor="admission-phone">Teléfono</label><input className={input} id="admission-phone" name="phone" maxLength={30} /></div>
      <div><label className="mb-1 block text-sm font-medium" htmlFor="admission-program">Programa de interés</label><input className={input} id="admission-program" name="programInterest" maxLength={120} /></div>
      <div><label className="mb-1 block text-sm font-medium" htmlFor="admission-source">Origen</label><select className={input} id="admission-source" name="source"><option value="web">Web</option><option value="referido">Referido</option><option value="presencial">Presencial</option><option value="otro">Otro</option></select></div>
      <div className="sm:col-span-2"><label className="mb-1 block text-sm font-medium" htmlFor="admission-notes">Notas</label><textarea className={input} id="admission-notes" name="notes" maxLength={2000} rows={3} /></div>
      <div className="space-y-3 sm:col-span-2"><Feedback state={state} /><Submit pending={pending}>Registrar solicitud</Submit></div>
    </form>
  );
}

type Option = { id: string; name: string };
type PaymentInitial = { id: string; studentId: string | null; periodId: string | null; concept: string; amount: number; currency: string; dueDate: string; status: string; notes: string | null };
export function PaymentForm({ students, periods, payment }: { students: Option[]; periods: Option[]; payment?: PaymentInitial }) {
  const [state, action, pending] = useActionState(savePayment, initialState);
  return (
    <form action={action} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
      {payment && <input type="hidden" name="paymentId" value={payment.id} />}
      <div><label className="mb-1 block text-sm font-medium" htmlFor={`payment-student-${payment?.id ?? "new"}`}>Estudiante</label><select className={input} id={`payment-student-${payment?.id ?? "new"}`} name="studentId" defaultValue={payment?.studentId ?? ""}><option value="">Cargo general</option>{students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      <div><label className="mb-1 block text-sm font-medium" htmlFor={`payment-period-${payment?.id ?? "new"}`}>Período</label><select className={input} id={`payment-period-${payment?.id ?? "new"}`} name="periodId" defaultValue={payment?.periodId ?? ""}><option value="">Sin período</option>{periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div><label className="mb-1 block text-sm font-medium" htmlFor={`payment-concept-${payment?.id ?? "new"}`}>Concepto</label><input className={input} id={`payment-concept-${payment?.id ?? "new"}`} name="concept" required maxLength={160} defaultValue={payment?.concept} /></div>
      <div className="grid grid-cols-2 gap-2"><div><label className="mb-1 block text-sm font-medium" htmlFor={`payment-amount-${payment?.id ?? "new"}`}>Monto</label><input className={input} id={`payment-amount-${payment?.id ?? "new"}`} name="amount" type="number" min="0.01" step="0.01" required defaultValue={payment?.amount} /></div><div><label className="mb-1 block text-sm font-medium" htmlFor={`payment-currency-${payment?.id ?? "new"}`}>Moneda</label><select className={input} id={`payment-currency-${payment?.id ?? "new"}`} name="currency" defaultValue={payment?.currency ?? "DOP"}><option>DOP</option><option>USD</option></select></div></div>
      <div><label className="mb-1 block text-sm font-medium" htmlFor={`payment-due-${payment?.id ?? "new"}`}>Vencimiento</label><input className={input} id={`payment-due-${payment?.id ?? "new"}`} name="dueDate" type="date" defaultValue={payment?.dueDate} /></div>
      <div><label className="mb-1 block text-sm font-medium" htmlFor={`payment-status-${payment?.id ?? "new"}`}>Estado</label><select className={input} id={`payment-status-${payment?.id ?? "new"}`} name="status" defaultValue={payment?.status ?? "PENDING"}><option value="PENDING">Pendiente</option><option value="PAID">Pagado</option><option value="PARTIAL">Parcial</option><option value="OVERDUE">Vencido</option><option value="CANCELLED">Cancelado</option></select></div>
      <div className="sm:col-span-2"><label className="mb-1 block text-sm font-medium" htmlFor={`payment-notes-${payment?.id ?? "new"}`}>Notas</label><input className={input} id={`payment-notes-${payment?.id ?? "new"}`} name="notes" maxLength={500} defaultValue={payment?.notes ?? ""} /></div>
      <div className="space-y-3 sm:col-span-2"><Feedback state={state} /><Submit pending={pending}>{payment ? "Actualizar pago" : "Registrar pago"}</Submit></div>
    </form>
  );
}

export function InstitutionForm({ institution }: { institution: { name: string; type: string; domain: string | null; timezone: string; language: string } }) {
  const [state, action, pending] = useActionState(updateInstitution, initialState);
  return (
    <form action={action} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><label className="mb-1 block text-sm font-medium" htmlFor="institution-name">Nombre</label><input className={input} defaultValue={institution.name} id="institution-name" name="name" required maxLength={160} /></div>
      <div><label className="mb-1 block text-sm font-medium" htmlFor="institution-type">Tipo</label><select className={input} defaultValue={institution.type} id="institution-type" name="type"><option value="SCHOOL">Colegio / Escuela</option><option value="UNIVERSITY">Universidad</option><option value="INSTITUTE">Instituto técnico</option><option value="ACADEMY">Academia</option><option value="OTHER">Otro</option></select></div>
      <div><label className="mb-1 block text-sm font-medium" htmlFor="institution-domain">Dominio</label><input className={input} defaultValue={institution.domain ?? ""} id="institution-domain" name="domain" maxLength={160} placeholder="institucion.edu" /></div>
      <div><label className="mb-1 block text-sm font-medium" htmlFor="institution-timezone">Zona horaria</label><input className={input} defaultValue={institution.timezone} id="institution-timezone" name="timezone" required maxLength={80} /></div>
      <div><label className="mb-1 block text-sm font-medium" htmlFor="institution-language">Idioma</label><select className={input} defaultValue={institution.language} id="institution-language" name="language"><option value="es">Español</option><option value="en">Inglés</option></select></div>
      <div className="space-y-3 sm:col-span-2"><Feedback state={state} /><Submit pending={pending}>Guardar configuración</Submit></div>
    </form>
  );
}
