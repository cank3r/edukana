# Personas: importación confiable

Base `24892ee1df52c2e86252f5b0ad20706a0732e084`, después de PR115 integrado, CI completo aprobado y aceptación visual de Carlos el 11 de octubre a las 23:02 UTC. Rama `m1/importacion-ux-corte-b-20261011`, claim `M1-IMPORTACION-CORTE-B`, PR116 en borrador. Es una corrección del flujo existente autorizado; no implementa la spec DRAFT 04 completa.

## Estado y próximos pasos

1. **Importación y acceso — este corte.** El parser CSV, plantilla, revisión, confirmación, reporte descargable e idempotencia ya existen. Se corrigen recuperación ante errores y duplicación del directorio; no se reescribe el importador.
2. **Personas a matrícula — siguiente candidato.** Revisar el recorrido usando los cursos y matrícula existentes; elegir después un defecto concreto, con claim propio. No implica crear Course/Offering ni cambiar contratos académicos.
3. **Asistencia y notas — siguiente candidato.** Completar el recorrido docente y contrastarlo con PR114 de formato/fechas antes de modificar. La deuda de historial al exonerar o quitar exoneración requiere un alcance auditable aprobado; no se improvisa un cambio de esquema en este corte.

Los documentos antiguos de roadmap enumeran capacidades ya construidas. CSV, identidad, recuperación, programas, grupos, cursos, tareas, exámenes, notas y backoffice no se consideran trabajo nuevo por figurar pendientes allí. La observabilidad de recuperación sigue en un parche separado. Configurar un proveedor de correo es una operación distinta de mejorar el código de importación.

## Comportamiento y límites

- El directorio de Personas concentra búsqueda, edición, suspensión y reactivación. Importar e invitar deja de mantener otra lista limitada a 50 resultados. Su enlace de regreso conserva el contexto validado del directorio.
- La revisión no crea personas. La confirmación usa el mismo archivo revisado, y cambiarlo o cancelar invalida el resumen. Los controles evitan llamadas duplicadas durante una operación.
- Un error de confirmación conserva el archivo y exige revisarlo otra vez. El servidor procesa lotes y puede fallar después de crear algunas personas; no se promete rollback ni se inventa un conteo parcial. La revisión posterior reconoce las personas ya existentes mediante el contrato actual.
- La advertencia de resultado incierto permanece si falla o se cancela otra lectura del mismo archivo. Una revisión exitosa actualiza los pendientes de invitación incluso si ya no quedan personas nuevas por crear, sin repetir ninguna escritura.
- Importar no envía invitaciones. El envío masivo sigue siendo una acción separada sobre todos los pendientes de la institución. Los mensajes aclaran que el resultado se actualiza por lote y que aceptación por el proveedor no demuestra entrega.
- Se mantienen parser, acciones, servicios, autorización, contratos, esquema y migraciones. No se usan credenciales, base demo ni correo real.
- Los errores de encabezado o límite pueden representar todo el archivo; el número de errores no se presenta como un conteo universal de filas descartadas.
- Existe un límite previo: la acción valida hasta 2 MiB, mientras Next conserva su límite predeterminado de 1 MB para Server Actions. No se amplía configuración ni se promete soporte efectivo de 2 MB en este corte.

## Verificación

| Comprobación | Estado |
|---|---|
| Integración CSV existente en PostgreSQL 16.4 desechable | PASS: 11 casos, incluidos 1.600 estudiantes, segunda importación sin duplicados y aislamiento entre instituciones |
| Suite unitaria global | PASS: 188 casos, incluidos 11 nuevos de la acción y 7 de la página |
| Navegador de importación | PASS: 26 ejecuciones, 13 escenarios en 360 y 1280 px; revisión, confirmación, archivo distinto, cancelación, errores, respuestas antiguas, recuperación parcial, foco e informe CSV |
| Regresión de Personas en navegador | PASS: 20 ejecuciones, 10 escenarios en 360 y 1280 px |
| Lint, tipos, Prisma validate/generate y build | PASS; build con variables ficticias y sin archivos .env de aplicación |
| Auditoría de dependencias de producción | PASS: 0 vulnerabilidades |
| Revisión independiente | PASS; resueltos refresco de pendientes y conservación de incertidumbre; sin hallazgos abiertos confirmados |
| CI del código final | Consultar los checks de [PR116](https://github.com/cank3r/edukana/pull/116) para su SHA actual; el CI de la publicación inicial del claim no certifica la implementación |
| Recorrido autenticado de este corte en Preview | No ejecutado; requiere integración posterior autorizada |

La base de integración se creó con credenciales ficticias, ligada únicamente a `127.0.0.1:55434`, y el contenedor propio se detuvo y eliminó al terminar. Las variables del entorno de aplicación no se heredaron. Los tests de navegador usan componentes reales, acciones simuladas, CSS real y Chrome efímero; no equivalen a persistencia o navegación completa de Next.

Artefactos locales: `../personas-import-ui-artifacts/results.json`, `../personas-import-ui-artifacts/report/index.html` y dos capturas `importacion-revision.png` dentro de `results/`, inspeccionadas en móvil y escritorio. La validación local usa Node 24.14; el CI del repositorio valida con Node 22. Las pruebas nuevas de componentes se ejecutan con `npx playwright test --config=playwright.people-import.config.ts`; no se añadió este comando al workflow compartido.

Este PR no se fusiona ni despliega automáticamente. Se entrega como candidato con pruebas y CI terminal para la revisión siguiente.
