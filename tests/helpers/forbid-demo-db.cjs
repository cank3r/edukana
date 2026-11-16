/* eslint-disable @typescript-eslint/no-require-imports */
// Negative CLI tests must never load a database client, even if the guard regresses.
const Module = require("node:module");
const original = Module._resolveFilename;
Module._resolveFilename = function forbidDatabaseImport(request, ...rest) {
  if (request === "@/lib/db" || request === "@prisma/client" || /[/\\]src[/\\]lib[/\\]db(?:\.[cm]?[jt]s)?$/.test(request)) {
    throw new Error("UNEXPECTED_DATABASE_IMPORT");
  }
  return original.call(this, request, ...rest);
};
