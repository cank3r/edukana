"use client";

import { BrandingForm } from "@/components/platform/BrandingForm";
import Link from "next/link";
import { useActionState, useState } from "react";
import { createInstitutionAction, type PlatformActionState } from "@/server/actions/platform";
import { suggestSlug } from "@/server/platform/slug";

const primary = "min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60";
const secondary = "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800";
const fieldClass = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500";
const hint = "mt-1 block text-sm font-normal text-slate-600";
const empty: PlatformActionState = { ok: false, message: "" };

type Option = { value: string; label: string };

export function NewInstitutionForm({ types }: { types: Option[] }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  /** Mientras no se edite a mano, el identificador sigue al nombre. */
  const [slugEdited, setSlugEdited] = useState(false);
  const [created, setCreated] = useState<{ name: string; slug: string; message: string; institutionId: string } | null>(null);
  const [state, action, pending] = useActionState(async (previous: PlatformActionState, data: FormData) => {
    const result = await createInstitutionAction(previous, data);
    if (result.ok && result.institutionId) setCreated({ institutionId: result.institutionId, name: String(data.get("name") ?? ""), slug: String(data.get("slug") ?? ""), message: result.message });
    return result;
  }, empty);

  if (created) {
    const loginLink = `${window.location.origin}/login?institucion=${created.slug}`;
    return (
      <section className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-emerald-900">{created.name} ya existe en Edukana</h2>
        <p className="text-sm text-emerald-900">{created.message}</p>
        <p className="text-sm text-emerald-900">
          Enlace de entrada con su nombre y colores, para compartir con la institución:
          <span className="mt-1 block break-all font-mono text-sm">{loginLink}</span>
        </p>
        <div className="rounded-lg bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Marca</h2>
          <p className="mb-3 text-sm text-slate-600">La primera invitación ya usa el nombre de la institución. Configura ahora el logo, el color y el dominio para los próximos correos.</p>
          <BrandingForm institutionId={created.institutionId} values={{ name: created.name, logoUrl: null, brandColor: null, domain: null, hideEdukanaBrand: false }} />
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={`/operador/${created.institutionId}`} className={secondary}>Ver ficha de la institución</Link>
          <Link href="/operador" className={secondary}>Ver instituciones</Link>
          <button type="button" className={secondary} onClick={() => { setCreated(null); setName(""); setSlug(""); setSlugEdited(false); }}>Crear otra</button>
        </div>
      </section>
    );
  }

  return (
    <form action={action} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <label className="block text-sm font-medium text-slate-900">
        Nombre de la institución
        <input name="name" value={name} required minLength={3} maxLength={160} autoComplete="organization" className={fieldClass}
          onChange={(event) => { setName(event.target.value); if (!slugEdited) setSlug(suggestSlug(event.target.value)); }} />
      </label>

      <label className="block text-sm font-medium text-slate-900">
        Identificador
        <input name="slug" value={slug} required minLength={3} maxLength={63} pattern="[a-z0-9]+(-[a-z0-9]+)*" className={`${fieldClass} font-mono`}
          autoCapitalize="none" autoCorrect="off" spellCheck={false}
          onChange={(event) => { setSlug(event.target.value.toLowerCase()); setSlugEdited(true); }} />
        <span className={hint}>
          Nombre corto y único que identifica a la institución dentro de Edukana. Va en su enlace de entrada
          (<span className="font-mono">/login?institucion={slug || "nombre-corto"}</span>). Se sugiere a partir del nombre;
          usa solo letras minúsculas sin tildes, números y guiones. Por ahora no se puede cambiar después.
        </span>
        {slugEdited && (
          <button type="button" className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline"
            onClick={() => { setSlug(suggestSlug(name)); setSlugEdited(false); }}>
            Volver al sugerido
          </button>
        )}
      </label>

      <label className="block text-sm font-medium text-slate-900">
        Tipo de institución
        <select name="type" defaultValue="INSTITUTE" className={fieldClass}>
          {types.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>

      <fieldset className="space-y-4 rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-sm font-semibold text-slate-900">Primer administrador</legend>
        <label className="block text-sm font-medium text-slate-900">
          Nombre completo
          <input name="adminName" required minLength={3} maxLength={120} autoComplete="off" className={fieldClass} />
        </label>
        <label className="block text-sm font-medium text-slate-900">
          Correo
          <input name="adminEmail" type="email" required maxLength={200} autoComplete="off" className={fieldClass} />
          <span className={hint}>Le llega un enlace para crear su contraseña, válido 7 días. Si ya usa Edukana en otra institución, entra con su contraseña de siempre.</span>
        </label>
      </fieldset>

      <button className={primary} type="submit" disabled={pending}>{pending ? "Creando…" : "Crear institución y enviar invitación"}</button>
      {state.message && !state.ok && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{state.message}</p>}
    </form>
  );
}
