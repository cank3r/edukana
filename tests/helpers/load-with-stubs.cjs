/* eslint-disable @typescript-eslint/no-require-imports */
const Module = require("node:module");
const path = require("node:path");

// Only replace request boundaries (session, cache, services the test names). Everything else stays real.
// Each Node test file runs in its own process, so these imports cannot escape its suite.
exports.loadWithStubs = function loadWithStubs(entry, stubs = {}) {
  const originalLoad = Module._load;
  Module._load = function load(request, ...args) {
    if (Object.hasOwn(stubs, request)) return stubs[request];
    if (request === "server-only") return {};
    return originalLoad.call(this, request, ...args);
  };
  try {
    return require(path.join(process.cwd(), entry));
  } finally {
    Module._load = originalLoad;
  }
};
