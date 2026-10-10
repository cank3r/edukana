# Registros de CI

Rama: `m11/docente-independiente-ci`  
Commit: `4aa7d10bf47bf91898f29d0ebbf7982c18d07b4e`  
Actualizado: 2026-10-09 18:38 UTC

## browser-smoke

| Paso | Resultado | Registro |
|---|---|---|
| Preparar | success | `01-preparar.log` |
| Sembrar | success | `02-siembra.log` |
| build | success | `03-build.log` |
| Arrancar la aplicación | success | `04-servidor.log` |
| Recorrido | success | `05-recorrido.log` |

Capturas en la rama `qa-capturas`.

## validate

| Paso | Resultado | Registro |
|---|---|---|
| Instalar dependencias | success | `01-npm-ci.log` |
| Prisma validate/generate | success | `02-prisma.log` |
| Migraciones | success | `03-migraciones.log` |
| Migraciones = schema | success | `04-migraciones-diff.log` |
| npm test | success | `05-npm-test.log` |
| test:integration | failure | `06-test-integration.log` |
| lint | success | `07-lint.log` |
| typecheck | success | `08-typecheck.log` |
| build | success | `09-build.log` |

### Pruebas que fallaron (06-test-integration.log)

```
✖ failing tests:
test at tests/assignment-action-boundaries.test.ts:2:2438
✖ tareas: expired sessions cannot submit or grade; no service executes (283.542687ms)
test at tests/assignment-action-boundaries.test.ts:2:2910
✖ tareas: only an authorized student reaches the submission service (0.620389ms)
test at tests/assignment-action-boundaries.test.ts:2:3423
✖ tareas: session identity and every submission field reach the service unchanged apart from its documented trimming (0.077535ms)
test at tests/assignment-action-boundaries.test.ts:2:4180
✖ tareas: a graded re-submission rejection is preserved and does not refresh (0.13508ms)
test at tests/assignment-action-boundaries.test.ts:2:4625
✖ tareas: successful re-submission refreshes both canonical and course routes (0.045147ms)
test at tests/assignment-action-boundaries.test.ts:2:5127
✖ tareas: students and parents cannot call gradeSubmissionAction directly (0.038527ms)
test at tests/assignment-action-boundaries.test.ts:2:5461
✖ tareas: grade, feedback, and correction reason are delegated without score coercion (0.037775ms)
test at tests/assignment-action-boundaries.test.ts:2:6095
✖ tareas: missing correction reason and blank score stay blank for canonical validation (0.210061ms)
test at tests/assignment-action-boundaries.test.ts:2:6530
✖ tareas: publication reads only its own fields and preserves failure without fallback (0.115852ms)
test at tests/assignment-action-boundaries.test.ts:2:7116
✖ tareas: students and parents cannot publish; no service executes (0.142071ms)
test at tests/course-home-navigation.test.mjs:5:3389
✖ estudiante: la portada enlaza a sus áreas sin leer evaluaciones ni ofrecer herramientas de gestión (0.043595ms)
test at tests/course-home-navigation.test.mjs:5:4466
✖ estudiante con el curso completado: aviso de solo consulta y acceso a sus resultados (0.037776ms)
test at tests/course-home-navigation.test.mjs:5:4885
✖ alcance: otra institución, inscripción retirada, sin permiso, tutor u otro docente no ven el curso (0.03398ms)
test at tests/course-home-navigation.test.mjs:5:5504
✖ docente: ve las áreas de gestión y el horario, no las vistas del estudiante (0.031948ms)
test at tests/exam-list-navigation.test.mjs:4:2016
✖ the linked timed list leads to the real intro and preserves ongoing/retry/result navigation (0.031086ms)
test at tests/exam-list-navigation.test.mjs:4:2727
✖ blocked starts expose details and history only, including exhausted and completed courses (0.075081ms)
test at tests/exam-list-navigation.test.mjs:4:3330
✖ empty, foreign and non-student timed lists do not offer new attempts (0.034932ms)
```
