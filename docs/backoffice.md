# Backoffice de Edukana

Implementación de las piezas A–F y la ampliación G de marca blanca del issue #101, integrada en `todo/backoffice`. Este documento describe el código; la aceptación requiere CI del SHA integrado y recorrido del Preview. El usuario autorizó reanudar publicaciones de ramas y PR; la aceptación sigue dependiendo del CI y recorrido del SHA final. No se han aplicado estas migraciones a Supabase ni configurado el cron remoto.

## Entrada y permisos

Configurar `PLATFORM_OPERATOR_EMAILS` con los correos de las cuentas operadoras, separados por coma. La cuenta inicia sesión normalmente y entra a `/operador`. El servidor vuelve a leer el correo y comprobar la lista en páginas y acciones: ocultar enlaces no concede ni revoca permisos. Una cuenta fuera de la lista recibe 404 o rechazo. No guardar contraseñas ni secretos en Git.

Los operadores actuales comparten permisos. No hay roles administrativos adicionales del SaaS. La suspensión institucional también afecta al operador cuya sesión pertenece a esa institución; mantener su cuenta en una institución operativa distinta de aquella que administra.

## Pantallas

- **Tablero** (`/operador/tablero`): instituciones activas y docentes independientes, estudiantes y docentes, altas, ventas por moneda, consumo de IA y atención. Las consultas agregan en la base. «Sin actividad» significa sin eventos registrados, no una prueba de ausencia histórica de uso.
- **Instituciones** (`/operador`): búsqueda, filtros de estado y docentes independientes, altas y acceso a cada ficha.
- **Ficha** (`/operador/[id]`): administración, invitaciones, plan y facturación, suspensión/reactivación, funciones, catálogo y soporte. Suspender requiere motivo y escribir el nombre; no borra datos. Se comprueba el estado en cada solicitud y se conservan las otras membresías de la persona.
- **Planes** (`/operador/planes`): precio en centavos, moneda, límites y funciones. Los cuatro planes iniciales son ejemplos editables, no una propuesta comercial definitiva. Editar el precio del plan no altera automáticamente el precio pactado de las suscripciones existentes.
- **Facturación** (`/operador/facturacion`): facturas abiertas, vencidas, pagadas o anuladas y total del mes por moneda. El pago se registra manualmente con método, referencia y fecha. No hay pasarela ni NCF.
- **Ventas** (`/operador/ventas`): bruto, comisión configurada y neto por institución y moneda. La comisión es informativa y no modifica el cobro al comprador.
- **Soporte** (`/operador/[id]/vista`): alternativa aislada de solo lectura, no suplantación de sesión. Exige nombre escrito, operador vigente y ticket opaco de hasta 30 minutos. Entrada/salida quedan auditadas. Cerrar el navegador no genera por sí solo un evento, pero el límite se valida en cada lectura.
- **Bitácora** (`/operador/bitacora`): filtros por institución, acción, fecha UTC y operador; cursor y páginas de 30 registros. No presenta secretos ni el JSON de cambios completo.
- **Avisos** (`/operador/avisos`): crear, editar y terminar avisos de texto para todos, administradores o independientes. La franja del dashboard aplica audiencia/vigencia en servidor y recuerda el cierre por persona. No se añadió el envío opcional de correo.

## Planes, vencimientos y límites

Las altas de institución y docente independiente crean una prueba FREE de 30 días dentro de la misma transacción. `PLATFORM_TRIAL_DAYS` centraliza la duración. `seedPlatformPlans(tx)` crea idempotentemente planes ausentes sin sobrescribir precios editados.

Una factura pagada solo extiende períodos compatibles, no acorta el fin ni revive una suscripción cancelada. Pagar deuda histórica no debe marcar vigente un período ya vencido. `PAST_DUE` indica atención; nunca suspende automáticamente. La extensión manual de un período vencido al futuro puede restaurar ACTIVE y queda auditada.

Los límites de estudiantes, almacenamiento e IA son informativos; la franja del administrador no bloquea funciones. El almacenamiento compara bytes exactos contra MB binarios (1.048.576 bytes), aunque muestre valores redondeados. La cuota de IA cuenta eventos `AI_USED` del mes UTC.

## Funciones

Las preferencias del plan son los valores predeterminados y las decisiones del operador las sobrescriben. Apagar IA mediante el operador bloquea su reactivación desde Configuración institucional. Catálogo desactivado o institución suspendida impiden catálogo público y compra. La variable global de alta independiente conserva su comportamiento anterior.

## Cron de vencimientos

La ruta `GET /api/cron/plataforma` exige `Authorization: Bearer <CRON_SECRET>` y falla cerrada sin configuración. Guardar `CRON_SECRET` en el entorno del proyecto por el mecanismo seguro correspondiente. Una configuración propuesta para Vercel es:

```json
{"crons":[{"path":"/api/cron/plataforma","schedule":"0 6 * * *"}]}
```

La hora es UTC. Esta propuesta no se ha desplegado ni activado. El cron marca períodos vencidos y usa `changes.operator = "system:cron"`; comparte el bloqueo institucional con pagos para evitar actualizaciones perdidas.

## Migraciones nuevas, en orden

1. `20261010100000_backoffice_suspension`: enum y columnas institucionales con valor inicial ACTIVE.
2. `20261010110000_backoffice_planes`: planes, suscripciones y facturas manuales.
3. `20261010120000_backoffice_avisos`: avisos globales con fechas y audiencia.

Son aditivas. Las piezas A, D y E no incorporan migraciones. Esta lista no autoriza ejecutar migraciones adicionales pendientes. Antes de staging, verificar la rama, la base destino y el historial aplicado; no usar reset ni seed demo en una base real.

