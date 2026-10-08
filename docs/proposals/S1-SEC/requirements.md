# S1 · Seguridad y pruebas reales — Requisitos (propuesta)

**Estado:** PROPUESTA, no es spec. No se implementa hasta que S0-GOV esté DONE y exista el claim S1-SEC en `TEAM-COORDINATION.md`.
**Base:** `0e67a91`. **Autor:** Claude. **Fecha:** 2026-10-08.

## Objetivo

Que suspender una cuenta corte el acceso en la siguiente petición, que el login resista abuso y tenga recuperación, que el arranque no quede abierto, que el examen respete su tiempo, y que todo eso se demuestre contra PostgreSQL real con dos instituciones.

## Fuera de alcance de S1

Identidad global y `Membership` (S2), `Offering` (S3), pasarela, IA.

## Hallazgos nuevos que motivan el diseño (verificados en `0e67a91`)

- `submitExam` crea el `ExamAttempt` en el momento de enviar. No existe "iniciar examen": `startedAt` y `submittedAt` son prácticamente iguales y la duración no puede aplicarse sin un paso de inicio.
- `submitExam` no usa transacción: dos envíos simultáneos calculan el mismo `attemptNumber`. La unicidad `(examId, studentId, attemptNumber)` evita el duplicado, pero el usuario recibe un error genérico y el límite de intentos se evalúa fuera de la transacción.
- La nota automática del examen se registra con `gradedById: exam.course.teacherId`; atribuye al docente una calificación que hizo el sistema.
- `requireUser` (acciones) y `DashboardLayout` leen solo el JWT. No hay `maxAge`; Auth.js usa 30 días.

## Requisitos

**R1 — Pruebas de integración reales**
1. CI SHALL levantar PostgreSQL, aplicar las migraciones con `prisma migrate deploy` y sembrar dos instituciones con un usuario de cada rol en cada una.
2. Cada acción de servidor cubierta SHALL tener tres casos: sin permiso, ID de otro usuario, ID de otra institución.
3. WHEN una prueba de integración reemplaza a una prueba por lectura de fuente THEN la prueba antigua SHALL eliminarse en el mismo cambio.
4. Las pruebas SHALL ejecutarse con un rol de base de datos sin privilegios de propietario.

**R2 — Sesión viva**
1. El JWT SHALL contener solo `sub` y `sv` (versión de sesión). Durante la transición puede conservar rol e institución, pero ninguna decisión de autorización SHALL leerlos del token.
2. WHEN llega cualquier petición autenticada THEN el servidor SHALL releer estado, rol, institución y `sessionVersion` del usuario, una vez por petición.
3. IF el estado no es `ACTIVE` o `sv` no coincide THEN la petición SHALL tratarse como no autenticada: páginas redirigen a `/login`, acciones devuelven error, APIs devuelven 401.
4. WHEN se suspende una cuenta, se cambia su rol o se cambia su contraseña THEN `sessionVersion` SHALL incrementarse.
5. La sesión SHALL expirar a los 7 días sin uso (configurable por entorno).

**R3 — Límite de intentos**
1. WHEN hay 5 intentos fallidos para un correo en 15 minutos THEN el login SHALL rechazar ese correo durante 15 minutos, con el mismo mensaje genérico.
2. WHEN hay 20 intentos fallidos desde una IP en 15 minutos THEN el login SHALL rechazar esa IP durante 15 minutos.
3. El bloqueo SHALL NOT revelar si el correo existe.
4. El mismo límite SHALL aplicarse a la solicitud de recuperación.

**R4 — Recuperación de contraseña**
1. WHEN se solicita recuperación THEN la respuesta SHALL ser idéntica exista o no la cuenta.
2. IF la cuenta existe y está activa THEN SHALL enviarse un enlace de un solo uso válido 60 minutos.
3. El token SHALL guardarse como SHA-256; nunca en claro.
4. WHEN se usa el enlace THEN SHALL fijarse la nueva contraseña, invalidarse el token y los demás tokens del usuario, e incrementarse `sessionVersion`.
5. WHILE el mismo correo exista en dos instituciones (hasta S2) THEN la recuperación SHALL enviar un enlace por cuenta, indicando la institución, y SHALL NOT fusionar cuentas.
6. El correo SHALL salir por la interfaz `EmailProvider`; en pruebas se usa un proveedor en memoria.

