# S1 · Seguridad y pruebas reales — Diseño (propuesta)

**Estado:** PROPUESTA, no es spec. No se implementa hasta que S0-GOV esté DONE y exista el claim S1-SEC en `TEAM-COORDINATION.md`.
**Base:** `0e67a91`. **Autor:** Claude. **Fecha:** 2026-10-08.

## Diseño

**Contexto de petición — `src/server/context.ts`**
```
getRequestContext = cache(async () => {
  session = await auth()                      // JWT: sub, sv
  user = db.user.findUnique({ id: sub, select: id, status, role, institutionId, sessionVersion })
  if (!user || user.status !== "ACTIVE" || user.sessionVersion !== sv) return null
  capabilities = getEffectiveCapabilities(user.institutionId, user.role)
  return { user, institutionId, role, capabilities }
})
requireContext(capability?)   // lanza o redirige; reemplaza a requireUser y a la lectura directa de sesión
```
Una consulta de usuario más una de overrides por petición; ambas memoizadas. Se sustituyen los `requireUser` locales de cada archivo de acciones, el layout y los cuatro handlers de API por `requireContext`. Es un cambio mecánico y es la primera pieza de `src/server`.

**Modelos nuevos (una sola migración aditiva `s1_security`)**
```
User              + sessionVersion Int @default(0)
LoginAttempt      id, emailHash, ipHash, succeeded, createdAt     @@index([emailHash, createdAt]) @@index([ipHash, createdAt])
PasswordResetToken id, userId, tokenHash @unique, expiresAt, usedAt, createdAt   @@index([userId])
ExamAttempt       + expiresAt DateTime?
Enrollment, Assignment, Submission, ExamQuestion, ExamAnswer
                  + institutionId String?  + @@index([institutionId, ...])   (NOT NULL en migración s1_security_enforce)
PaymentConcept    + amountCents Int?  + relación student  + @@index([institutionId, status])
ExamQuestion      + snapshot Json?            (tipo, enunciado, opciones, clave, puntos; se llena al publicar; backfill desde el banco)
SubmissionRevision id, institutionId, submissionId, content, assetIds Json, submittedAt   @@index([institutionId, submissionId])
GradeEntryRevision id, institutionId, gradeEntryId, previousScore, newScore, previousFeedback, reason, actorId, createdAt   @@index([institutionId, gradeEntryId])
AuditLog          + @@index([institutionId, createdAt])
AdmissionLead     + @@index([institutionId, stage])
CalendarEvent     + @@index([institutionId, startDate])
```
`LoginAttempt` guarda hashes, no correos ni IP en claro. Se usa Postgres y no Redis porque Vercel es serverless y no hay otro almacén; la limpieza es un borrado por fecha en la misma consulta de inserción.

**Límite de intentos:** función `checkLoginAllowed(email, ip)` antes de `bcrypt.compare`, y `recordLoginAttempt` después. La IP sale de `x-forwarded-for` (primer valor) tal como la entrega Vercel.

**Correo:** `src/server/integrations/email/` con `EmailProvider { send(to, template, data) }`, implementación `ResendEmailProvider` y `MemoryEmailProvider` para pruebas. Sin clave configurada, el envío falla de forma visible en logs y la respuesta al usuario sigue siendo la genérica.

**Examen:** `startExamAttempt` y `submitExamAttempt` en `src/server/actions/exams.ts`. Ambas en transacción con bloqueo de la fila de matrícula (`SELECT … FOR UPDATE`) para serializar por estudiante. Las respuestas se envían completas al enviar, como hoy; el guardado parcial queda para la spec 07. La pantalla necesita un botón "Iniciar examen" y un contador: **eso es interfaz y corresponde a Kiro**.

**Pruebas:** `tests/integration/**` con `node:test`, una base por ejecución creada con `migrate deploy`, semilla `tests/integration/seed.ts` (dos instituciones × seis roles, un curso con matrícula en cada una). En CircleCI, imagen secundaria `cimg/postgres`. Se invocan las acciones reales con un contexto inyectado; para eso `requireContext` acepta un proveedor de sesión sustituible en pruebas.

**`institutionId` y S3.** S3 cambiará `courseId` por `offeringId` en `Enrollment`, `Assignment` y `Submission`, pero `institutionId` no depende de esa relación: la columna y su índice sobreviven sin cambios. Son dos migraciones (`s1_security` aditiva y `s1_security_enforce` con `NOT NULL`), separadas por el backfill y su verificación.

**Compatibilidad y rollback.** Todo en `s1_security` es aditivo: revertir es desplegar el código anterior, que ignora columnas y tablas nuevas. `s1_security_enforce` solo se aplica después de que el código que escribe `institutionId` esté desplegado. `amount` (Float) se conserva en lectura dual hasta S6.

**Amenazas cubiertas.** Sesión robada o cuenta suspendida con token vigente (R2); fuerza bruta y relleno de credenciales (R3); enumeración de cuentas y reutilización de enlaces (R4); toma del primer administrador en una base vacía y runner apuntando a producción (R6); acceso residual a archivos tras revocar (R7); fuga entre instituciones por relación incompleta (R10).

## Reparto y claims propuestos

| Claim | Agente | Alcance exclusivo | Depende de |
|---|---|---|---|
| S1-SEC-A | Claude | Migración `s1_security`, `src/server/context.ts`, sustitución de `requireUser`, `LoginAttempt`, recuperación (servidor), `EmailProvider`, acciones de examen (servidor), historia académica (servidor), `tests/integration/**`, Postgres en `.circleci/config.yml` | S0-GOV DONE |
| S1-SEC-B | Kiro | Pantallas: solicitar y restablecer contraseña, "Iniciar examen" con contador, `/setup` con token, mensajes de bloqueo; E2E y Preview | S1-SEC-A en REVIEW (contratos de acciones publicados) |
| S1-SEC-C | Codex | Revisión adversarial: enumeración de cuentas, carrera de intentos, reutilización de token, sesión tras suspensión, URL firmada tras revocación; textos de las pantallas nuevas | A y B en REVIEW |

Un solo escritor del esquema: S1-SEC-A. Kiro no necesita tocar `prisma/` en este sprint.

## Orden de entrega dentro de S1-SEC-A

1. Postgres en CI y semilla de dos instituciones (sin cambiar código de producto).
2. Migración `s1_security`.
3. `getRequestContext` y sustitución de `requireUser`; pruebas de suspensión.
4. Límite de intentos.
5. Recuperación de contraseña (servidor y correo).
6. Examen: iniciar y enviar.
6b. Historia académica: instantánea de preguntas, revisiones de entrega y de nota.
7. `/setup` con token y endpoint de identidad de entorno.
8. Backfill de `amountCents` e índices.

Cada paso es un commit con sus pruebas; Kiro puede empezar S1-SEC-B al terminar el paso 6.

