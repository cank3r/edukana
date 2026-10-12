# Guion canónico del MVP: institución piloto

La aceptación requiere que Carlos pueda recorrer un curso completo en Preview y confirme que se entiende. Este documento separa el ensayo desde una base vacía, la validación desplegada y la aceptación humana. Un smoke con datos sembrados no sustituye el recorrido desde la interfaz. La creación de datos del recorrido no usa `prisma/seed.ts`, SQL manual ni datos preparados.

## Estado del runner

El runner `tests/e2e/canonical-pilot.spec.mjs` está obsoleto: utiliza pantallas retiradas y no contempla el token actual de `/setup`. No reactivarlo ni utilizar su antiguo bypass de Vercel. El smoke `tests/e2e/smoke/recorrido.smoke.ts` sigue siendo una regresión útil con datos preparados.

El nuevo recorrido `tests/e2e/canonical-mvp/` usa producción Next, Chromium, PostgreSQL desechable y archivos privados locales. Crea los datos académicos exclusivamente desde la interfaz; el harness aplica únicamente las migraciones ya versionadas. Las invitaciones se capturan en un buzón local de prueba: no se entregan a Resend ni acreditan entrega real de correo.

## Recorrido desde cero

### 1. Espacio y administrador

Abrir `/setup` sin token debe denegar. En la instalación temporal, abrir `/setup?token=<token de prueba>` y registrar institución, identificador, administrador y contraseña. Después de crear la primera institución, setup queda cerrado. Iniciar sesión, cerrarla y volver a entrar debe conservar la cuenta y la institución.

### 2. Institución, personas, permisos y departamento

Guardar configuración institucional y comprobarla al recargar. En **Personas**, agregar docente, estudiante y tutor mediante **Revisar → Agregar y enviar invitación**. Cada cuenta define su contraseña desde su enlace de invitación y entra por el login normal. En **Configuración → Períodos**, crear un período con fechas relativas al ensayo y marcarlo actual.

Revisar permisos: docente con acceso a cursos, gestión, listas y horarios; tutor sin acceso institucional a cursos ni personas. Crear una unidad/departamento, asignar al docente y comprobar persistencia. El recorrido no introduce contraseñas ni tokens mediante SQL o Prisma.

### 3. Curso, contenido y evaluación

El docente crea un curso, selecciona el período y obtiene su identificador de la navegación real. Publica explícitamente curso, capítulo y lección de actividad: nacen como borrador. Configura el libro de calificaciones con **Usar configuración sencilla**, crea una tarea calificable y la publica.

El docente debe tener acceso a su curso y carecer de acceso a Configuración, Personas, Cobros y cursos de otra institución.

### 4. Matrícula y tutor

El administrador usa **Inscribir estudiantes**, busca a la persona y confirma la inscripción. En **Configuración → Tutores y estudiantes**, crea un vínculo pendiente con académico, asistencia y avisos habilitados, y finanzas deshabilitadas. Antes de activarlo, el tutor no recibe datos del estudiante; después de la activación explícita sí.

### 5. Asistencia, actividad, entrega y notas

El docente registra asistencia. El estudiante completa la lección y entrega la tarea. Tras cerrar sesión y volver a entrar, ambas operaciones persisten. El docente califica, comprueba la diferencia entre nota oculta y publicada, y publica las notas de la actividad.

El estudiante ve su nota, comentario, progreso y asistencia. El tutor ve solamente las áreas habilitadas del estudiante vinculado. La evidencia debe comprobar los valores guardados, no únicamente un mensaje de éxito.

### 6. Avisos y archivos privados

El administrador crea un aviso con título, negrita, lista, enlace HTTPS y una imagen o video permitido; selecciona el curso como audiencia y confirma. Administrador, docente, estudiante y tutor autorizado vuelven a iniciar sesión y conservan acceso al contenido y a los bytes del archivo.

Una cuenta activa fuera de la audiencia no recibe el aviso ni una URL privada. La autorización debe validar institución, usuario y audiencia antes de emitir la URL firmada.

## Negativas obligatorias