**R5 — Examen con tiempo autoritativo**
1. El estudiante SHALL iniciar el examen con una acción explícita que crea el intento `IN_PROGRESS` con `expiresAt = min(inicio + duración, closesAt)`.
2. Las preguntas SHALL entregarse al estudiante solo después de iniciar.
3. WHEN se envía antes de `expiresAt` más 30 segundos de tolerancia THEN SHALL calificarse.
4. WHEN se envía después THEN SHALL rechazarse y el intento SHALL cerrarse con las respuestas guardadas hasta ese momento.
5. Iniciar y enviar SHALL ser transaccionales: dos peticiones simultáneas nunca consumen dos intentos ni producen dos calificaciones.
6. La nota automática SHALL registrarse como calificada por el sistema, no por el docente.

**R6 — Arranque protegido**
1. `/setup` SHALL exigir un token de un solo uso definido por entorno (`SETUP_TOKEN`), comparado en tiempo constante.
2. IF `SETUP_TOKEN` no está definido THEN `/setup` SHALL responder 404 aunque la base esté vacía.
3. El runner de Preview SHALL verificar, además del hostname, que el proyecto de base de datos y el bucket estén en una lista permitida, consultando un endpoint de identidad de entorno protegido.

**R7 — URLs firmadas y revocación**
1. La duración de la URL firmada SHALL depender del tipo: 60 segundos para documentos, 5 minutos para video hasta S5.
2. La documentación SHALL declarar la ventana residual: revocar un acceso bloquea nuevas autorizaciones de inmediato; una URL ya emitida vive como máximo esa duración.
3. Una prueba SHALL medir y registrar ese comportamiento real.

**R8 — Dinero e integridad mínima de cobros**
1. `PaymentConcept` SHALL tener `amountCents Int` con backfill desde `amount` (redondeo al centavo, diferencias registradas).
2. `PaymentConcept.studentId` SHALL tener relación e índice; las filas con referencias inválidas SHALL listarse antes de aplicar la restricción.
3. `AuditLog`, `PaymentConcept`, `AdmissionLead` y `CalendarEvent` SHALL tener índice que empiece por `institutionId`.

**R9 — Historia académica estable**
1. WHEN un examen se publica THEN cada `ExamQuestion` SHALL guardar una instantánea del tipo, enunciado, opciones, clave y puntos de su pregunta; los intentos SHALL calificarse contra la instantánea, no contra el banco.
2. WHEN se edita una pregunta del banco ya usada THEN los exámenes publicados y sus intentos SHALL conservar su significado.
3. WHEN un estudiante reenvía una entrega THEN la versión anterior SHALL conservarse con su fecha; la entrega vigente es la última.
4. WHEN se cambia una nota ya registrada THEN SHALL guardarse valor anterior, valor nuevo, actor, motivo y fecha; el motivo es obligatorio si el período está publicado.
5. Ninguna revisión SHALL borrarse ni editarse desde la aplicación.

**R10 — `institutionId` físico e índices faltantes**
1. `Enrollment`, `Assignment`, `Submission`, `ExamQuestion` y `ExamAnswer` SHALL tener columna `institutionId` con backfill desde su relación (curso, tarea, examen o intento).
2. La columna SHALL nacer opcional, llenarse con backfill verificado (cero filas nulas, cero filas cuyo valor difiera del de su curso) y pasar a `NOT NULL` en una segunda migración.
3. Cada una SHALL tener un índice que empiece por `institutionId`.
4. Toda escritura nueva SHALL fijar `institutionId` desde el contexto, nunca desde el cliente.
5. IF una fila referencia un padre de otra institución THEN la migración SHALL detenerse y listar las filas; no las corrige en silencio.

## Criterios de salida de S1

- Suspender una cuenta con sesión abierta: la siguiente página, acción y descarga fallan. Probado en integración y en Preview.
- El sexto intento fallido se rechaza con el mismo mensaje que el primero.
- Recuperación completa de punta a punta en Preview con correo real de prueba; el enlace usado no funciona dos veces.
- Un examen de 1 minuto enviado a los 2 minutos se rechaza; dos envíos simultáneos consumen un solo intento.
- Editar una pregunta usada no cambia un intento previo; corregir una nota conserva ambas versiones con motivo.
- `/setup` sin token responde 404 en una base vacía.
- CI ejecuta la matriz permiso × rol × institución contra Postgres y ninguna prueba nueva lee archivos fuente.

## Decisiones de Carlos (2026-10-08)

1. La historia académica se queda en S1.
2. Correo: Resend, o el proveedor más barato equivalente; va detrás de `EmailProvider`, así que cambiarlo no toca el resto.
3. Claude tiene acceso de escritura al repositorio; trabaja en ramas `claude/*` con PR.

Valores por defecto adoptados salvo indicación contraria: bloqueo a los 5 intentos por correo y 20 por IP en 15 minutos (subir a 50 por IP si el instituto sale por una sola red); sesión de 7 días sin uso.

