import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultEmailFor, EMAIL_KIND_OPTIONS, emailKindsForRole, isEmailKind, shouldSendEmail } from "@/server/notifications/email-policy";

/** Pruebas unitarias (sin base de datos) de la decisión «enviar correo / no enviar». */

test("por omisión: sí para avisos, notas y cargos; no para lo demás", () => {
  assert.equal(defaultEmailFor("announcement"), true);
  assert.equal(defaultEmailFor("grade"), true);
  assert.equal(defaultEmailFor("charge"), true);
  for (const kind of ["assignment", "exam", "live_class", "certificate", "submission"]) assert.equal(defaultEmailFor(kind), false, kind);
  assert.equal(defaultEmailFor("enrollment"), false, "la inscripción no es un tipo de correo");
  assert.equal(defaultEmailFor("desconocido"), false);
});

test("sin preferencia guardada manda el valor por omisión", () => {
  assert.equal(shouldSendEmail({ kind: "grade" }), true);
  assert.equal(shouldSendEmail({ kind: "grade", preference: null }), true);
  assert.equal(shouldSendEmail({ kind: "exam" }), false);
});

test("la preferencia de la persona manda sobre el valor por omisión", () => {
  assert.equal(shouldSendEmail({ kind: "grade", preference: false }), false, "apagada: no se envía");
  assert.equal(shouldSendEmail({ kind: "exam", preference: true }), true, "encendida: se envía");
});

test("quien notifica puede impedir el correo y un tipo desconocido nunca va por correo", () => {
  assert.equal(shouldSendEmail({ kind: "announcement", allowed: false, preference: true }), false);
  assert.equal(shouldSendEmail({ kind: "enrollment", preference: true }), false);
  assert.equal(shouldSendEmail({ kind: "otro", preference: true }), false);
  assert.equal(isEmailKind("enrollment"), false);
});

test("cada rol ve solo lo que le puede llegar, con textos claros", () => {
  assert.deepEqual(emailKindsForRole("STUDENT").map((option) => option.kind), ["announcement", "grade", "charge", "assignment", "exam", "live_class", "certificate"]);
  assert.deepEqual(emailKindsForRole("TEACHER").map((option) => option.kind), ["announcement", "submission"]);
  assert.deepEqual(emailKindsForRole("PARENT").map((option) => option.kind), ["announcement"]);
  assert.equal(EMAIL_KIND_OPTIONS.find((option) => option.kind === "grade")?.label, "Cuando califiquen una tarea");
  for (const option of EMAIL_KIND_OPTIONS) assert.match(option.label, /^Cuando /, option.kind);
  assert.equal(new Set(EMAIL_KIND_OPTIONS.map((option) => option.kind)).size, EMAIL_KIND_OPTIONS.length, "sin tipos repetidos");
});
