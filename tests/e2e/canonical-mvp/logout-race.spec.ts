import { test, expect, type Browser, type BrowserContext, type Request, type TestInfo } from "@playwright/test";
import { canonicalConfig } from "../../../scripts/canonical-mvp-config.mjs";
import { BASE_URL, USERS } from "./fixtures";
import { login } from "./helpers";

type Mode = "inmediato" | "quiescente";
type Header = { name: string; value: string };
type CookieOperation = {
  ordinal: number; name: string; action: "set" | "delete";
  emptyValue: boolean; maxAgeZero: boolean; expiresPast: boolean;
  path: string | null; domain: string | null; secure: boolean;
};
type Evidence = {
  sequence: number; event: string; phase: string; request?: number;
  pathname?: string; method?: string; status?: number; prefetch?: boolean;
  setCookie?: boolean; cookieOperations?: CookieOperation[];
  cookieNames?: string[]; headersAvailable?: boolean; locationPathname?: string;
};
const sessionCookie = /^(?:__Secure-)?(?:authjs|next-auth)\.session-token(?:\.\d+)?$/;

async function sessionCookieNames(context: BrowserContext) {
  return (await context.cookies(BASE_URL)).map(({ name }) => name).filter((name) => sessionCookie.test(name));
}

function cookieOperations(headers: Header[]): CookieOperation[] {
  // Preserve duplicate Set-Cookie entries and their received order. Values never leave this function.
  return headers.filter(({ name }) => name.toLowerCase() === "set-cookie").map(({ value }, index) => {
    const [pair, ...attributes] = value.split(";");
    const name = /^([A-Za-z0-9_.-]{1,100})=/.exec(pair)?.[1] ?? "unparsed-cookie-name";
    const attrs = new Map(attributes.map<[string, string]>((attribute) => {
      const position = attribute.indexOf("=");
      return position < 0 ? [attribute.trim().toLowerCase(), ""]
        : [attribute.slice(0, position).trim().toLowerCase(), attribute.slice(position + 1).trim()];
    }));
    const maxAge = attrs.get("max-age");
    const maxAgeZero = maxAge !== undefined && Number(maxAge) <= 0;
    const expiry = Date.parse(attrs.get("expires") ?? "");
    const expiresPast = Number.isFinite(expiry) && expiry <= Date.now();
    const path = attrs.get("path");
    const domain = attrs.get("domain");
    return {
      ordinal: index + 1, name, action: maxAgeZero || expiresPast ? "delete" : "set",
      emptyValue: pair.includes("=") && pair.indexOf("=") === pair.length - 1, maxAgeZero, expiresPast,
      path: path === undefined ? null : /^\/[A-Za-z0-9_./-]*$/.test(path) ? path : "nonstandard-path",
      domain: domain === undefined ? null : /^[A-Za-z0-9.-]+$/.test(domain) ? domain : "nonstandard-domain",
      secure: attrs.has("secure"),
    };
  });
}

