# Prueba de consistencia al entregar y descartar archivos

Estado: dos defectos reproducidos; corrección de Storage pendiente de ampliar alcance.
Aplicación base: `ffaadff471c4c02341b31619dbef8956bf1b4896`.
Prueba: `tests/integration/canonical-submission-races.proof.ts`.

El agente de persistencia y después el integrador ejecutaron las tres pruebas con Node 22.20.0,
PostgreSQL 16.4 y archivos privados locales. Contenedores exclusivos del diagnóstico, sin puertos
publicados, con etiqueta `edukana.canonical.owner=20261012-mvp-persistence`. No se usó Preview,
Supabase, correo ni datos reales. No hubo cambios de aplicación, contratos, schema o migraciones;
solo se aplicaron las migraciones existentes a la base temporal nueva.

## Resultados reales

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

## Ejecución dedicada

```sh
node --require ./tests/integration/stub-server-only.cjs --import tsx --test \
  --test-concurrency=1 --test-reporter=spec tests/integration/canonical-submission-races.proof.ts
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

QA independiente: barreras, control positivo, guard seguro y conservación de bytes revisados.
La corrección propuesta deberá rechazar y revertir la entrega cuando no pueda vincular todos
sus archivos, y serializar/revalidar el descarte para impedir que borre evidencia ya entregada.
Los archivos afectados serían `src/server/courses/{submission-files,uploads}.ts`; no se editaron.
