import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { canonicalConfig } from "./canonical-mvp-config.mjs";

/** Installed only in the disposable Next server via --import, never in application code. */
export function interceptedFetch(original, env = process.env) {
  const config = canonicalConfig(env);
  const mailbox = join(config.privateDir, "mailbox");
  mkdirSync(mailbox, { recursive: true, mode: 0o700 });
  return async function localFetch(input, init) {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.href === "https://api.resend.com/emails" && request.method === "POST") {
      if (request.headers.get("authorization") !== "Bearer canonical-mail-intercept-only") {
        throw new Error("Canonical mailbox refuses a non-fixture email key.");
      }
      const message = await request.json();
      if (!Array.isArray(message.to) || message.to.length !== 1 ||
          !/^[a-z0-9.+_-]+@(?:[a-z0-9-]+\.)*example\.test$/i.test(message.to[0]) ||
          !String(message.from).endsWith("canonical@example.test>") && message.from !== "canonical@example.test") {
        throw new Error("Canonical mailbox refuses a non-fixture recipient or sender.");
      }
      if (message.cc || message.bcc || message.reply_to) throw new Error("Canonical mailbox refuses extra recipients.");
      const id = randomUUID();
      writeFileSync(join(mailbox, `${Date.now()}-${id}.json`), JSON.stringify(message), { flag: "wx", mode: 0o600 });
      return Response.json({ id });
    }
    if (url.origin !== config.baseURL) throw new Error("Canonical server refuses outbound HTTP outside its local fixture.");
    // A loopback redirect must never escape the wrapper and reach a provider.
    return original(request, { redirect: "error" });
  };
}

if (process.env.CANONICAL_MVP_MAIL_PRELOAD === "1") {
  globalThis.fetch = interceptedFetch(globalThis.fetch.bind(globalThis));
}
