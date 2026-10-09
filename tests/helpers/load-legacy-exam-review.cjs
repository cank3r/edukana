/* eslint-disable @typescript-eslint/no-require-imports */
const Module = require("node:module");
const path = require("node:path");

// Replace only request/framework boundaries. Keep the legacy handler, authorization,
// canonical review service and grade-history writer real in every regression.
exports.loadLegacyExamReview = function loadLegacyExamReview(stubs, relativePath = "src/app/dashboard/academico/actions.ts") {
  const originalLoad = Module._load;
  Module._load = function load(request, ...args) {
    if (Object.hasOwn(stubs, request)) return stubs[request];
    if (request === "server-only") return {};
    return originalLoad.call(this, request, ...args);
  };
  try {
    return require(path.join(process.cwd(), relativePath));
  } finally {
    Module._load = originalLoad;
  }
};
