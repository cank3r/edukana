# Aceptación del MVP — 13 de octubre de 2026

**Estado: abierto.** La aceptación humana del portal tutor y la entrega de su invitación están
confirmadas. Quedan pendientes las negativas autenticadas en Preview y las pruebas de archivos
privados/revocación en Supabase. Las revisiones adicionales también encontraron defectos de
autorización, corregidos en un candidato separado. Su canónico pasó. Una aserción obsoleta de CI
se sustituyó por comportamiento del handler real y pasó localmente; los resultados terminales
del nuevo SHA se registran en los checks y la descripción de PR123. No se integró ni desplegó el candidato.

## Identidad de la versión y evidencia comprobada

- Aplicación integrada: `8115614be8f0870826deda18b1fe3d9a86b6e40e`, PR [122](https://github.com/cank3r/edukana/pull/122).
- [CI general](https://github.com/cank3r/edukana/actions/runs/38311342836): SUCCESS, mismo SHA.
- [CI canónico y atomicidad](https://github.com/cank3r/edukana/actions/runs/38311442986): SUCCESS, mismo SHA.
  El recorrido terminó el 12-oct a las `21:44:16.856Z`; el job canónico terminó `21:44:20Z`.
- El resumen público declara `sourceDirty=false`, 23/23, seis bloques completos,
  `disposable PostgreSQL + local private storage`, correo local y `preview: not exercised`.
  SHA256 del resumen: `767D52C5F347E2DC0747A9B44C1854F6B49F6A416BD7BDAA6D0FE5FDBF18119B`.
- Deployment `dpl_79p2MdkTHFyVm3S1gXzF6ct8e8Ax`, READY desde `2026-10-13T10:23:52.633Z`.
  URL: <https://edukana-6cdhbivv3-cerkanasrl.vercel.app>.
  Alias: <https://edukana-git-todo-tanda-4-cerkanasrl.vercel.app>.
  API de Vercel verificada el 13-oct a las `16:20:58.464Z`: ambos apuntan al SHA anterior,
  rama `todo/tanda-4`, entorno Preview.

El PR [123](https://github.com/cank3r/edukana/pull/123), rama `mvp/acceptance-gates-20261013`,
registra esta revisión. Sus cambios posteriores no se atribuyen al deployment anterior.

## Qué cubren los 23 casos

| Grupo | Casos | Evidencia del CI aislado |
|---|---:|---|
| Recorrido compartido desde cero | 1 | Seis bloques por UI: espacio, personas/invitaciones, curso/contenido/tarea, matrícula/vínculo, asistencia/entrega/notas y aviso/archivo. Persistencia tras recarga y cambio de sesión. |
| Cuatro roles en móvil y escritorio | 8 | Admin, docente, estudiante y tutor; 360/1280 px, navegación, controles y datos visibles. |
| Teclado del diálogo de nota | 2 | Foco, Tab, Shift+Tab, Escape y retorno a la celda; nota conservada. |
| Entrada directa e historial del diálogo | 4 | Query directo, recarga, Cerrar/Cancelar, Atrás/Adelante y datos persistidos. |
| Negativas de roles/institución/audiencia | 3 | Rutas ocultas, institución B, identificadores ajenos, cuenta fuera del curso, privacidad entre compañeros y tutor sin vínculo. |
| Transiciones de revocación | 3 | Matrícula COMPLETED rechaza formularios abiertos; docente sin course.view pierde menú/página/acción/nuevas URLs propias; banderas/vínculo del tutor cortan áreas y archivos. |
| Logout | 2 | Tres muestras inmediatas y tres quiescentes; nueva petición protegida denegada. |

Las sesiones se obtienen mediante login normal de Chromium contra Next/PostgreSQL temporales.
Las denegaciones de páginas comprueban identidad e institución antes y después. Los catorce casos UX/diálogo
bloquean escrituras después del login: no prueban guardar una corrección nueva de notas.

La prueba de archivos verifica bytes de imagen, documento y vídeo sintético y espera 60/300
segundos reales. El helper exige `/api/local-storage`: **no acredita Supabase ni su caché/CDN**.
Otro job ejecuta 16 regresiones separadas (cuatro carreras PostgreSQL y doce de uploads), con
fixtures directas en otra base temporal. Esas dieciséis no forman parte de los veintitrés.

Fuentes: `tests/e2e/canonical-mvp/{core,ux,grade-dialog,denials,logout-race}.spec.ts`,
`denial-helpers.ts`, `playwright.canonical-mvp.config.ts` y `.github/workflows/canonical-mvp.yml`.

## Evidencia humana y configuración desplegada

El coordinador transmite confirmación del usuario: invitación real recibida el 13-oct a las
`10:26:51 UTC`; contraseña definida personalmente y login tutor confirmado a las `15:17 UTC`.
Carlos expresó: «Me gusto lo que vi de edukana,.continua». Esto acredita aceptación humana de
lo recorrido por él; no acredita QA independiente de los cuatro roles ni pruebas negativas.

La inspección de Vercel leyó sólo nombres y alcance: `APP_URL`, `RESEND_API_KEY` y `EMAIL_FROM`
están limitadas a Preview / `todo/tanda-4`. Existen entradas Preview de `SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY`; no se inspeccionaron valores. La presencia no prueba validez,
proyecto efectivo de Storage, aislamiento físico ni privacidad del bucket. El código usa
`SUPABASE_STORAGE_BUCKET` o `edukana` por defecto; `LOCAL_STORAGE_ROOT` tendría prioridad.

No hay conector Supabase disponible en este runtime para comprobar bucket/políticas con una
sesión autorizada. No se extrajeron claves del despliegue o de archivos locales.

## Puertas de aceptación pendientes

| Puerta | Estado actual | Evidencia mínima que falta |
|---|---|---|
| Correo y entrada del tutor | Confirmación humana | No repetir envío ni restablecer contraseña. |
| Recorrido compartido desplegado | Parcial, no QA completa | Mismo curso/estudiante en admin, docente, estudiante y tutor; cotejar contenido, entrega, nota publicada, asistencia y aviso tras recarga. |
| Rutas y aislamiento desplegados | Bloqueado por navegador | Sesiones existentes autorizadas; rutas ocultas y objetos ficticios ajenos; mantener sesión válida antes/después de la denegación. |
| Bucket privado y proveedor efectivo | Sin verificar | Sesión administrativa Supabase existente: ref del proyecto, bucket usado, `public=false` y políticas pertinentes, sin claves ni listado de objetos ajenos. |
| Lectura privada y bytes | Sólo local/CI | Archivo sintético existente: descarga autorizada; `/api/assets/<id>` responde 401 al anónimo y 403/404 sin permiso o desde otra institución; ruta pública del proveedor no entrega bytes. Registrar sólo estados, tiempos y comparación de bytes. |
| Vencimiento real en Supabase | Sólo local/CI | Una URL firmada ya emitida puede entregar bytes sin sesión hasta vencer. Comprobar denegación después de 60/300 s mediante nueva petición de red, diferenciada de copia en caché; conservar URL sólo en memoria. |
| Revocación docente/tutor y COMPLETED | Sólo local/CI | Recursos exclusivos de ensayo y autorización acotada para transiciones; comprobar nuevas autorizaciones y conservación de historia/bytes. |
| Correcciones adicionales | Canónico previo PASS; aserción corregida localmente | Exigir CI terminal del nuevo SHA en PR123 y revisar evidencia antes de decidir integración y nueva verificación de Preview. |

El runtime CUA local falló dos veces antes de mostrar pantalla con el error comunicado:

```text
trusted Node process exited unexpectedly; kernel reset, rerun your request
```

No se repitió ciegamente ni se extrajeron sesiones. El fallo histórico del 12-oct se conserva
en `canonical-mvp-evidence.md`; no se presenta como un resultado nuevo.

## Próximo paso mínimo y límites del ensayo desplegado

1. Recuperar un navegador autorizado funcional. Carlos inicia personalmente las cuentas
   existentes cuando sea necesario. No compartir contraseñas, cookies ni enlaces de invitación.
2. Ejecutar primero las lecturas del mismo curso y estudiante, y las negativas de rutas sobre
   objetos de pruebas identificados. Registrar SHA/deployment, UTC, rol, resultado y evidencia
   sanitizada; no convertir un login fallido en una denegación de autorización correcta.
3. Comprobar los metadatos del bucket con una sesión Supabase existente y después los archivos
   sintéticos existentes. No copiar claves a otro entorno, generar credenciales ni cambiar políticas.
4. Para transiciones, acordar recursos de prueba exclusivos. El helper canónico modifica
   **TEACHER de toda la institución**, no sólo una cuenta. También revoca terminalmente un vínculo
   y completa una matrícula. No ejecutarlo sobre la institución compartida ni sobre el vínculo
   tutor recién aceptado. Sin autorización específica de esas transiciones, la puerta permanece abierta.

No ejecutar el harness canónico sobre Preview: no tiene modo remoto. No seed/reset, creación de
usuarios, alteración de datos existentes, migraciones, nuevos permisos persistentes ni borrado de
archivos reales. Una inspección del estado actual no demuestra una transición de revocación.

## Revisión adicional y correcciones

Tres auditorías independientes revisaron cobertura, permisos y Storage, inicialmente sin escritura.
Los hallazgos se reprodujeron antes de modificar la aplicación. Candidato de código:
`8ce797b6c34f9fb5f95300aeb331f0058f8b242b`, publicado en PR123; **no está en la Preview actual**.

| Hallazgo reproducido | Corrección y evidencia |
|---|---|
| POST legacy podía ligar archivos directamente a una entrega calificada/cerrada, eludiendo el pipeline actual. | Rechazar estudiantes y cualquier submissionId en ese endpoint. La UI de entregas conserva `/api/uploads`; las lecciones conservan su carga existente. |
| PATCH/DELETE legacy permitían confirmar/borrar tras perder capacidades o asignación y no retenían adjuntos antiguos/históricos. | Revalidar acceso vigente al curso o permiso de publicar para borradores de avisos. Preservar relaciones de entrega, referencias históricas y carpetas del pipeline moderno. |
| Una publicación/adjunto podía ganar entre lectura y mutación de archivo. | Mutaciones condicionadas a seguir sin asociación; retirar metadata antes de bytes y exigir una fila afectada. Conflicto conserva bytes. |
| Comunidad/archivos del tutor omitían capacidades vigentes aunque el portal del hijo las exigía. | Releer child.portal.view y child.announcements.view antes de resolver audiencia, conservando vínculo, bandera e institución. |

Regresiones nuevas, Node 24.14.0 local con entorno sin credenciales:

- `tests/integration/canonical-legacy-assets.test.ts`: 24 casos originales, **8 PASS/16 FAIL antes**,
  **24/24 después**; ampliación final **26/26**, incluidas asociaciones concurrentes simuladas,
  carpetas protegidas, mismatch de tamaño y orden de borrado de metadata/bytes.
- `tests/integration/canonical-parent-announcements.test.ts`: **5 PASS/4 FAIL antes → 9/9 después**,
  incluida pérdida/restauración de permisos y nuevas autorizaciones de archivo con contexto previo.
- Repetición conjunta por el integrador: **66/66**, las 35 nuevas más 31 existentes de permisos,
  alcance de curso, avisos y Storage local. TypeScript completo, ESLint focal y diff-check: PASS.
- Revisión independiente de los tres archivos de aplicación: sin bloqueantes confirmados.
  Ningún cambio de schema, migraciones, catálogo de capacidades, Auth ni proveedores Storage.

Las suites nuevas ejecutan handlers/lectores reales con fronteras DB y proveedor simuladas, aunque
residan en el directorio recogido por `test:integration`. **No se contabilizan como pruebas PostgreSQL**.
Tampoco prueban HTTP desplegado, revocación a mitad de petición ni atomicidad universal. La limpieza
del proveedor sigue tolerando fallos: puede quedar un objeto huérfano, sin que esto pruebe borrado físico.

Comando focal reproducible en un checkout sin `.env` de runtime:

```sh
node --import tsx --test --test-concurrency=1 tests/integration/canonical-legacy-assets.test.ts tests/integration/canonical-parent-announcements.test.ts
```

El CI existente descubre ambos archivos mediante su glob de integración. Resultados terminales
del candidato `8ce797b6c34f9fb5f95300aeb331f0058f8b242b`:

| Ejecución | Resultado comprobado |
|---|---|
| [Canónico y atomicidad 38431605627](https://github.com/cank3r/edukana/actions/runs/38431605627) | SUCCESS; canónico 23/23, árbol limpio, terminado `2026-10-13T16:44:21.245Z`; job atomicidad SUCCESS. |
| [CI general 38431574647](https://github.com/cank3r/edukana/actions/runs/38431574647) | FAILURE; suite base 187 PASS/1 FAIL/0 skips, integración 593/593/0 skips, browser-smoke SUCCESS. El único gate fallido de validate es npm test. |
| CircleCI | validate 440 FAILURE; browser-smoke 439 SUCCESS, estados registrados en el mismo PR/SHA. |

El resumen público del canónico corregido tiene SHA256
`a5c9c4eb392859c5fac2d8172fe4da1506a6c60473314ac589b788722382f436`.
Declara PostgreSQL desechable, Storage local, correo capturado y Preview no ejercitado. Los 593
casos recogidos por el glob mezclan pruebas DB-free e integración; no se presentan todos como PG.

Fallo exacto de la suite base: `usa cargas directas firmadas y restringe quién puede prepararlas`,
en `tests/security.test.ts`, exige por regex que POST legacy contenga
`courseWhereForParticipation(user.institutionId, user, capabilities)`. Ese camino de estudiantes
es precisamente el retirado para cerrar la elusión de entregas. Las 35 regresiones nuevas y el
recorrido canónico verifican comportamiento real; no se propone reabrir el camino para satisfacer texto.

El caso de `tests/security.test.ts` ahora ejecuta el POST real con sesión, DB y proveedor simulados;
Zod, validación de archivos y política de curso permanecen reales. Comprueba sesión anónima,
estudiante con/sin entrega, docente que intenta asociar una entrega, permiso retirado, institución
ajena y docente no asignado: ninguna denegación emite firmas ni escribe metadata. El control positivo
prepara una lección del docente asignado y verifica respuesta, destino privado y metadata sin entrega.
La suite local completa más las 35 regresiones pasa **223/223, sin skips**; TypeScript completo y
ESLint focal pasan. No se reabre la vía retirada ni se sustituye por otra regex de implementación.
QA independiente: el caso focal pasa 1/1. Al sustituir sólo el módulo POST en memoria por su
fuente exacta de `8115614`, la misma prueba falla con `actual=201, expected=403`;
no por excepción de importación o mock incompleto. El revisor verificó que aplicación y prueba
permanecieron intactas antes/después y no encontró bloqueantes en la prueba ni en la matriz.

El primer intento de ampliar el claim/publicar fue rechazado por autorización considerada sólo de
inspección. El coordinador aportó el contexto explícito de continuación MVP y pidió un único reintento:
fue aceptado, y el claim quedó publicado en `d85e81b67506b5a389c3061173e6476fb0839d9a`.
El parche anterior que sólo retiraba una regex quedó descartado en favor de esta prueba de comportamiento.
La aplicación permanece idéntica a `8ce797b`; la nueva revisión cambia pruebas y documentación.
La descripción de [PR123](https://github.com/cank3r/edukana/pull/123) registrará el SHA final, QA independiente
y enlaces/resultados terminales de CI para evitar atribuir las ejecuciones anteriores al nuevo commit.

CI del candidato y aceptación desplegada siguen separados. Ni el canónico nuevo ni los 23/23 de
`8115614` cierran la puerta de Supabase/Preview real.

## Autorización de publicación del ajuste

El claim d85e81b quedó publicado. El comando posterior de add/commit/push fue rechazado por
revisión automática antes de ejecutarse y se detuvo sin rutas alternativas. Carlos confirmó
expresamente el 13-oct a las 18:15:54 UTC la publicación de tests/security.test.ts,
docs/mvp-acceptance-20261013.md, docs/canonical-mvp-evidence.md y las tres filas propias de
TEAM-COORDINATION.md en PR123/rama mvp/acceptance-gates-20261013, junto con su CI.
El siguiente commit conserva esta prueba revisada. Los resultados terminales se registran por
SHA en la descripción/checks de PR123; no se atribuyen a él ejecuciones anteriores.
La autorización no incluye merge ni despliegue.

QA independiente adicional retiró sólo el rechazo de submissionId en memoria: el caso docente
también detectó 201 recibido frente a 403 esperado. Blob de la prueba revisada:
5d4349293a730077022656db354061cee0dbdb36. No se modificó la aplicación durante la revisión.
