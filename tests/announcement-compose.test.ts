import assert from "node:assert/strict";
import test from "node:test";
import { approximateRecipients, audienceText, hasAudience, simpleAudienceFields, SIMPLE_AUDIENCE_OPTIONS } from "../src/lib/announcement-compose";

const none = { audienceInstitution: false, roleIds: [], courseTargetIds: [], userTargetIds: [], unitTargetIds: [] };

test("cada opción sencilla llena los campos que espera el servidor", () => {
  assert.deepEqual(simpleAudienceFields("institution"), { ...none, audienceInstitution: true });
  assert.deepEqual(simpleAudienceFields("students"), { ...none, roleIds: ["STUDENT"] });
  assert.deepEqual(simpleAudienceFields("teachers"), { ...none, roleIds: ["TEACHER"] });
  assert.deepEqual(simpleAudienceFields("parents"), { ...none, roleIds: ["PARENT"] });
  assert.deepEqual(simpleAudienceFields("course", "c1"), { ...none, courseTargetIds: ["c1"] });
});

test("un curso sin elegir y la opción detallada no producen campos", () => {
  assert.equal(simpleAudienceFields("course"), null);
  assert.equal(simpleAudienceFields("detailed"), null);
  assert.equal(hasAudience(none), false);
  assert.equal(hasAudience({ ...none, unitTargetIds: ["u1"] }), true);
});

test("las opciones visibles son seis y usan lenguaje cotidiano", () => {
  assert.deepEqual(SIMPLE_AUDIENCE_OPTIONS.map((option) => option.label), ["Toda la institución", "Solo estudiantes", "Solo docentes", "Solo tutores", "Un curso", "Elegir con más detalle"]);
  for (const option of SIMPLE_AUDIENCE_OPTIONS) assert.doesNotMatch(`${option.label} ${option.hint}`, /rol|STUDENT|TEACHER|PARENT|audiencia/i);
});

test("describe la audiencia en palabras", () => {
  const courses = new Map([["c1", "Álgebra"], ["c2", "Inglés"]]);
  assert.equal(audienceText({ ...none, audienceInstitution: true, roleIds: ["STUDENT"] }), "toda la institución");
  assert.equal(audienceText({ ...none, roleIds: ["STUDENT"] }), "todos los estudiantes");
  assert.equal(audienceText({ ...none, roleIds: ["STUDENT", "TEACHER"] }), "estudiantes y docentes");
  assert.equal(audienceText({ ...none, courseTargetIds: ["c1"] }, { courses }), "el curso Álgebra");
  assert.equal(audienceText({ ...none, courseTargetIds: ["c1", "c2"] }, { courses }), "los cursos Álgebra e Inglés");
  assert.equal(audienceText({ ...none, courseTargetIds: ["c1", "x"] }, { courses }), "2 cursos");
  assert.equal(audienceText({ ...none, roleIds: ["PARENT"], userTargetIds: ["a", "b"], unitTargetIds: ["u"] }), "todos los tutores, 2 personas elegidas y 1 departamento");
  assert.equal(audienceText(none), "");
});

test("solo da una cifra cuando se puede calcular con los datos de la pantalla", () => {
  const people = [{ id: "a", role: "STUDENT" }, { id: "b", role: "STUDENT" }, { id: "c", role: "TEACHER" }];
  assert.equal(approximateRecipients({ ...none, audienceInstitution: true }, people), 3);
  assert.equal(approximateRecipients({ ...none, roleIds: ["STUDENT"] }, people), 2);
  assert.equal(approximateRecipients({ ...none, roleIds: ["STUDENT"], userTargetIds: ["a", "c"] }, people), 3);
  assert.equal(approximateRecipients({ ...none, courseTargetIds: ["c1"] }, people), null);
  assert.equal(approximateRecipients({ ...none, roleIds: ["STUDENT"], unitTargetIds: ["u"] }, people), null);
  assert.equal(approximateRecipients({ ...none, audienceInstitution: true }, []), null);
  assert.equal(approximateRecipients({ ...none, audienceInstitution: true }, people, 3), null);
  assert.equal(approximateRecipients(none, people), null);
});
