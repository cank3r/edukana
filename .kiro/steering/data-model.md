---
inclusion: fileMatch
fileMatchPattern: "prisma/**"
---
# Edukana — Modelo de datos vigente y objetivo

Migrar desde el esquema actual sin perder datos. Se conserva `Institution`/`institutionId`. Todo modelo de negocio nuevo lleva `institutionId` físico e índice que comienza por él.

## Estado actual

El esquema contiene instituciones, usuarios ligados a institución, períodos, cursos, secciones, lecciones, matrículas, asistencia, notas, tareas, entregas, exámenes, horarios básicos, assets, certificados, admisiones, cobros, anuncios, unidades, tutorías, overrides y auditoría. El legado está en `docs/legacy-cleanup.md`.

## Plataforma objetivo

- `Plan(id, code, name, limits Json, features Json)`.
- `Institution(id, slug, name, type, status, planId, branding Json, terminology Json, settings Json)`.
- `InstitutionDomain(id, institutionId, host, kind, verifiedAt)`.
- `InstitutionSetting(institutionId, key, value Json, updatedById)`.
- `InstitutionSecret(institutionId, key, ciphertext)`.
- `PlatformUser(userId, role)`.
- `UsageSnapshot(institutionId, date, students, storageBytes, videoMinutes, messages)`.
- `ImpersonationSession(operatorId, institutionId, targetUserId, reason, expiresAt, endedAt)`.

## Identidad aprobada

- `User(id, email @unique, name, passwordHash?, emailVerifiedAt, sessionVersion, locale, status)`.
- `Membership(id, institutionId, userId, role, status, scopeType?, scopeId?)`.
- `Invitation(institutionId, email, role, tokenHash, expiresAt, acceptedAt)`.
- `PasswordReset(userId, tokenHash, expiresAt, usedAt)`.
- `LoginAttempt(emailHash, ipHash, occurredAt, success)`.
- `PersonProfile(institutionId, userId, code, phone, customFields Json, sensitiveEncrypted Json)`.
- `Guardianship` conserva relaciones institucionales y permisos por área.

Migración: crear memberships desde usuarios actuales, cambiar autenticación a lectura dual y retirar `User.institutionId/role` solo al final.

## Estructura académica

- `Campus`, `Room`, `AcademicYear`, `Term`.
- `Program`, `Curriculum`, `CurriculumCourse`.
- `Cohort` y `StudentGroup`.

## Curso y oferta aprobados

- `Course(institutionId, title, code, summary, description, language, authorUserId, status)` conserva contenido reusable.
- `Offering(institutionId, courseId, mode COHORT|SELF_PACED, termId?, cohortId?, groupId?, startsAt?, endsAt?, capacity?, priceCents?, currency?, status)` representa una ejecución.
- `OfferingStaff(institutionId, offeringId, userId, role TEACHER|ASSISTANT|SUBSTITUTE)` permite varios docentes.
- `Enrollment(institutionId, offeringId, studentId, status, progressPercent, finalGrade?, accessExpiresAt?)`.
- Secciones y lecciones siguen ligadas a `Course`; tareas, exámenes, notas, asistencia y horario migran a `Offering`.

## Semana híbrida aprobada

- `MeetingPattern(institutionId, offeringId, groupId?, weekday, frequency, startMinutes, endMinutes, participationMode, synchronicity, pedagogicalType, roomId?, virtualRoomId?, startsOn, endsOn)`.
- `ClassSession(institutionId, offeringId, patternId?, startsAt, endsAt, participationMode, synchronicity, pedagogicalType, roomId?, virtualRoomId?, status, title, objectives, summary)`.
- `ClassSessionTeacher`, `ClassSessionResource` y `ClassSessionChange`.
- `VirtualRoom(institutionId, offeringId, provider, providerRef, settingsEncrypted)`.
- `ClassRecording(institutionId, classSessionId, assetId, publishedAt)`.
- `HolidayCalendar` y `ScheduleException`.
- Asistencia pertenece a `ClassSession`, con modo presencial, remoto o asincrónico.

## Contenido y video

- `Asset` conserva tenant, propietario, proveedor, referencia, MIME, bytes, estado y visibilidad.
- Documentos/imágenes continúan en Storage privado.
- Video migra mediante `VideoProvider`, con procesamiento, duración y playback seguro.

## Evaluación

- `Assignment(institutionId, offeringId, ..., maxAttempts, latePolicy, rubricId?, status)`.
- `Submission(institutionId, assignmentId, enrollmentId, attemptNumber, ..., status)`.
- `Rubric`, `RubricCriterion`, `RubricLevel`.
- `QuestionBankItem` permanece en Course y añade categorías, tags y versiones.
- `Exam(institutionId, offeringId, ..., durationMin, maxAttempts, status)`.
- `ExamAttempt(..., startedAt, expiresAt, submittedAt)` aplica tiempo en servidor.
- `GradeCategory`, `GradeItem`, `GradeEntry`, `TermGrade` y `ReportCard` llevan `institutionId`.

## Comunicación

- Mantener anuncios normalizados actuales.
- `Notification`, `NotificationPreference`.
- `Conversation`, `ConversationParticipant`, `Message`.
- `OutboundMessage` y `MessageTemplate`.
- Eventos pueden apuntar a sesión, tarea, examen o evento institucional.

## Admisiones y cobros

- `AdmissionForm`, `Application`, `ApplicationDocument`, `ApplicationEvent` y responsable.
- Conversión explícita a identidad, membresía, cohorte y matrícula.
- `FeePlan`, `FeePlanItem` y `Charge` en centavos.
- `PaymentRecord` representa pago externo y `PaymentCorrection` revierte sin borrar.
- Pasarela, órdenes, cupones y liquidaciones entran con marketplace.

## IA posterior

- `AiSetting(institutionId, enabled, monthlyBudgetCents, provider)`.
- `AiGeneration(institutionId, userId, feature, tokenUsage, costCents, status, createdAt)`.
- Ninguna salida se publica o califica sin acción humana.

## Sistema

- `AuditLog` uniforme con actor y before/after.
- `Job` idempotente y reintentable.
- `WebhookEvent` deduplicado.
- `Consent` versionado.

## Reglas de migración

1. Añadir columnas/modelos.
2. Backfill verificable.
3. Lectura dual temporal.
4. Cambiar escrituras.
5. Medir referencias legacy.
6. Retirar solo con autorización y rollback documentado.
