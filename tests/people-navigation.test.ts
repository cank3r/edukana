import assert from "node:assert/strict";
import { test } from "node:test";
import { peopleProfileHref, peopleReturnHref } from "../src/app/dashboard/gestion/people-navigation";

const directory = "/dashboard/gestion";

test("people return link rejects external URLs, other routes and non-string input", () => {
  const rejected: unknown[] = [
    undefined, null, 1, {}, [directory], "", "https://example.test/dashboard/gestion",
    "//example.test/dashboard/gestion", "javascript:alert(1)", "/dashboard", `${directory}/`,
    `${directory}/personas/one`, `${directory}/../configuracion`, `/dashboard\\gestion`,
    `${directory}#fragment`, `${directory}?q=Ana\nMaria`, `${directory}?q=Ana\u0000`,
    `${directory}?q=Ana\u007f`,
  ];
  for (const value of rejected) assert.equal(peopleReturnHref(value), directory, String(value));
});

test("people return link preserves only supported directory filters and normalizes order", () => {
  const result = peopleReturnHref(
    `${directory}?pagina=3&estado=suspendidos&rol=estudiantes&q=%20Ana%20P%C3%A9rez%20&agregar=1&next=https%3A%2F%2Fevil.test`,
  );
  assert.equal(result, `${directory}?q=Ana+P%C3%A9rez&rol=estudiantes&estado=suspendidos&pagina=3`);
  assert.equal(peopleReturnHref(result), result);
});

test("people return link allowlists all five role filters and rejects unsupported values", () => {
  for (const role of ["estudiantes", "docentes", "coordinadores", "tutores", "administradores"]) {
    assert.equal(peopleReturnHref(`${directory}?rol=${role}`), `${directory}?rol=${role}`);
  }
  assert.equal(peopleReturnHref(`${directory}?rol=SUPER_ADMIN&estado=ACTIVE&pagina=1`), directory);
  assert.equal(peopleReturnHref(`${directory}?rol=invalid&estado=invalid`), directory);
});

test("people return link clamps pages and drops invalid or default page values", () => {
  for (const page of ["0", "1", "-1", "2abc", "1.5", "NaN", "Infinity", ""]) {
    assert.equal(peopleReturnHref(`${directory}?pagina=${page}`), directory, page);
  }
  assert.equal(peopleReturnHref(`${directory}?pagina=02`), `${directory}?pagina=2`);
  assert.equal(peopleReturnHref(`${directory}?pagina=9999999`), `${directory}?pagina=10000`);
});

test("people return link trims and bounds search text while keeping text URL encoded", () => {
  const text = "A".repeat(101);
  assert.equal(peopleReturnHref(`${directory}?q=%20${text}%20`), `${directory}?q=${"A".repeat(100)}`);
  assert.equal(peopleReturnHref(`${directory}?q=+++`), directory);
  const query = "María & equipo + tutores";
  const result = peopleReturnHref(`${directory}?${new URLSearchParams({ q: query })}`);
  assert.equal(new URL(result, "https://local.test").searchParams.get("q"), query);
});

test("profile links encode identifiers and nest the safe return context exactly once", () => {
  const returnHref = `${directory}?q=Ana+P%C3%A9rez&rol=docentes&estado=suspendidos&pagina=2`;
  const result = peopleProfileHref("id/with ?&chars", returnHref);
  const parsed = new URL(result, "https://local.test");
  assert.equal(parsed.pathname, `${directory}/personas/id%2Fwith%20%3F%26chars`);
  assert.equal(parsed.searchParams.get("volver"), returnHref);
  assert.deepEqual([...parsed.searchParams.keys()], ["volver"]);
});

test("profile links replace an unsafe return destination with the directory", () => {
  const result = peopleProfileHref("person-1", "https://example.test/private");
  assert.equal(new URL(result, "https://local.test").searchParams.get("volver"), directory);
});
