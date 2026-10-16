import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";

// Import before request-aware services in a Node integration-test file. Node's
// test runner isolates files in separate processes; this adapter never ships.
// Only headers() is adapted, and only inside an explicit request scope. Missing
// scope still invokes Next's real headers(), preserving its fail-closed error.
const hostContext = new AsyncLocalStorage<string>();
const require = createRequire(import.meta.url);
const loader = require("node:module") as { _load: (name: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
loader._load = function loadWithRequestHost(name: string, ...args: unknown[]) {
  const loaded = originalLoad.call(this, name, ...args);
  if (name !== "next/headers") return loaded;
  const api = loaded as typeof import("next/headers");
  return {
    ...api,
    headers: async () => {
      const host = hostContext.getStore();
      return host ? new Headers({ host }) : api.headers();
    },
  };
};

export function withRequestHost<T>(host: string, run: () => T): T {
  if (!host || /[\s,/@?#]/.test(host)) throw new Error("Test requires an explicit Host authority");
  return hostContext.run(host, run);
}
