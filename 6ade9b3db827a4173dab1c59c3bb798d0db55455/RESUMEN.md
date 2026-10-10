# Registros de CI

Rama: `demo/datos-vivos`  
Commit: `6ade9b3db827a4173dab1c59c3bb798d0db55455`  
Actualizado: 2026-10-10 01:05 UTC

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
| test:integration | success | `06-test-integration.log` |
| lint | success | `07-lint.log` |
| typecheck | success | `08-typecheck.log` |
| build | success | `09-build.log` |
