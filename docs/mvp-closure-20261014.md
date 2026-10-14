# Comprobación de pendientes del MVP — 14 de octubre de 2026

Estado: diagnóstico con dos defectos reproducidos, aplicación sin modificar. Rama
`m3/mvp-closure-20261014`, base `todo/tanda-4` en `4add96a752fa8a71e24a9bfe9395f2b0f1fafeea`.
Claim previo `8b1be4c`; [PR126](https://github.com/cank3r/edukana/pull/126).

## Resultados locales

Node 22.20.0, dependencias exactas del lockfile, Chromium de Playwright 1.64.0.
Las pruebas cargan páginas/componentes reales con fronteras de sesión, DAL y acciones simuladas.
El cliente de upload conserva su código real; sus peticiones HTTP reciben respuestas sintéticas.
No se crea ninguna cuenta, base de datos, archivo remoto, sesión real ni correo.

| Comprobación | Resultado | Alcance |
|---|---|---|
| Render de páginas | 4 PASS / 1 FAIL, sin skips | Estudiante ve instrucciones/recurso; docente no los ve aunque el roster los devuelve. Rutas no disponibles terminan en notFound. |
| UI a 360 y 1280 px | 16 PASS / 2 FAIL, sin skips | Ambos fallos reproducen el control de retirada de adjuntos. |
| Período | 4/4 PASS dentro de la UI | Nombre accesible exacto, selección explícita y periodId enviado; sin cambio de aplicación. |
| Datos de tarea | PASS en ambos tamaños | Saltos de línea y URL de recurso se conservan en el payload. |
| Adjuntos | PASS salvo retirada concurrente | Validación vacía; PDF con cliente real; cancelar/revisar; error y reintento al quitar; excluir archivo anterior sin DELETE; IDs enviados. |
| Teclado y móvil | PASS en ambos tamaños | Confirmación mediante teclado, controles de 44 px y sin desbordamiento; capturas inspeccionadas. |
| TypeScript, ESLint focal y diff-check | PASS | No acredita un build completo ni aceptación desplegada. |

La ejecución completa terminó sobre el código de aplicación intacto con 16/18 a las 22:19 UTC.
Una ejecución inicial tuvo dos fallos de localizador de período: `getByLabel` exacto no equivale
al nombre accesible del combobox. El árbol accesible y la nueva aserción por rol confirman «Período».
Otra repetición detectó una lectura prematura del efecto de navegación en el test; se espera el
efecto con `expect.poll`, conservando el destino exacto. Ninguno se presenta como defecto de aplicación.

## Correcciones acotadas propuestas

1. **Instrucciones del docente:** `tareas/[assignmentId]/page.tsx` no muestra `assignment.instructions`
   en la rama docente. Añadir la misma información ya autorizada por el roster, sin nuevas consultas
   ni permisos. [Handoff solicitado en PR114](https://github.com/cank3r/edukana/pull/114#issuecomment-6179673279).
2. **Retirada de adjunto:** `SubmissionFiles.tsx` no considera la petición DELETE en su estado
   ocupado. «Entregar tarea» permanece habilitado mientras se retira un archivo pendiente. La prueba
   retiene la respuesta con una promesa y comprueba el control antes de resolverla, sin depender
   de una demora real. Añadir esa operación al bloqueo de controles, conservando endpoints,
   payloads y retención. [Handoff solicitado en PR80](https://github.com/cank3r/edukana/pull/80#issuecomment-6179715483).

No se edita ninguno de esos archivos reclamados hasta recibir el handoff del propietario/coordinador.
La hipótesis de defecto del período se retiró en PR100: la política documentada permite cursos en
períodos históricos y no se propone cambiarla. Un período terminado no implica un bloqueo contractual.

## Reproducción y límites

```sh
node --require ./tests/integration/stub-server-only.cjs --import tsx --test tests/platform-mvp-closure.test.ts
npx playwright install chromium
npx playwright test --config=playwright.mvp-closure.config.ts
```

El workflow propio `MVP closure regression` conserva ambas puertas y artifacts con datos ficticios.
Mientras no se corrijan los defectos, las regresiones deben fallar; no se marcan como omitidas o esperadas.
Los resultados de CI se registran por SHA en PR126 y no se infieren de la ejecución local.

Estas pruebas no acreditan login desplegado, aislamiento real entre cuentas/instituciones, lectura
privada del proveedor, comparación de bytes, vencimiento de URLs ni transiciones de revocación.
Tampoco prueban persistencia en PostgreSQL del formulario de curso o de los archivos: son verificaciones
de UI, payload y límites de render. La matriz canónica continúa abierta para el entorno desplegado.
