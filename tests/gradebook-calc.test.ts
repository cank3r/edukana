import assert from "node:assert/strict";
import test from "node:test";
import { buildCsv, categoryWeightsProblem, courseAverage, csvCell } from "../src/lib/gradebook-calc";

const period = (categories: Parameters<typeof courseAverage>[0][number]["categories"], weight = 100) => ({ weight, categories });

test("promedio: combina las categorías según su peso", () => {
  const average = courseAverage([
    period([
      { weight: 40, scores: [{ score: 8, maxScore: 10 }, { score: 30, maxScore: 50 }] }, // 80 % y 60 % → 70 %
      { weight: 60, scores: [{ score: 90, maxScore: 100 }] },
    ]),
  ]);
  assert.equal(average, 82); // 70 × 0.4 + 90 × 0.6
});

test("promedio: una actividad exonerada no cuenta, ni a favor ni en contra", () => {
  const withExcused = courseAverage([
    period([{ weight: 100, scores: [{ score: 100, maxScore: 100 }, { score: 0, maxScore: 100, excused: true }, { score: null, maxScore: 100, excused: true }] }]),
  ]);
  assert.equal(withExcused, 100);
});

test("promedio: las actividades sin nota no cuentan y sin ninguna nota no hay promedio", () => {
  assert.equal(courseAverage([period([{ weight: 100, scores: [{ score: 15, maxScore: 20 }, { score: null, maxScore: 20 }] }])]), 75);
  assert.equal(courseAverage([period([{ weight: 100, scores: [{ score: null, maxScore: 20 }] }])]), null);
  assert.equal(courseAverage([]), null);
});

test("promedio: una categoría sin notas cede su peso a las que sí tienen", () => {
  assert.equal(courseAverage([period([{ weight: 30, scores: [] }, { weight: 70, scores: [{ score: 9, maxScore: 10 }] }])]), 90);
});

test("promedio: redondea a dos decimales", () => {
  assert.equal(courseAverage([period([{ weight: 100, scores: [{ score: 2, maxScore: 3 }] }])]), 66.67);
  assert.equal(courseAverage([period([{ weight: 100, scores: [{ score: 1, maxScore: 3 }, { score: 1, maxScore: 3 }, { score: 2, maxScore: 3 }] }])]), 44.44);
});

test("promedio: varios períodos se combinan por su peso y uno sin notas no cuenta", () => {
  const first = period([{ weight: 100, scores: [{ score: 60, maxScore: 100 }] }], 50);
  const second = period([{ weight: 100, scores: [{ score: 100, maxScore: 100 }] }], 50);
  const empty = period([{ weight: 100, scores: [] }], 50);
  assert.equal(courseAverage([first, second]), 80);
  assert.equal(courseAverage([first, empty]), 60);
});

test("pesos: deben sumar 100 y el mensaje dice cuánto falta o sobra", () => {
  assert.equal(categoryWeightsProblem([100]), null);
  assert.equal(categoryWeightsProblem([33.33, 33.33, 33.34]), null);
  assert.match(categoryWeightsProblem([40, 50]) ?? "", /suman 90 %.*Faltan 10/);
  assert.match(categoryWeightsProblem([70, 50]) ?? "", /suman 120 %.*Sobran 20/);
  assert.match(categoryWeightsProblem([120, -20]) ?? "", /entre 0 y 100/);
  assert.match(categoryWeightsProblem([]) ?? "", /al menos una/);
});

test("CSV: escapa comas, comillas y saltos de línea, y desactiva fórmulas", () => {
  assert.equal(csvCell("Pérez, Ana"), '"Pérez, Ana"');
  assert.equal(csvCell('Dijo "hola"'), '"Dijo ""hola"""');
  assert.equal(csvCell("=SUMA(A1:A9)"), "'=SUMA(A1:A9)");
  assert.equal(csvCell("+1 809"), "'+1 809");
  assert.equal(csvCell("-2"), "'-2");
  assert.equal(csvCell("@usuario"), "'@usuario");
  assert.equal(csvCell('=HYPERLINK("x","y")'), '"\'=HYPERLINK(""x"",""y"")"');
  assert.equal(csvCell(85.5), "85.5");
  assert.equal(csvCell(null), "");
  assert.equal(buildCsv([["Estudiante", "Nota"], ["Ñandú", 9]]), "﻿Estudiante,Nota\r\nÑandú,9\r\n");
});
