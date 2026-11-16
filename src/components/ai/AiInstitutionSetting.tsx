import { getInstitutionFeatures } from "@/server/platform/features";
import { getAiClient } from "@/server/ai/client";
import { AiSettingForm } from "./AiSettingForm";

export async function AiInstitutionSetting({ institutionId }: { institutionId: string }) {
  const features = await getInstitutionFeatures(institutionId);
  return <AiSettingForm enabled={features.ai} locked={features.aiLocked} platformReady={getAiClient() !== null} />;
}
