import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { roleLabel } from "@/lib/ux";
import { ImageUploader } from "@/components/dashboard/ImageUploader";
import { OwnDataForm, OwnPasswordForm } from "./ProfileForms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mi perfil · Edukana" };

export default async function OwnProfilePage() {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) redirect("/login");
  const me = await db.user.findFirst({
    where: { id: user.id, institutionId: user.institutionId },
    select: {
      name: true,
      email: true,
      phone: true,
      avatarUrl: true,
      role: true,
      institution: { select: { name: true } },
      identity: { select: { passwordHash: true } },
    },
  });
  if (!me) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Mi perfil</h1>
        <p className="mt-1 text-sm text-slate-600">Revisa tus datos, corrígelos y cambia tu contraseña cuando lo necesites.</p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="perfil-cuenta">
        <h2 id="perfil-cuenta" className="text-lg font-bold text-slate-950">Datos de acceso</h2>
        <dl className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="font-medium text-slate-600">Correo</dt>
            <dd className="break-words text-base font-semibold text-slate-950">{me.email}</dd>
            <dd className="text-slate-600">Es la cuenta con la que entras a Edukana. Si necesitas cambiarlo, pídelo a la administración de tu institución.</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-600">Rol</dt>
            <dd className="text-base font-semibold text-slate-950">{roleLabel(me.role)}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-600">Institución</dt>
            <dd className="break-words text-base font-semibold text-slate-950">{me.institution.name}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="perfil-foto">
        <h2 id="perfil-foto" className="mb-3 text-lg font-bold text-slate-950">Mi foto</h2>
        <ImageUploader purpose="avatar" imageUrl={me.avatarUrl} alt={`Foto de ${me.name}`} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="perfil-datos">
        <h2 id="perfil-datos" className="text-lg font-bold text-slate-950">Mis datos</h2>
        <OwnDataForm name={me.name} phone={me.phone ?? ""} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="perfil-clave">
        <h2 id="perfil-clave" className="text-lg font-bold text-slate-950">Cambiar contraseña</h2>
        <OwnPasswordForm hasPassword={Boolean(me.identity?.passwordHash)} />
      </section>
    </div>
  );
}
