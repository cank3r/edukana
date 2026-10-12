# Asistencia: recuperación del formulario

## Alcance aprobado

PR118, rama `m2/asistencia-ux-corte-d-20261012`, base `1a220855cc59fb14fbc6d49c225984275e40e6e5`.
Solo `AttendanceTools.tsx`, helper UI local si resulta necesario, pruebas aisladas de asistencia,
su configuración y workflow propios, este documento y la fila `M2-ASISTENCIA-CORTE-D`.
No se cambian acciones, servicios, autorización, contratos, schema, migraciones ni datos.
PR114 y PR117 conservan sus archivos y reservas.

## Criterios antes de corregir

1. Distinguir rechazo esperado `{ok:false}` de promesa rechazada y comprobar tanto el estado enviado como los controles visibles.
2. Reproducir con React real la pérdida del formulario al llegar al error boundary.
3. Comprobar si se pueden editar campos mientras se guarda y si el éxito anterior sigue visible tras editar.
4. Mantener título, marcas y notas al recuperar un fallo; permitir un nuevo envío únicamente por decisión del usuario.
5. El fallo de transporte no acredita si la escritura ocurrió: el texto debe explicar esa incertidumbre.
6. Mantener la confirmación y el impacto del borrado, sin reintentos automáticos.
7. Verificar 360 px, escritorio, teclado, payload enviado y ausencia de excepciones sin manejar.

## Comportamiento corregido

Un rechazo de la promesa antes desmontaba el formulario hacia el error boundary; al reabrirlo se perdía
el borrador. Ahora se informa de un resultado incierto y se mantienen título, marcas y notas.
Además, React restablecía los radios a su selección inicial después de resolver la acción, incluso con
`{ok:false}`: el radio mostraba Presente, pero el JSON todavía enviaba Ausente y su nota.
Un listener nativo estable cancela ese reset; se retira al desmontar. El handler sintético `onReset`
no puede cancelarlo porque React desactiva su dispatcher de eventos durante ese commit.

Un guard síncrono en `onSubmit` evita encolar dos escrituras antes de que aparezca `pending`.
Los controles editables quedan bloqueados durante el envío, después de capturar FormData;
el éxito anterior desaparece al editar título, marca, nota o sugerencia.
El borrado conserva la confirmación y el impacto actuales, con un único envío y recuperación local
de la promesa rechazada. Ninguna operación se reintenta automáticamente.

## Textos de recuperación

- Guardado incierto: «No pudimos confirmar si se guardó la asistencia. Tus marcas siguen aquí.
  Revisa el historial en otra pestaña antes de volver a guardar.»
- Borrado incierto: «No pudimos confirmar si se borró la asistencia. Actualiza el historial antes de repetir el borrado.»
- Un rechazo del servidor conserva su mensaje existente; no se reinterpretan permisos ni reglas académicas.

## Pruebas y límites

El fixture importa los componentes reales y las hojas de estilo de la aplicación, usa React 19
y sustituye exclusivamente las acciones y la navegación por funciones en memoria.
Prohíbe importar servidor, autenticación o base de datos y bloquea peticiones del navegador fuera de loopback.
No demuestra persistencia, transporte RSC real, autenticación ni recuperación después de cerrar o recargar la página.
Los recorridos y la integración existentes de CI cubren la aplicación con PostgreSQL efímero.
El Preview y la aceptación de Carlos siguen pendientes; este corte no autoriza merge ni despliegue.

## Evidencia

- Original `a11fe4a` (mismo código de aplicación que la base): 8 reproducciones esperadas
  (4 defectos × 360/1280) y 4 fallos de regresión que descubrieron radio desincronizado y doble envío.
  Diagnóstico adicional del radio: 2/2; DOM Presente, JSON Ausente y nota retenida.
- Final local: **26/26 regresiones activas**, 0 errores sin manejar y 0 llegadas al boundary.
  Las 10 pruebas históricas que demuestran el comportamiento defectuoso se omiten por defecto;
  solo se habilitan con `ATTENDANCE_BASELINE=1` sobre el componente original.
- Casos finales: error devuelto y transporte; borrador y payload completo; bloqueo durante pending;
  doble envío de guardar/borrar; las cuatro ediciones posteriores al éxito; rechazo y confirmación de borrado;
  teclado y ausencia de desbordamiento en 360/1280. Datos ficticios exclusivamente.
- Ejecución local con Node 24.14.0 y Chrome; **Node 22 se valida en CI**.
  188 unitarias, ESLint, TypeScript y Prisma validate aprobados. Generación, build, integración PostgreSQL,
  regresión de navegador de aplicación y auditoría se verifican en los workflows existentes de CI.
- Comando final: `node node_modules/@playwright/test/cli.js test -c playwright.attendance.config.ts`.
  Informes locales fuera del checkout: `../attendance-ui-baseline`, `../attendance-ui-baseline-diagnostic`
  y `../attendance-ui-final`. El workflow propio guarda sus informes como artifact `attendance-ui-<SHA>-<run>-<attempt>`.
- Revisión independiente del código y los resultados: **sin bloqueantes abiertos**; 6/6 casos focales
  ejecutados por el revisor en 360/1280 (rechazo esperado, transporte, doble envío).
  Informe local `../attendance-ui-qa/results.json`. El SHA final y los resultados remotos
  se registran en la descripción y los checks de [PR118](https://github.com/cank3r/edukana/pull/118).

## Siguiente paso

Completar CI del candidato. Después, Carlos decide cuándo habilitar y recorrer un Preview
para aceptar el comportamiento. No hay autorización de merge ni despliegue en este corte.
