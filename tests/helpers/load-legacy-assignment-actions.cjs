/* eslint-disable @typescript-eslint/no-require-imports */
const Module = require("node:module");
const path = require("node:path");

// Only replace request boundaries. The exported legacy and M3 actions stay real.
// Each Node test file runs in its own process, so these imports cannot escape its suite.
function loadWithStubs(entry, stubs) {
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
}

exports.loadLegacyAssignmentActions = (stubs = {}) => loadWithStubs("src/app/dashboard/academico/actions.ts", stubs);
exports.loadLegacyCoursePage = (stubs = {}) => loadWithStubs("src/app/dashboard/aula/[courseId]/page.tsx", stubs).default;