async function sample(browser: Browser, info: TestInfo, mode: Mode, number: number) {
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const evidence: Evidence[] = [];
  const metadataReads: Promise<void>[] = [];
  const requests = new Map<Request, number>();
  const errors: unknown[] = [];
  let phase = "login";
  const record = (entry: Omit<Evidence, "sequence" | "phase">) => {
    const item: Evidence = { sequence: evidence.length + 1, phase, ...entry };
    evidence.push(item);
    return item;
  };
  const requestId = (request: Request) => {
    if (!requests.has(request)) requests.set(request, requests.size + 1);
    return requests.get(request)!;
  };
  const check = async (assertion: () => Promise<void>) => {
    try { await assertion(); } catch (error) { errors.push(error); record({ event: "assertion-failed" }); }
  };

  // Passive observation only: no routing, delayed responses, header edits, auth/session probes, or cookie writes.
  context.on("request", (request) => {
    if (new URL(request.url()).origin !== BASE_URL) return;
    const headers = request.headers();
    record({ event: "request", request: requestId(request), pathname: new URL(request.url()).pathname,
      method: request.method(), prefetch: headers["next-router-prefetch"] === "1" || headers.purpose === "prefetch" });
  });
  context.on("response", (response) => {
    if (new URL(response.url()).origin !== BASE_URL) return;
    const entry = record({ event: "response", request: requestId(response.request()),
      pathname: new URL(response.url()).pathname, method: response.request().method(), status: response.status() });
    metadataReads.push(response.headersArray().then((headers) => {
      entry.cookieOperations = cookieOperations(headers);
      entry.setCookie = entry.cookieOperations.length > 0;
      entry.headersAvailable = true;
    }, () => { entry.headersAvailable = false; }));
  });
  context.on("requestfinished", (request) => {
    if (new URL(request.url()).origin === BASE_URL) record({ event: "request-finished", request: requestId(request) });
  });
  context.on("requestfailed", (request) => {
    if (new URL(request.url()).origin === BASE_URL) record({ event: "request-failed", request: requestId(request) });
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame() && new URL(frame.url()).origin === BASE_URL) {
      record({ event: "document-navigation", pathname: new URL(frame.url()).pathname });
    }
  });

  try {
    await login(page, USERS.admin);
    record({ event: "signed-in", cookieNames: await sessionCookieNames(context) });
    phase = "dashboard-reload";
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    const button = page.getByRole("button", { name: "Cerrar sesión", exact: true });
    await expect(button).toBeVisible();
    if (mode === "quiescente") await page.waitForLoadState("networkidle");
    phase = "logout";
    record({ event: "logout-click" });
    const [signout] = await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname === "/api/auth/signout"
        && response.request().method() === "POST"),
      button.click(),
    ]);
    await signout.finished();
    record({ event: "signout-finished", status: signout.status(), cookieNames: await sessionCookieNames(context) });
    await check(async () => { expect(signout.status()).toBe(200); });
    // Observe the natural result before issuing any new server request that could affect cookies.
    await check(async () => {
      await expect(page).toHaveURL(`${BASE_URL}/login`);
      await expect(page.getByRole("button", { name: "Ingresar", exact: true })).toBeVisible();
    });
    record({ event: "natural-ui-result", pathname: new URL(page.url()).pathname, cookieNames: await sessionCookieNames(context) });

    phase = "fresh-protected-get";
    // This protected-resource check is intentionally AFTER the natural UI assertions. Never call /api/auth/session.
    const probe = await page.request.get("/dashboard", { maxRedirects: 0 });
    const location = probe.headers().location;
    const destination = location ? new URL(location, BASE_URL) : null;
    const operations = cookieOperations(probe.headersArray());
    record({ event: "protected-get", pathname: "/dashboard", status: probe.status(),
      locationPathname: destination?.pathname, setCookie: operations.length > 0, cookieOperations: operations });
    await check(async () => {
      expect([302, 303, 307, 308], "A new protected GET must be denied after UI logout").toContain(probe.status());
      expect(destination?.origin).toBe(BASE_URL);
      expect(destination?.pathname).toBe("/login");
    });
    phase = "fresh-browser-navigation";
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    record({ event: "fresh-ui-result", pathname: new URL(page.url()).pathname, cookieNames: await sessionCookieNames(context) });
    await check(async () => {
      await expect(page).toHaveURL((url) => url.origin === BASE_URL && url.pathname === "/login");
      await expect(page.getByRole("button", { name: "Ingresar", exact: true })).toBeVisible();
    });
    if (errors.length) throw new AggregateError(errors, `Logout ${mode}, muestra ${number}: ${errors.length} comprobaciones fallaron.`);
  } finally {
    await context.close();
    await Promise.allSettled(metadataReads);
    await info.attach(`logout-${mode}-${number}-metadata`, {
      body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: "application/json",
    });
  }
}

test.use({ screenshot: "off", trace: "off", video: "off" });

for (const mode of ["inmediato", "quiescente"] as const) {
  test(`logout ${mode}: tres muestras conservan login y niegan una nueva petición protegida`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const fixture = canonicalConfig(); // Exact disposable DB, loopback origin and fictitious configuration; no external mode.
    expect(fixture.baseURL).toBe(BASE_URL);
    const failures: unknown[] = [];
    for (let number = 1; number <= 3; number += 1) {
      try { await test.step(`Muestra independiente ${number}`, () => sample(browser, info, mode, number)); }
      catch (error) { failures.push(error); }
    }
    // Samples are observations, not retries: a later success never clears an earlier failure.
    if (failures.length) throw new AggregateError(failures, `${failures.length} muestras de logout ${mode} fallaron.`);
  });
}
