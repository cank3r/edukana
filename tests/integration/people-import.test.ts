import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { parseCsv, toCsv } from "@/server/imports/csv";
import { errorsToCsv, parsePeopleCsv } from "@/server/imports/people";
import { applyPeopleImport, planPeopleImport } from "@/server/imports/people-apply";
import { A, B, ensureSeed } from "./setup";

const admin = { id: A.admin.id, institutionId: A.institutionId };

before(ensureSeed);
after(async () => {
  await db.user.deleteMany({ where: { email: { endsWith: "@importado.test" } } });
  await db.auditLog.deleteMany({ where: { action: "PEOPLE_IMPORTED" } });
  await db.$disconnect();
});

test("CSV: lee comillas, comas dentro de un campo, saltos de línea, BOM y punto y coma", () => {
  assert.deepEqual(parseCsv('﻿Nombre,Correo\r\n"Pérez, Ana",ana@x.test\r\n"Línea\nrota",b@x.test\r\n'), [
    ["Nombre", "Correo"],
    ["Pérez, Ana", "ana@x.test"],
    ["Línea\nrota", "b@x.test"],
  ]);
  assert.deepEqual(parseCsv("Nombre;Correo\nAna;ana@x.test\n\n"), [["Nombre", "Correo"], ["Ana", "ana@x.test"]]);
  assert.deepEqual(parseCsv('a,b\n"dice ""hola""",2'), [["a", "b"], ['dice "hola"', "2"]]);
});

test("CSV de salida: neutraliza fórmulas para que Excel no las ejecute", () => {
  assert.match(toCsv([["=HYPERLINK(\"x\")", "normal"]]), /"'=HYPERLINK\(""x""\)",normal/);
});

test("personas: acepta encabezados en español con tildes y asigna Estudiante por defecto", () => {
  const parsed = parsePeopleCsv("Nombre completo,Correo electrónico,Teléfono\nAna Pérez,ANA@Importado.test,809-555-0100\n");
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.rows, [{ line: 2, name: "Ana Pérez", email: "ana@importado.test", role: "STUDENT", phone: "809-555-0100" }]);
});

test("personas: reporta cada fila rechazada con su número y motivo, y conserva las válidas", () => {
  const csv = [
    "Nombre,Correo,Rol",
    "Ana Pérez,ana@importado.test,Estudiante",
    "Lu,lu@importado.test,Estudiante",
    "Carlos Ruiz,no-es-correo,Docente",
    "Marta Díaz,marta@importado.test,Director",
    "Ana Repetida,ana@importado.test,Estudiante",
    "Pedro Gil,pedro@importado.test,Profesor",
  ].join("\n");
  const parsed = parsePeopleCsv(csv);
  assert.deepEqual(parsed.rows.map((row) => [row.line, row.role]), [[2, "STUDENT"], [7, "TEACHER"]]);
  assert.deepEqual(parsed.errors.map((error) => [error.line, error.field]), [[3, "Nombre"], [4, "Correo"], [5, "Rol"], [6, "Correo"]]);
  assert.match(parsed.errors[3].message, /fila 2/);
  const report = errorsToCsv(parsed);
  assert.match(report, /Fila,Columna,Problema,Nombre,Correo,Rol/);
  assert.match(report, /4,Correo,El correo no es válido\.,Carlos Ruiz,no-es-correo,Docente/);
});

test("personas: sin columnas de nombre y correo no procesa nada y lo explica", () => {
  const parsed = parsePeopleCsv("Apellido,Edad\nPérez,20\n");
  assert.equal(parsed.rows.length, 0);
  assert.equal(parsed.errors[0].field, "encabezado");
});

test("personas: nadie puede importarse como administrador", () => {
  const parsed = parsePeopleCsv("Nombre,Correo,Rol\nAna Pérez,ana@importado.test,ADMIN\n");
  assert.equal(parsed.rows.length, 0);
  assert.equal(parsed.errors[0].field, "Rol");
});

test("importación: 1,600 estudiantes se crean en la institución correcta y repetir el archivo no duplica", async () => {
  const lines = ["Nombre,Correo"];
  for (let i = 1; i <= 1600; i += 1) lines.push(`Estudiante Número ${i},masivo${i}@importado.test`);
  const parsed = parsePeopleCsv(lines.join("\n"));
  assert.equal(parsed.rows.length, 1600);
  assert.equal(parsed.errors.length, 0);

  const started = Date.now();
  const plan = await planPeopleImport(A.institutionId, parsed.rows);
  assert.equal(plan.toCreate.length, 1600);
  assert.deepEqual(await applyPeopleImport(admin, plan.toCreate), { created: 1600, alreadyExisted: 0 });
  const seconds = (Date.now() - started) / 1000;
  assert.ok(seconds < 120, `tardó ${seconds}s`);

  assert.equal(await db.user.count({ where: { institutionId: A.institutionId, email: { endsWith: "@importado.test" } } }), 1600);
  assert.equal(await db.user.count({ where: { institutionId: B.institutionId, email: { endsWith: "@importado.test" } } }), 0);

  const second = await planPeopleImport(A.institutionId, parsed.rows);
  assert.equal(second.toCreate.length, 0);
  assert.equal(second.existing.length, 1600);
  assert.deepEqual(await applyPeopleImport(admin, parsed.rows), { created: 0, alreadyExisted: 1600 });
});

test("importación: no modifica una cuenta que ya existía con ese correo", async () => {
  const parsed = parsePeopleCsv("Nombre,Correo,Rol\nNombre Cambiado,docente@a.test,Estudiante\n");
  const plan = await planPeopleImport(A.institutionId, parsed.rows);
  assert.equal(plan.toCreate.length, 0);
  await applyPeopleImport(admin, parsed.rows);
  const user = await db.user.findUniqueOrThrow({ where: { id: A.teacher.id } });
  assert.equal(user.role, "TEACHER");
  assert.notEqual(user.name, "Nombre Cambiado");
});

test("importación: las cuentas nacen sin contraseña y activas, listas para el enlace de activación", async () => {
  const user = await db.user.findFirstOrThrow({ where: { email: "masivo1@importado.test" } });
  assert.equal(user.password, null);
  assert.equal(user.status, "ACTIVE");
  assert.equal(user.sessionVersion, 0);
});
