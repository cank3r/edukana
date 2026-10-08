# Revisión de S0-GOV (Claude)

**Base:** `0e67a91`. Solo lectura; ningún archivo de S0 fue editado.

**Veredicto: aprobado con cuatro correcciones menores.**
S0 no tocó `src/`, `prisma/` ni `.circleci/` (verificado con diff contra `cff38c6`), y `cff38c6` es ancestro de `0e67a91`: no se perdió historia. El steering ya describe el código real.

### Correcciones menores (archivos del claim de Kiro)

| # | Archivo | Problema | Corrección |
|---|---|---|---|
| A1 | `.kiro/steering/current-state.md` | Dice "Último commit publicado: `cff38c6`" y "Hay cambios locales aún sin commit". Ambas frases quedaron falsas con `0e67a91`. | Quitar el SHA fijo (envejece en cada commit) y borrar la línea de cambios locales. |
| A2 | `.kiro/steering/current-state.md`, decisión 6 | El enum propuesto usa `PRESENTIAL`. | Usar `IN_PERSON` antes de que llegue al esquema; renombrar un enum de Postgres después es una migración. |
| A3 | `.kiro/steering/simplicity.md` | Se perdió la regla de máximo 5 opciones de menú por rol. Es la que más protege la navegación cuando se agreguen módulos. | Restituirla como regla 13, o registrar la decisión de no adoptarla. |
| A4 | `playwright.pilot.config.mjs` | `channel: "msedge"` fija Edge del sistema. El runner no podrá ejecutarse en CircleCI (Linux) cuando S1 lo integre. | Leer el canal de una variable (`PILOT_BROWSER_CHANNEL`, por defecto Chromium incluido). |

### Alcance de S1: historia académica se queda (decisión de Carlos, 2026-10-08)

Propuse mover la historia académica a S3/S6 para no migrar dos veces las tablas que S3 llevará a `offeringId`. Carlos decidió mantenerla en S1. Para respetar la decisión sin duplicar migraciones, el diseño (R9) usa tablas de revisión que referencian `submissionId`, `gradeEntryId` y `examQuestionId`, no `courseId`: el cambio a `Offering` de S3 no las toca.

### Observaciones sin acción inmediata

- **S0-07** reporta 87/87 como validación. Es correcto como regresión, pero esas pruebas siguen sin tocar una base de datos; no deben citarse como evidencia de aislamiento hasta cerrar B1.
- **S0-10** (repositorio público) y **S0-11** (infraestructura) siguen abiertos y son decisiones de Carlos.
- `master` sigue en el Alpha (`cfac1b3`). Mientras no se fusione, cada agente nuevo que clone por defecto verá un producto distinto.
- La contraseña `PilotPassword123` en `tests/canonical-pilot-runner.test.mjs` es un valor de prueba, no un secreto. Sin hallazgos de secretos en el diff.

