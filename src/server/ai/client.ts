import Anthropic from "@anthropic-ai/sdk";

/**
 * Cliente de IA de Edukana. Todo el código habla con esta interfaz, nunca con el SDK directo:
 * las pruebas inyectan un cliente falso con `setAiClientForTests` y no llaman a la API real.
 */

export const DEFAULT_AI_MODEL = "claude-sonnet-5-5";

export type AiRequest = {
  /** Instrucciones fijas del sistema. Nunca incluyen texto escrito por estudiantes. */
  system: string;
  /** Mensaje del usuario: datos (contenido del curso, pregunta) envueltos en etiquetas. */
  prompt: string;
  maxTokens: number;
};

export type AiResponse = { text: string; inputTokens: number; outputTokens: number; model: string };

export interface AiClient {
  readonly model: string;
  complete(request: AiRequest): Promise<AiResponse>;
}

export type AiConfig = { apiKey: string; model: string } | null;

/** Lee la configuración del entorno. Sin `ANTHROPIC_API_KEY` la IA queda desactivada. */
export function readAiConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  return { apiKey, model: env.AI_MODEL?.trim() || DEFAULT_AI_MODEL };
}

export class AnthropicAiClient implements AiClient {
  private readonly sdk: Anthropic;
  constructor(apiKey: string, readonly model: string) {
    this.sdk = new Anthropic({ apiKey, maxRetries: 1, timeout: 60_000 });
  }

  async complete(request: AiRequest): Promise<AiResponse> {
    const message = await this.sdk.messages.create({
      model: this.model,
      max_tokens: request.maxTokens,
      system: request.system,
      messages: [{ role: "user", content: request.prompt }],
    });
    const text = message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
    return { text, inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens, model: message.model };
  }
}

let override: AiClient | null | undefined;

/** Solo para pruebas: `null` simula «sin clave»; `undefined` vuelve a leer el entorno. */
export function setAiClientForTests(client: AiClient | null | undefined) {
  override = client;
}

/** Cliente listo para usar, o `null` si la IA no está configurada en este servidor. */
export function getAiClient(env: Record<string, string | undefined> = process.env): AiClient | null {
  if (override !== undefined) return override;
  const config = readAiConfig(env);
  return config ? new AnthropicAiClient(config.apiKey, config.model) : null;
}
