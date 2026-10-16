export type EmailMessage = { to: string; subject: string; text: string; html?: string; fromName?: string };

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

/** Proveedor para pruebas y desarrollo: guarda los mensajes en memoria y no envía nada. */
export class MemoryEmailProvider implements EmailProvider {
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage) {
    this.sent.push(message);
  }
}

/** Preserve the configured verified mailbox; display names cannot add headers or recipients. */
export function emailSender(configured: string, displayName?: string): string {
  if (/[\r\n\u0000]/.test(configured)) throw new Error("Remitente de correo no válido.");
  if (!displayName) return configured;
  const mailbox = /<([^<>]+)>\s*$/.exec(configured)?.[1] ?? configured.trim();
  if (!/^[^\s<>@,;]+@[^\s<>@,;]+$/.test(mailbox)) throw new Error("Remitente de correo no válido.");
  const name = displayName.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/["\\]/g, "").trim();
  return `"${name}" <${mailbox}>`;
}

/** Resend por HTTP, sin SDK. Cambiar de proveedor es escribir otra clase con la misma interfaz. */
export class ResendEmailProvider implements EmailProvider {
  constructor(private readonly apiKey: string, private readonly from: string) {}

  async send(message: EmailMessage) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: emailSender(this.from, message.fromName), to: [message.to], subject: message.subject, text: message.text, ...(message.html ? { html: message.html } : {}) }),
    });
    if (!response.ok) throw new Error(`El proveedor de correo respondió ${response.status}.`);
  }
}

let override: EmailProvider | null = null;

/** Solo para pruebas: sustituye el proveedor configurado. */
export function setEmailProviderForTests(provider: EmailProvider | null) {
  override = provider;
}

export function getEmailProvider(): EmailProvider {
  if (override) return override;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Correo no configurado: faltan RESEND_API_KEY o EMAIL_FROM.");
  return new ResendEmailProvider(apiKey, from);
}