## QA y entrega

Cada pieza aporta pruebas de lógica, fronteras de operador y PostgreSQL. El recorrido de navegador utiliza datos desechables exclusivos y conserva los roles anteriores. Capturas y registros se guardan como artifacts seguros del CI; no se reintroduce force-push a ramas de evidencias.

La evidencia final debe incluir SHA integrado, resultados validate/browser-smoke, enlaces a las seis PR y capturas revisadas. El límite de despliegues Vercel es un bloqueo de Preview separado de la calidad del código. No se declara aceptación visual o CI final verde sin comprobarlos.

### Evidencia local del 9 de octubre, 23:58 UTC

- Suite base: 137/137 mediante Node --import tsx (el CLI tsx no pudo crear su socket IPC en este sandbox).
- Suite test:backoffice: 54/54.
- Prisma generate, TypeScript, ESLint y build nativo Turbopack: PASS.
- Descubrimiento Playwright: 18 pruebas; viewport móvil integrado ajustado a 360 px. No es ejecución del recorrido.
- PostgreSQL real, navegador y CI del commit integrado: pendientes. No se aplicaron migraciones externas.
- Se corrigieron regresiones de fecha exacta al facturar, extensión de período vencido, pago histórico que reactivaba indebidamente y auditoría concurrente de planes/avisos.

### Corrección BO-E tras lectura del CI

El CI de E (`ef7c1fb1`, run 38005223542) detectó una colisión de clave primaria en salidas simultáneas. La corrección local sustituye el upsert Prisma por createMany con skipDuplicates: inserción atómica con conflicto ignorado, conservando el primer evento. La suite PostgreSQL prueba doce salidas simultáneas y la carrera salida/expiración; espera una nueva ejecución CI autorizada.

## Marca blanca (G)

La ficha y el alta permiten configurar marca. Los hosts institucionales quedan aislados de otras membresías y del backoffice central; correo y metadatos usan la marca. G no añade migración. Véase [marca-blanca.md](marca-blanca.md) para contratos, activación manual, limitaciones y revisión de seguridad.

## PR por pieza

- A · Tablero: https://github.com/cank3r/edukana/pull/103
- B · Suspensión: https://github.com/cank3r/edukana/pull/105
- C · Planes: https://github.com/cank3r/edukana/pull/104
- D · Funciones: https://github.com/cank3r/edukana/pull/106 (depende de B+C; se prepara base técnica conjunta)
- E · Soporte: https://github.com/cank3r/edukana/pull/107
- F · Avisos: https://github.com/cank3r/edukana/pull/102
- G · Marca blanca: [PR #108](https://github.com/cank3r/edukana/pull/108).

Las ejecuciones por pieza no sustituyen el CI integrado. D requiere los campos B+C; su fallo de tipos en la primera rama aislada está identificado y no se atribuye a infraestructura. El integrado contiene ambos contratos.

### Cierre local A–G — 2026-10-10 00:30 UTC

Integración 4837a211: build nativo Turbopack PASS, TypeScript y lint PASS; 137/137 base y 98/98 backoffice. Descubrimiento smoke18 PASS a360px/escritorio; aún no ejecución PostgreSQL/browser del integrado. Revisión independiente de G PASS con cookies Auth.js reales y filtros públicos. G no añade migraciones. La autorización específica para conservar vercel.json heredado fue confirmada el 2026-10-10; la base A–F se publicó en a540932 y G en el PR #108. CI integrado y aceptación visual siguen pendientes.

## Evidencia de CI y ajustes de navegador

- PR final: [#109](https://github.com/cank3r/edukana/pull/109), hacia `todo/tanda-4`; no fusionado a main.
- Run [38010797140](https://github.com/cank3r/edukana/actions/runs/38010797140), SHA 0a68f4d: validate real PASS con 137 pruebas base, 101 backoffice y 522 PostgreSQL; incluye las cinco pruebas de marca y aislamiento de catálogo por Host. Migraciones desde cero y comparación de schema pasan sobre PostgreSQL efímero de CI.
- El navegador de ese SHA completó 16/18 recorridos. Las etiquetas Plan/Marca/Avisos y la retención del motivo de suspensión ya pasan. El selector final de login suspendido confundía el anuncio de ruta de Next con el error del formulario; se acotó al formulario sin cambiar el texto esperado. Una regresión HTTP con Auth.js real cubre el rechazo de credenciales suspendidas.
- Se añadió protección de sesión nula en el render paralelo del inicio; la redirección y el aviso siguen a cargo del layout.
- La aceptación final depende del run del último SHA y de sus capturas. El PR registra el resultado terminal; no se infiere de estas verificaciones históricas ni del Preview.


## Instituciones creadas antes de los planes

Las instituciones que ya existían cuando se agregaron los planes quedan sin suscripción. Para darles la misma prueba de 30 días que reciben las nuevas (con el plan de su campo `plan`, FREE si nunca se tocó):

```
DATABASE_URL="<DIRECT_URL>" npm run plataforma:asignar-planes                                  # solo muestra cuáles
DATABASE_URL="<DIRECT_URL>" PLANES_CONFIRM=asignar-planes npm run plataforma:asignar-planes    # las asigna
```

Las que ya tienen suscripción no se tocan, así que se puede correr varias veces. Cada asignación queda en la bitácora (`PLATFORM_SUBSCRIPTION_TRIAL_CREATED`, motivo `backfill`). Después el operador ajusta el plan de cada una en su ficha.
