import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, CalendarRange, ChevronRight, GraduationCap, HeartHandshake, Network, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { canManageOrganizationalUnits } from "@/lib/organizational-units";
import { isIndependentInstitution } from "@/server/platform/independent";

export const dynamic = "force-dynamic";

type CardLink = { href: string; label: string };
type Card = { icon: LucideIcon; title: string; detail: string; links: CardLink[] };

function SettingsCard({ card }: { card: Card }) {
  const Icon = card.icon;
  const body = (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700" aria-hidden="true"><Icon size={22} /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-slate-950">{card.title}</span>
        <span className="mt-0.5 block text-sm text-slate-600">{card.detail}</span>
      </span>
    </>
  );
  if (card.links.length === 1) {
    return (
      <li>
        <Link href={card.links[0].href} className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-400">
          {body}
          <span className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-blue-700 sm:inline-flex">{card.links[0].label}<ChevronRight size={16} aria-hidden="true" /></span>
          <ChevronRight className="shrink-0 text-blue-700 sm:hidden" size={20} aria-hidden="true" />
        </Link>
      </li>
    );
  }
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">{body}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {card.links.map((link) => (
          <Link key={link.href} href={link.href} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-blue-700 hover:border-blue-400">{link.label}</Link>
        ))}
      </div>
    </li>
  );
}

export default async function ConfiguracionPage() {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) redirect("/login");
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  // Docente independiente: solo los datos de su espacio; períodos, personas, roles y tutores no le hacen falta.
  const independent = await isIndependentInstitution(user.institutionId);

  const main: Card[] = [];
  if (capabilities.has("tenant.settings.manage")) {
    main.push(independent
      ? { icon: Building2, title: "Datos de tu espacio", detail: "Cambia el nombre de tu espacio, la zona horaria y el idioma.", links: [{ href: "/dashboard/configuracion/institucion", label: "Cambiar datos" }] }
      : { icon: Building2, title: "Datos de la institución", detail: "Cambia el nombre, el tipo, la zona horaria y el idioma.", links: [{ href: "/dashboard/configuracion/institucion", label: "Cambiar datos" }] });
  }
  if (!independent && capabilities.has("academic.structure.manage")) {
    main.push({ icon: CalendarRange, title: "Períodos académicos", detail: "Crea los tramos del año en que se dan las clases y elige cuál es el actual.", links: [{ href: "/dashboard/configuracion/periodos", label: "Ver períodos" }] });
    main.push({
      icon: GraduationCap,
      title: "Programas y grupos",
      detail: "Arma carreras o diplomados con sus cursos, y grupos de estudiantes que los cursan juntos.",
      links: [{ href: "/dashboard/gestion/programas", label: "Ver programas" }, { href: "/dashboard/gestion/grupos", label: "Ver grupos" }],
    });
  }
  if (!independent && capabilities.has("people.view")) {
    main.push({ icon: Users, title: "Personas y acceso", detail: "Agrega docentes y estudiantes, invítalos a entrar y controla quién tiene acceso.", links: [{ href: "/dashboard/gestion", label: "Ver personas" }] });
  }

  const advanced: Card[] = [];
  if (!independent && capabilities.has("roles.permissions.manage")) {
    advanced.push({ icon: ShieldCheck, title: "Roles y permisos", detail: "Decide qué puede hacer cada tipo de persona: administración, coordinación, docentes.", links: [{ href: "/dashboard/configuracion/roles", label: "Revisar permisos" }] });
  }
  if (!independent && capabilities.has("guardianship.manage")) {
    advanced.push({ icon: HeartHandshake, title: "Tutores y familias", detail: "Conecta a cada madre, padre o tutor con su estudiante y elige qué puede ver.", links: [{ href: "/dashboard/configuracion/tutores", label: "Conectar tutores" }] });
  }
  if (!independent && canManageOrganizationalUnits(capabilities)) {
    advanced.push({ icon: Network, title: "Departamentos o áreas", detail: "Organiza al personal por departamento para enviar avisos solo a un área.", links: [{ href: "/dashboard/configuracion/unidades", label: "Organizar áreas" }] });
  }

  if (main.length === 0 && advanced.length === 0) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>Configuración</h1>
        <p className="mt-1 text-sm text-slate-600">{independent ? "Aquí preparas tu espacio." : "Aquí preparas tu institución."} Elige qué quieres hacer.</p>
      </header>

      {main.length > 0 && <ul className="space-y-3">{main.map((card) => <SettingsCard key={card.title} card={card} />)}</ul>}

      {advanced.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-slate-50 p-4" open={main.length === 0}>
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-slate-900">Opciones avanzadas</summary>
          <p className="mb-3 text-sm text-slate-600">No hacen falta para empezar a dar clases. Úsalas cuando las necesites.</p>
          <ul className="space-y-3">{advanced.map((card) => <SettingsCard key={card.title} card={card} />)}</ul>
        </details>
      )}
    </div>
  );
}
