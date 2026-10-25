import type { InstitutionType } from "@prisma/client";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { isValidTimeZone } from "@/lib/timezone";
import type { EdukanaRole } from "@/types/next-auth";

/**
 * Datos generales de la institución que su administración puede cambiar: nombre, tipo,
 * zona horaria e idioma. La dirección web y el dominio son internos y no se editan aquí.
 * El logo queda fuera: la subida de archivos existente está atada a cursos y entregas.
 */

export type SettingsActor = { id: string; institutionId: string; role: EdukanaRole };
export type InstitutionSettingsInput = { name: string; type: string; timezone: string; language: string };
export type InstitutionSettingsResult = { ok: true; timezoneChanged: boolean } | { ok: false; message: string };

export const INSTITUTION_TYPE_OPTIONS: ReadonlyArray<{ value: InstitutionType; label: string }> = [
  { value: "SCHOOL", label: "Colegio o escuela" },
  { value: "UNIVERSITY", label: "Universidad" },
  { value: "INSTITUTE", label: "Instituto" },
  { value: "ACADEMY", label: "Academia" },
  { value: "OTHER", label: "Otro" },
];

export const LANGUAGE_OPTIONS = [
  { value: "es", label: "Español" },
  { value: "en", label: "Inglés" },
] as const;

/** Zonas de América Latina, con el nombre del lugar como lo diría una persona. */
const LATIN_AMERICA: ReadonlyArray<readonly [string, string]> = [
  ["America/Santo_Domingo", "República Dominicana"],
  ["America/Puerto_Rico", "Puerto Rico"],
  ["America/Havana", "Cuba"],
  ["America/Mexico_City", "México (Ciudad de México)"],
  ["America/Monterrey", "México (Monterrey)"],
  ["America/Cancun", "México (Cancún)"],
  ["America/Tijuana", "México (Tijuana)"],
  ["America/Guatemala", "Guatemala"],
  ["America/El_Salvador", "El Salvador"],
  ["America/Tegucigalpa", "Honduras"],
  ["America/Managua", "Nicaragua"],
  ["America/Costa_Rica", "Costa Rica"],
  ["America/Panama", "Panamá"],
  ["America/Bogota", "Colombia"],
  ["America/Caracas", "Venezuela"],
  ["America/Guayaquil", "Ecuador"],
  ["America/Lima", "Perú"],
  ["America/La_Paz", "Bolivia"],
  ["America/Asuncion", "Paraguay"],
  ["America/Santiago", "Chile"],
  ["America/Argentina/Buenos_Aires", "Argentina"],
  ["America/Montevideo", "Uruguay"],
  ["America/Sao_Paulo", "Brasil (São Paulo)"],
  ["America/Manaus", "Brasil (Manaos)"],
];

export type TimeZoneOption = { value: string; label: string };

const prettyZone = (zone: string) => zone.replaceAll("_", " ").replaceAll("/", " / ");

function supportedTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  try {
    return intl.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
}

/**
 * Opciones del selector: primero América Latina, después el resto del mundo.
 * La zona actual siempre aparece, aunque no esté en ninguna de las dos listas.
 */
export function timeZoneOptions(current?: string): { latinAmerica: TimeZoneOption[]; rest: TimeZoneOption[] } {
  const latinAmerica = LATIN_AMERICA.filter(([zone]) => isValidTimeZone(zone)).map(([value, label]) => ({ value, label }));
  // "America/Buenos_Aires" es el nombre antiguo de la zona de Argentina, que ya está en la primera lista.
  const known = new Set([...latinAmerica.map((option) => option.value), "America/Buenos_Aires"]);
  const rest = supportedTimeZones().filter((zone) => !known.has(zone)).map((value) => ({ value, label: prettyZone(value) }));
  if (!known.has("UTC") && !rest.some((option) => option.value === "UTC")) rest.push({ value: "UTC", label: "UTC (hora universal)" });
  if (current && !latinAmerica.some((option) => option.value === current) && !rest.some((option) => option.value === current) && isValidTimeZone(current)) {
    rest.unshift({ value: current, label: prettyZone(current) });
  }
  return { latinAmerica, rest };
}

/** Datos editables de la institución de quien consulta. Nunca recibe un id desde el navegador. */
export function getInstitutionSettings(institutionId: string) {
  return db.institution.findUnique({ where: { id: institutionId }, select: { name: true, type: true, timezone: true, language: true } });
}

export async function updateInstitutionSettings(actor: SettingsActor, input: InstitutionSettingsInput): Promise<InstitutionSettingsResult> {
  const capabilities = await getEffectiveCapabilities(actor.institutionId, actor.role);
  if (!capabilities.has("tenant.settings.manage")) return { ok: false, message: "No tienes permiso para cambiar los datos de la institución." };

  const name = String(input.name ?? "").trim();
  const timezone = String(input.timezone ?? "").trim();
  const type = INSTITUTION_TYPE_OPTIONS.find((option) => option.value === input.type)?.value;
  const language = LANGUAGE_OPTIONS.find((option) => option.value === input.language)?.value;
  if (name.length < 2) return { ok: false, message: "Escribe el nombre de la institución." };
  if (name.length > 160) return { ok: false, message: "El nombre es demasiado largo (máximo 160 letras)." };
  if (!type) return { ok: false, message: "Elige el tipo de institución de la lista." };
  if (!timezone || timezone.length > 80 || !isValidTimeZone(timezone)) return { ok: false, message: "Esa zona horaria no es válida. Elige una de la lista." };
  if (!language) return { ok: false, message: "Elige el idioma de la lista." };

  return db.$transaction(async (tx) => {
    const before = await tx.institution.findUnique({ where: { id: actor.institutionId }, select: { name: true, type: true, timezone: true, language: true } });
    if (!before) return { ok: false, message: "No encontramos tu institución. Vuelve a iniciar sesión." } as const;
    const after = { name, type, timezone, language };
    await tx.institution.update({ where: { id: actor.institutionId }, data: after });
    await tx.auditLog.create({
      data: { institutionId: actor.institutionId, userId: actor.id, action: "INSTITUTION_SETTINGS_UPDATED", entity: "Institution", entityId: actor.institutionId, changes: { before, after } },
    });
    return { ok: true, timezoneChanged: before.timezone !== timezone } as const;
  });
}
