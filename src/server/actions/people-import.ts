"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { errorsToCsv, parsePeopleCsv } from "@/server/imports/people";
import { applyPeopleImport, planPeopleImport } from "@/server/imports/people-apply";
import { countLabel } from "@/lib/plural";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export type PeopleImportState =
  | { ok: false; message: string }
  | {
      ok: true;
      step: "preview" | "done";
      message: string;
      totalLines: number;
      toCreate: number;
      alreadyExisted: number;
      rejected: number;
      /** Primeras filas rechazadas, para mostrarlas en pantalla. */
      sampleErrors: Array<{ line: number; field: string; message: string }>;
      /** Archivo CSV con todas las filas rechazadas; vacío si no hay ninguna. */
      errorsCsv: string;
    };

/**
 * Importación de personas en dos pasos con el mismo formulario.
 * Campos: `file` (CSV) y `confirm` ("true" para crear). Sin `confirm` solo previsualiza.
 * El archivo se vuelve a validar al confirmar: nunca se confía en un resultado previo del navegador.
 */
export async function importPeopleAction(_state: PeopleImportState, formData: FormData): Promise<PeopleImportState> {
  const user = (await auth())?.user;
  if (!user?.id || !user.institutionId) return { ok: false, message: "Tu sesión terminó. Vuelve a iniciar sesión." };
  const capabilities = await getEffectiveCapabilities(user.institutionId, user.role);
  if (!capabilities.has("people.manage")) return { ok: false, message: "No tienes permiso para importar personas." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Elige un archivo CSV." };
  if (file.size > MAX_FILE_BYTES) return { ok: false, message: "El archivo supera 2 MB. Divídelo en varios." };

  try {
    const parsed = parsePeopleCsv(await file.text());
    const plan = await planPeopleImport(user.institutionId, parsed.rows);
    const summary = {
      totalLines: parsed.totalLines,
      toCreate: plan.toCreate.length,
      alreadyExisted: plan.existing.length,
      rejected: parsed.errors.length,
      sampleErrors: parsed.errors.slice(0, 20).map(({ line, field, message }) => ({ line, field, message })),
      errorsCsv: parsed.errors.length ? errorsToCsv(parsed) : "",
    };
    if (formData.get("confirm") !== "true") {
      return { ok: true, step: "preview", message: `Se ${summary.toCreate === 1 ? "creará" : "crearán"} ${countLabel(summary.toCreate, "persona", "personas")}.`, ...summary };
    }
    const result = await applyPeopleImport({ id: user.id, institutionId: user.institutionId }, plan.toCreate);
    revalidatePath("/dashboard/gestion");
    return {
      ok: true,
      step: "done",
      message: `Listo: ${countLabel(result.created, "persona creada", "personas creadas")}.`,
      ...summary,
      toCreate: result.created,
      alreadyExisted: summary.alreadyExisted + result.alreadyExisted,
    };
  } catch (error) {
    const correlationId = crypto.randomUUID();
    console.error("importPeopleAction failed", { correlationId, error });
    return { ok: false, message: `No se pudo procesar el archivo. Intenta de nuevo. Código: ${correlationId}` };
  }
}
