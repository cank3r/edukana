import { db } from "@/lib/db";
import { institutionAiEnabled } from "@/server/ai/access";
import { getAiClient } from "@/server/ai/client";
import { AiSettingForm } from "./AiSettingForm";

/** Ajuste «Asistente de IA» en Configuración → Datos de la institución. */
export async function AiInstitutionSetting({ institutionId }: { institutionId: string }) {
  const institution = await db.institution.findUnique({ where: { id: institutionId }, select: { settings: true } });
  if (!institution) return null;
  return <AiSettingForm enabled={institutionAiEnabled(institution.settings)} platformReady={getAiClient() !== null} />;
}
