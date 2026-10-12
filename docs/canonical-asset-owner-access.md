# Acceso vigente del propietario a archivos de curso

## Alcance aprobado

Carlos autorizó este cambio el 2026-10-12 a las 20:21 UTC. Claim: `MVP-ASSET-OWNER-SCOPE`, rama `mvp/asset-owner-scope-20261012`, base `65f5b6a1395c6cee49b2348a577b354bffb19175`.

El coordinador reportó evidencia HTTP del recorrido canónico: al retirar `course.view` al docente aún asignado al curso, las nuevas peticiones de archivos propios devolvían 302. La propiedad evitaba comprobar el acceso vigente. Las URLs emitidas anteriormente sí caducaban a los 60/300 segundos. Esa reproducción de navegador pertenece al coordinador; las pruebas realizadas en este frente se detallan abajo.

## Decisión y conservación de permisos

`assetReadAccess` comprueba el alcance de curso para todo archivo con `courseId` y sin `announcementId`, incluido su propietario. Se reutilizan los alcances existentes de lectura y gestión. Un propietario con lectura vigente puede abrir su archivo `PRIVATE` sin necesitar `course.manage`; los privados ajenos siguen exigiendo gestión. Perder el alcance vigente por capacidad, asignación o matrícula, según los permisos del actor, devuelve 403 antes de emitir otra URL. Un docente con `course.view.all` conserva el alcance de lectura aunque deje de estar asignado. Restaurar ese acceso recupera la lectura.

Las matrículas `ACTIVE` y `COMPLETED` conservan lectura de archivos propios actuales e históricos. Los históricos retienen `courseId` y `uploaderId` después del reenvío, aunque se hayan desvinculado de la entrega actual. No se amplían consultas a revisiones.

Los avisos conservan precedencia cuando ambos IDs coexisten: la rama de curso no sustituye la política existente de propietario/audiencia de avisos. También se conservan avatar y logo sin curso, imágenes públicas en uso, aislamiento por institución y denegación de registros pendientes o rutas inválidas. No cambian el handler HTTP, la firma, los TTL de 60/300 segundos, el esquema ni la atomicidad de entrega/descarte de la base.

## Evidencia reproducible

Runtime exclusivo: Node 22.20.0 y PostgreSQL 16.4, contenedores `edukana-owner-scope-20261012-node` y `edukana-owner-scope-20261012-pg`, etiqueta `codex.owner=canonical-asset-owner-20261012`. PostgreSQL usa almacenamiento temporal, sin puertos publicados. Se aplicaron las 16 migraciones existentes a dos bases sintéticas propias: `edukana_owner_scope` y `edukana_persistence_proof`. No se leyó configuración real ni se accedió al PostgreSQL del recorrido canónico, Preview o una base remota. No se ejecutó un seed de aplicación/demo ni se crearon migraciones. Tras las pruebas se retiraron únicamente estos dos contenedores y sus bases temporales; se conservó el volumen compartido de dependencias.

| Comprobación | Resultado |
| --- | --- |
| Integración uploads con código anterior y nuevas regresiones | 9 pasan / 3 fallan: propietario sin `course.view`, matrícula `DROPPED` y URL privada de portada devuelven 200 donde corresponde 403 |
| Misma integración después del cambio | 12/12 pasan |
| Carreras de entrega/descarte en PostgreSQL real | 4/4 pasan; ambos órdenes de bloqueo y rollback de dos archivos preservan los invariantes y bytes |
| Ejecución conjunta idéntica a CI | 16/16 pasan, cero fallos u omisiones |
| Unidades de alcance de curso, avisos y almacenamiento local | 21/21 pasan |
| TypeScript completo, ESLint de ambos archivos, Prisma validate y diff check | Pasan |
| QA independiente de función y helpers reales con puertos simulados | 32/32 sondas pasan; no se contabilizan como integración PostgreSQL |

La matriz añadida cubre documento/vídeo y visibilidad `COURSE`/`PRIVATE`, capacidad/asignación perdida y restaurada, matrícula actual/histórica, privados ajenos, avisos con ambos IDs y flag del tutor. Las filas de documento/vídeo nuevas son fixtures de metadatos para autorización; los casos preexistentes ejercen bytes de carga reales. No representan una nueva prueba de reproducción de vídeo ni de caducidad HTTP.

El comando conjunto, con `EDUKANA_INTEGRATION_DB=1`, `CANONICAL_SUBMISSION_RACE_PROOF=ISOLATED_POSTGRES_ONLY`, `APP_URL=http://127.0.0.1:3169` y ambas conexiones dirigidas exclusivamente a la base sintética propia `edukana_persistence_proof`, fue:

```sh
node --require ./tests/integration/stub-server-only.cjs --import tsx --test --test-concurrency=1 --test-reporter=spec tests/integration/canonical-submission-races.proof.ts tests/integration/uploads.test.ts
```

## Handoff

QA independiente revisó el diff, el documento y la conservación de contratos sin hallazgos bloqueantes. El integrador debe incorporar el commit local, ejecutar build/CI y repetir el recorrido canónico HTTP existente sin relajar la denegación de nuevas URLs, manteniendo las comprobaciones de caducidad real de 60/300 segundos. Este frente no certifica ese recorrido posterior ni un despliegue. Sin push, merge o cambios en Preview.


## Verificacion integrada del coordinador

Run10 termino el 2026-10-12 a las 21:01:59 UTC: **23/23 PASS**, SHA limpio 2d8d9d22b3db815493b33fffaa01915bfa0bf22c. Build, tipos y lint PASS. El detalle, los intentos previos y los limites estan en [evidencia canonica](canonical-mvp-evidence.md). CI del candidato, Preview y aceptacion de Carlos siguen pendientes; sin merge/deploy.
