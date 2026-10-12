# Recuperación: diagnósticos sin datos sensibles

Corte del 12-Oct-2026 sobre `todo/tanda-4`, base `1a220855cc59fb14fbc6d49c225984275e40e6e5`. PR120; rama `m1/logs-recuperacion-20261012`; claim publicada antes del código en `93a24a6`.

## Problema y resultado

Los fallos de recuperación imprimían excepciones completas y Prisma podía imprimir errores con sus argumentos. Además, el texto público afirmaba que se había enviado un enlace incluso ante un fallo operacional. Ahora la respuesta sigue siendo uniforme para cualquier correo válido, con un texto condicional que no confirma entrega al buzón.

Cada fallo capturado en recuperación intenta emitir un evento `password_reset_failure` con campos permitidos: etapa fija, código fijo, UUID y, cuando corresponde, un código Prisma del formato `P` más cuatro dígitos. No se serializan error, message, stack, cause, meta, correo, IP, cuenta, institución, contraseña, conexión, token, enlace ni cuerpo del correo. No se registra elegibilidad. Los objetos inesperados, proxies y accesores que lanzan reciben un diagnóstico limitado; una avería del logger no altera la respuesta ni se registra recursivamente. Si falla la generación del UUID, la correlación usa el literal `unavailable`.

El cliente compartido Prisma deja de emitir consultas, errores y advertencias automáticos crudos en todos los entornos. Sus excepciones siguen llegando al caller y se conserva la política de reutilización de instancia. Esto reduce el diagnóstico automático de módulos que aún no tienen registros seguros; no implica que sus catch existentes hayan quedado corregidos.

## Reutilización y contratos conservados

Se reutilizó el parche local `recovery-observability.patch` / DEMO-RECOVERY-FIX, base `3e6d2b18`. El coordinador autorizó expresamente el relevo limitado de M1/G-mail/G-host y los logs del cliente Prisma compartido. No se modificaron filas ajenas.

A diferencia del borrador local, **no se introduce un nuevo resultado del servicio**: `requestPasswordReset` conserva `Promise<void>`. Los errores anteriores a la consulta de marca siguen propagándose al caller; la acción pública los captura con la etapa fija `request`. Los errores de marca/token/proveedor siguen capturados por el servicio y generan solo un evento. Las acciones conservan `{ ok, message }`; se actualiza únicamente el texto de solicitud para no afirmar entrega.

No cambian límites, registro del intento, HMAC, normalización, orden de operaciones, permisos, contexto de host, selección de membresía, marca, proveedor, caducidad, consumo único de tokens, contraseñas ni invalidación de sesiones. La generación y aplicación del token conservan su implementación. No hay cambios de schema/migraciones, credenciales, variables, infraestructura, DB externa ni correo real.

## Archivos

Seis archivos de producto: `src/server/password-reset.ts`, `src/server/actions/password-reset.ts`, `src/server/security/password-reset-observability.ts`, `src/app/recuperar/{page,RecoverForm}.tsx` y `src/lib/db.ts`.

Dos archivos de pruebas: `tests/platform-branded-email.test.ts` verifica además el retorno void en los casos de host propio/ajeno; `tests/platform-password-reset-observability.test.ts` porta y amplía las pruebas del parche. Este nombre entra en el glob existente `test:backoffice` sin modificar package.json ni CI. Completan el alcance esta documentación y la fila propia TEAM.

## Verificación

- Focal local: **39/39 PASS** (27 de recuperación/diagnóstico y 12 de marca/correo), Node 24.14.0, entorno saneado sin archivos `.env` y sin DB/envío externo.
- Incluye fallos por frontera, respuesta pública uniforme, contrato void y rechazos previos conservados, ausencia de elegibilidad, sexto intento limitado, fallos de proveedor/configuración y ausencia de datos sensibles en la captura real de stdout/stderr de un subprocesso.
- Casos adversariales: objetos no Error y cíclicos, proxies, accesores que lanzan o cambian, códigos y etapas inesperados, fallos del logger y del UUID. Un fallo de diagnóstico conserva el resultado del cambio de contraseña simulado, incluido éxito, token inválido y excepción.
- Puerta local: 188/188 unitarias base, 135/135 backoffice (incluyen las 27 nuevas), ESLint completo, TypeScript, Prisma validate y diff-check PASS. Las 39 focales se solapan con backoffice; no son pruebas adicionales únicas.
- Revisión independiente PASS sin bloqueantes: reejecutó 39 focales y 27 comprobaciones adicionales en memoria (proxies revocados, accesores, etapas y códigos con caracteres de control). Se atendió la observación de texto: la hora de caducidad se cuenta desde la solicitud, no desde recibir el correo.
- El build local nativo quedó limitado por la junction de dependencias: `Symlink node_modules could not be resolved: the symlink target leaves the filesystem root or its parent directory could not be resolved`. Un primer intento en sandbox había fallado con `Access is denied. (os error 5)` al canonicalizar el checkout; el reintento autorizado superó ese punto. El build local `--webpack` compiló y después falló en el export preexistente `AnnouncementCard` de `src/app/dashboard/comunidad/page.tsx` (TS2344, fuera del corte). No se cambió configuración ni ese archivo.
- El build habitual de Turbopack, Prisma generate, integración PostgreSQL y navegador se verifican en CI Node 22 con instalación aislada. El SHA final y los checks terminales se mantienen en PR120; no se presenta la compilación local como PASS.
- La integración con PostgreSQL temporal y el recorrido de navegador en CI no acreditan entrega real del correo ni aceptación de usuarios en Preview.

## Riesgos expresamente fuera del corte

Permanecen los catch con excepciones crudas de invitaciones, notificaciones, otras acciones de Personas/arranque, cursos/archivos, evaluación, admisiones, IA, catálogo, certificados, cobros y otros módulos. Su corrección requiere cortes propios; no asumir que ocultar una pantalla elimina esos emisores.

Tampoco se acreditan las salidas propias de Next/Auth.js, drivers/proveedores u otros servicios, ni retención, acceso, alertas o redacción del proveedor de logs. El diagnóstico del cliente DB es deliberadamente menos detallado hasta que cada caller tenga campos permitidos. No se ha observado ni se afirma una filtración real.

La configuración y entrega de correo, aislamiento productivo, backup/restore y recorrido del instituto siguen siendo verificaciones operativas separadas. Este PR no autoriza merge, despliegue, recuperación real ni conexión a bases externas.
