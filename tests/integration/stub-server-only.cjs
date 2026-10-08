/* eslint-disable @typescript-eslint/no-require-imports */
// Next.js resuelve `server-only` internamente; fuera de Next el paquete no existe.
// Las pruebas de integración corren en Node puro, así que se sustituye por un módulo vacío.
const Module = require("node:module");
const stubPath = require.resolve("./empty-module.cjs");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolveWithServerOnlyStub(request, ...rest) {
  if (request === "server-only") return stubPath;
  return originalResolve.call(this, request, ...rest);
};
