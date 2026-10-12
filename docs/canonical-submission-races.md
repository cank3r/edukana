# Prueba de consistencia al entregar y descartar archivos

Estado: dos defectos reproducidos y corregidos en el alcance autorizado el 12-Oct a las 19:43 UTC.
Aplicación base: `ffaadff471c4c02341b31619dbef8956bf1b4896`.
Base del corte de corrección: `d5f93cc679b8ab0b0097acb89b1699c651655436`.
Prueba: `tests/integration/canonical-submission-races.proof.ts`.

El agente de persistencia y después el integrador ejecutaron las tres pruebas con Node 22.20.0,
PostgreSQL 16.4 y archivos privados locales. Contenedores exclusivos del diagnóstico, sin puertos
publicados, con etiqueta `edukana.canonical.owner=20261012-mvp-persistence`. No se usó Preview,
Supabase, correo ni datos reales. Durante la reproducción inicial no hubo cambios de aplicación;
solo se aplicaron las 16 migraciones existentes a la base temporal nueva. El corte autorizado
posterior cambia únicamente la entrega/descarte de archivos, sin schema, migraciones nuevas,
permisos de lectura ni el atajo de acceso del propietario.

## Reproducción previa a la corrección

| Caso | Resultado | Estado final observado |
|---|---|---|
| Entrega secuencial y descarte posterior | PASS | Descarte denegado; archivo vinculado y bytes originales conservados |
| Descarte obtiene primero el bloqueo | FAIL | Ambos servicios devuelven éxito; entrega SUBMITTED sin contenido ni archivos; objeto ausente |
| Entrega obtiene primero el bloqueo | FAIL | Descarte iniciado antes borra el archivo ya entregado; entrega SUBMITTED sin contenido ni archivos |

En ambos casos concurrentes se observó la cadena de bloqueos real con `pg_blocking_pids` y
procesos PostgreSQL distintos. Una transacción retiene `FOR UPDATE` sobre el archivo; se ordenan
las operaciones reales de descarte y entrega, y después se libera. No se simulan consultas,
transacciones ni respuestas de los servicios. Se comprueban filas, relación a la entrega y objeto
en disco; la prueba exige también igualdad de bytes cuando la entrega debe conservarse.

Errores de invariantes exactos:

- `A submission with zero surviving files must be rejected` (`true !== false`).
- `A stale pending-file authorization cannot delete delivered evidence` (`true !== false`).

Un timeout, un preflight rechazado o un fallo del control secuencial sería inconcluso. No equivale
a estas reproducciones. Una corrección que introduzca bloqueos puede requerir adaptar la barrera;
un timeout posterior tampoco debe presentarse como regresión funcional o éxito.

## Corrección y regresiones ejecutadas

`src/server/courses/uploads.ts`: el descarte intenta primero un `deleteMany` condicionado por
institución, propietario, ausencia de entrega y el estado que autoriza quitar el archivo. Para
archivos pendientes de una tarea también conserva el `assignmentId`; para otras subidas exige
que sigan sin confirmar. Si otra operación cambió ese estado, devuelve rechazo sin tocar bytes.
El objeto se limpia únicamente después de que el borrado de la fila haya terminado.

`src/server/courses/submission-files.ts`: la vinculación repite el filtro completo de archivos
pendientes y exige que `updateMany.count` coincida con todos los archivos solicitados. Una
diferencia lanza `StaleFiles` dentro de la transacción y revierte entrega, vínculos e historial.
Se conserva el mensaje recuperable existente. No se modificaron permisos ni `assetReadAccess`.

PostgreSQL reevalúa el predicado del borrado después de esperar una actualización concurrente.
Las mismas barreras `DELETE`/`UPDATE` de la reproducción original siguen funcionando: no fue
necesario modificar el orden observado ni relajar invariantes.

| Caso después del cambio | Resultado | Estado final comprobado |
|---|---|---|
| Entrega secuencial y descarte posterior | PASS | Descarte rechazado; vínculo y bytes idénticos |
| Descarte primero | PASS | Descarte aprobado; entrega rechazada y ninguna fila Submission creada |
| Entrega primero | PASS | Entrega aprobada; descarte rechazado; un archivo vinculado con bytes idénticos |
| Descarte primero con dos archivos | PASS | Toda la entrega revierte; el otro archivo continúa pendiente con bytes idénticos |

Resultado dedicado: **4/4 PASS**, Node 22.20.0, PostgreSQL 16.4, almacenamiento privado local.
Regresión existente `tests/integration/uploads.test.ts`: **8/8 PASS**, incluyendo archivos de
versiones anteriores, otros estudiantes/instituciones, formato de bytes e imágenes públicas.
ESLint de los tres archivos de código, TypeScript completo (`--noEmit --incremental false`) y
`git diff --check`: PASS. No se ejecutó un build nuevo ni la suite global en este corte aislado;
corresponden a la integración revisada. Las dependencias se montaron solo lectura y no se regeneraron.

La limpieza del objeto sigue siendo best-effort: si falla después del borrado confirmado de la
fila, puede quedar un objeto huérfano sin autorización mediante la aplicación. No hay una
transacción distribuida PostgreSQL/Storage y no se afirma haber probado fallos reales de Supabase.
Esta elección impide que una autorización obsoleta de descarte borre bytes ya entregados.

## Ejecución dedicada

```sh
node --require ./tests/integration/stub-server-only.cjs --import tsx --test \
  --test-concurrency=1 --test-reporter=spec tests/integration/canonical-submission-races.proof.ts

# Mismo PostgreSQL desechable, fixture de integración separado del recorrido UI:
EDUKANA_INTEGRATION_DB=1 node --require ./tests/integration/stub-server-only.cjs --import tsx \
  --test --test-concurrency=1 --test-reporter=spec tests/integration/uploads.test.ts
```

Solo dentro de los contenedores propios con la configuración sintética del diagnóstico. El guard
requiere `CANONICAL_SUBMISSION_RACE_PROOF=ISOLATED_POSTGRES_ONLY`, endpoints idénticos en loopback,
base `edukana_persistence_proof`, usuario de fixture, ocho conexiones y ausencia de proveedor externo.
Además consulta identidad real del servidor antes de crear fixtures. Los errores del guard no
imprimen valores rechazados. Los fixtures usan identificadores nuevos y la limpieza se limita a
la institución creada por esa ejecución y su directorio temporal verificado.

El sufijo `.proof.ts` separa este diagnóstico dedicado del glob general de integración, cuyo
destino es otro. No se deshabilitó ninguna prueba existente ni se marcaron fallos como esperados.
Antes de integrar una corrección deben incorporarse regresiones obligatorias al CI con un entorno
compatible. Este diagnóstico no acredita el recorrido UI desde cero ni Supabase desplegado.

QA independiente inicial: barreras, control positivo, guard seguro y conservación de bytes
revisados. La revisión independiente de la corrección se registra en el handoff de este corte.
La aceptación de UI/Preview y la inclusión explícita de estas regresiones en el CI del candidato
siguen pendientes del integrador. No hubo push, merge ni despliegue desde este worktree.
