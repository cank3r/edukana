# Matrícula: recuperación de búsqueda e inscripción

Actualización 12-Oct-2026: Carlos autorizó integrar PR116 y publicar PR117 sin fusionarlo. PR116 está integrado en `1a220855cc59fb14fbc6d49c225984275e40e6e5`. PR117 incorpora esa base; el único conflicto fue documental en TEAM, resuelto preservando todas las filas de la coordinadora y añadiendo la propia. El código y las pruebas de matrícula permanecen idénticos a `eea4e73b7b1b231288c7ff5eff0cc7ecdb69d7f3`. Tras reconciliar: 188 unitarias, TypeScript y 26 pruebas de navegador PASS. El estado final del CI se registra con su SHA en la descripción de PR117; no se autoriza su fusión.

Base `24892ee1df52c2e86252f5b0ad20706a0732e084`, rama `m2/matricula-ux-corte-c-20261011`, claim `M2-MATRICULA-CORTE-C`, [PR117](https://github.com/cank3r/edukana/pull/117). Continúa el desarrollo autorizado mientras PR116 espera una decisión de integración; PR116 permanece intacto en su rama.

## Hallazgo reproducido antes de cambiar el código

El recorrido existente va de Personas a Cursos, la pantalla de estudiantes del curso y «Inscribir estudiantes». La búsqueda por nombre/correo, selección individual y matrícula de grupos ya existen. Este corte no crea otra forma de matrícula.

Un fixture con el componente original `EnrollPanel`, React y CSS reales reprodujo cuatro fallos en Chrome a 360 px:

1. Si la búsqueda rechaza la promesa de transporte, queda «Buscando…» sin error recuperable. El navegador registra `Simulated search transport failure`.
2. Si falla el transporte de la confirmación individual, React deriva al error boundary del fixture y desaparece el formulario con su selección: `Simulated students transport failure`.
3. La confirmación de grupo tiene el mismo problema y pierde el grupo visible: `Simulated group transport failure`.
4. Mientras se está confirmando, «Cerrar» sigue habilitado; permite desmontar el formulario pendiente y abrir otro que puede recibir el resultado anterior.

Las cuatro comprobaciones del comportamiento esperado fallaron sobre la base sin modificar. La evidencia está conservada en `../matricula-ui-artifacts/before/`: reporte HTML, JSON, capturas, trazas y adjuntos con llamadas, errores y texto. Son fallos de transporte simulados deliberadamente, no incidentes de una base o servicio real.

## Corrección acotada

La búsqueda puede reintentarse sin perder consulta o selección y sin aplicar respuestas antiguas. Las confirmaciones conservan estudiantes o grupo, muestran un error recuperable y evitan envíos duplicados. Cierre y cambio de modalidad permanecen bloqueados durante la escritura. No se reintenta ninguna inscripción automáticamente. Tras un error de respuesta se actualiza la lista mediante una lectura, conservando el formulario y orientando al usuario a comprobar los inscritos antes de confirmar otra vez.

El servicio actual usa transacción y bloqueo del curso; las pruebas ya cubren cupos e idempotencia. Sin embargo, la respuesta puede fallar después del commit al refrescar las rutas. Por eso el cliente no promete rollback ni inventa un resultado. Un nuevo intento de grupo vuelve a consultar sus miembros actuales; no se promete que sean exactamente los mismos destinatarios.

No se modifican acciones, servicios, permisos, contratos, esquema, migraciones, listado de inscritos, retiro ni reincorporación. `StudentTools.tsx` conserva esas regiones y reexporta el formulario extraído a `EnrollPanel.tsx`, `EnrollPicker.tsx` y `enrollment-ui.tsx`.

## Coordinación y límites

- PR114, `449e97f7`: formatos de notas y fechas; incluye fichas académicas y páginas de evaluación. No se adoptan ni modifican sus archivos.
- PR100, `388d29d`: CRUD, estados y permisos de cursos, apilado sobre sus ramas M2. No se reimplementa ese trabajo ni se modifica `course.ts`, acciones de cursos, páginas de creación/edición o capabilities.
- PR116, `e72b31e`: importación de Personas; queda separado, con sus checks aprobados y sin cambios de este corte.
- Las skills locales son de Prisma Composer 0.25 y Prisma Platform 8 RC; no corresponden al cambio de cliente sobre Prisma 5.22. Se consultaron las guías de formularios y manejo de errores de Next instaladas.

## Verificación

| Comprobación | Resultado |
|---|---|
| Reproducción antes del cambio | 4/4 regresiones fallan en el componente original; evidencia preservada |
| Integración existente de matrícula | PASS: 7 casos en PostgreSQL 16.4 descartable, incluidos cupos concurrentes, aislamiento, permisos, grupos e idempotencia |
| Navegador del componente corregido | PASS: 26 ejecuciones, 13 escenarios a 360/1280 px; 0 errores, omitidos o flaky |
| Suite global | PASS: 170 pruebas de esta base, sin incorporar los tests de PR116 aún no integrado |
| Lint, tipos, Prisma validate/generate y build | PASS; build con variables ficticias y sin archivos .env de aplicación |
| Auditoría de dependencias de producción | PASS: 0 vulnerabilidades |
| Revisión independiente | PASS: sin hallazgos accionables; preservación de regiones ajenas, transporte, respuestas antiguas y bloqueo de envío revisados |
| CI de implementación | Consultar el SHA actual de PR117; el CI inicial del claim no certifica el código posterior |
| Preview autenticado | No ejecutado; integración pendiente de autorización |

La integración usó exclusivamente `127.0.0.1:55436` y credenciales ficticias en un contenedor propio, eliminado al terminar. El entorno de aplicación no se heredó. Los fixtures del navegador bloquean red externa y excluyen módulos de servidor, DB y autenticación; no prueban persistencia desplegada. Sin merge ni despliegue automático.

Reporte final: `../matricula-ui-artifacts/report/index.html`; resultados: `../matricula-ui-artifacts/results.json`; dos capturas `matricula-confirmacion.png` bajo `results/`, inspeccionadas en móvil y escritorio. La suite verifica un refresco de lectura tras el fallo y un segundo tras el éxito explícito, sin escrituras automáticas. Se ejecuta con `npx playwright test --config=playwright.enrollment.config.ts`; no se modifica el workflow compartido. Node local 24.14; el CI del repositorio usa Node 22.