- Otra institución no puede leer curso, persona o archivo de A, ni escribir mediante identificadores ajenos de unidad o vínculo. Comprobar respuesta y ausencia de cambios desde una sesión autorizada.
- Docente, estudiante y tutor reciben denegación al abrir directamente rutas ocultas.
- Al desactivar las banderas del tutor se retira el área correspondiente. Al revocar el vínculo se cortan inmediatamente nuevas consultas y autorizaciones de archivos.
- Una URL ya emitida conserva su ventana residual. El contrato actual usa 60 segundos para documentos/imágenes y 300 para video; medir vencimiento real, sin adelantar el reloj. Una prueba local no acredita Supabase.
- Al completar una matrícula, formularios de tarea, progreso y examen abiertos previamente deben rechazar escrituras. Lectura y evidencia histórica se conservan.
- Al retirar acceso a cursos al docente, menú, página, acción pendiente y archivo propio deben aplicar la misma denegación. No omitir el archivo del que el docente es propietario.

## Ejecución aislada y evidencia

El workflow `.github/workflows/canonical-mvp.yml` crea PostgreSQL 16.4 exclusivo del job, instala Node 22 y Chromium, y ejecuta:

```sh
node --test tests/canonical-mvp-harness.test.mjs
node scripts/canonical-mvp-run.mjs prepare
node scripts/canonical-mvp-run.mjs test
```

Estos comandos requieren `CANONICAL_MVP_ISOLATED=1`, un directorio absoluto nuevo en `CANONICAL_MVP_RUN_DIR` y el PostgreSQL temporal exacto definido en `scripts/canonical-mvp-config.mjs`. No tienen modo remoto. El launcher construye un entorno de fixtures sin heredar credenciales, opciones de Node, proxies o proveedores reales. Rechaza archivos `.env` de runtime, endpoints distintos y configuración Supabase/bypass.

Antes de migrar, una consulta de solo lectura exige ausencia de tablas de aplicación. Antes del recorrido exige ausencia de instituciones, identidades y usuarios; rechaza resultados reutilizados y puerto ocupado. No ejecuta seed, reset ni cambios al schema. El proceso Next carga un interceptor de correo exclusivo del harness: acepta destinatarios ficticios bajo `example.test`, captura mensajes y bloquea HTTP externo. Ningún cambio se incorpora al proveedor de producción.

`private/` contiene buzón, identificadores del ensayo, logs, resultados y capturas de diagnóstico. No se publica. El artifact de CI contiene exclusivamente `public/summary.json`, con SHA, estado del árbol, run ID, URL local, entorno, fecha, nombres de casos y resultados, sin mensajes, enlaces de invitación, sesiones ni archivos. Para ejecución local registrar `CANONICAL_MVP_SOURCE_SHA` completo y `CANONICAL_MVP_SOURCE_DIRTY=0|1`; ausencia significa desconocido. El responsable conserva los fallos como evidencia y no los convierte en omisiones o éxitos esperados.

El recorrido principal espera que termine la navegación antes de cerrar sesión. La regresión separada
`logout-race.spec.ts` compara tres cierres inmediatos y tres quiescentes; cualquier muestra fallida
mantiene el gate rojo. Una prueba de logout quiescente no acredita ausencia de carreras. El diagnóstico
inicial con una respuesta retenida por CDP no demostraba el orden del almacén de cookies y fue reemplazado.

Los recursos locales deben ser contenedores recién creados y propios del ensayo. Al terminar, retirar únicamente esos contenedores y sus volúmenes efímeros, verificando primero sus identificadores y etiqueta de propiedad. Nunca apuntar estos comandos a una base persistente aunque esté en loopback.

## Preview y aceptación pendientes

Preview requiere acceso existente autorizado. Si la protección de Vercel impide entrar o el navegador de control no funciona, registrar el error exacto y pedir la intervención mínima; no crear bypasses, copiar cookies, extraer contraseñas ni modificar variables, usuarios o permisos persistentes.

Antes de crear datos nuevos en Preview: presentar el alcance exacto, confirmar que DB y Storage sean el destino de pruebas aislado autorizado y usar nombres exclusivos. No ejecutar setup sobre una base existente, seed, reset, borrados ni cambios de usuarios o datos anteriores. La autorización de este PR no incluye integrar ni desplegar.

El resultado debe indicar por separado: bloques UI ejecutados desde cero, negativas ejecutadas, backend de archivos probado, CI por SHA, fallos abiertos y pruebas autenticadas en Preview. Carlos realiza la aceptación final; un porcentaje estimado no constituye evidencia de cierre.
