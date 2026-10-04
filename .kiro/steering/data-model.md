---
inclusion: fileMatch
fileMatchPattern: "prisma/**"
---
# Edukana — Modelo de datos objetivo

Migrar desde el esquema actual sin perder datos. `Institution` → `Tenant`. Todos los modelos de negocio llevan `tenantId` e índice compuesto que empieza por él.

## Plataforma
`Plan(id, code, name, priceModel, prices, limits Json, features Json)`
`Tenant(id, slug @unique, name, type, status, planId, trialEndsAt, renewsAt, limits Json, modules Json, branding Json, terminology Json, createdAt)`
`TenantDomain(id, tenantId, host @unique, kind SUBDOMAIN|CUSTOM, verifiedAt, verificationToken)`
`TenantSetting(tenantId, key, value Json, updatedById, @@id([tenantId,key]))`
`TenantSecret(tenantId, key, ciphertext, @@id([tenantId,key]))`
`PlatformUser(userId, role)` · `SaasInvoice(id, tenantId, period, amountCents, currency, status)` · `UsageSnapshot(tenantId, date, students, storageBytes, videoMinutes, messages)`
`ImpersonationSession(id, operatorId, tenantId, targetUserId, reason, startedAt, expiresAt, endedAt)`

## Identidad
`User(id, email @unique, name, passwordHash?, emailVerifiedAt, sessionVersion, locale, status)`
`Membership(id, tenantId, userId, roleId, scopeType?, scopeId?, status, @@unique([tenantId,userId,roleId,scopeType,scopeId]))`
`Role(id, tenantId?, key, name, isSystem, permissions String[])`
`Invitation(id, tenantId, email, roleId, tokenHash, expiresAt, acceptedAt)` · `PasswordReset(tokenHash, userId, expiresAt, usedAt)` · `LoginAttempt`
`PersonProfile(id, tenantId, userId, code, documentId, birthDate, phone, address, customFields Json, sensitive Json)`
`Guardianship(id, tenantId, guardianUserId, studentUserId, relationship, perms Json, isFinancialResponsible, status)`

## Estructura
`Campus` · `AcademicYear` · `Term(yearId, name, startsAt, endsAt, weight, status OPEN|CLOSED)` · `Level` · `Program(levelId, name, kind)` · `Grade(programId, name, order)` · `Group(gradeId, yearId, name, homeroomUserId, capacity)` · `Room`
`Curriculum(programId, version)` · `CurriculumCourse(curriculumId, courseId, termNumber, credits, required)` · `Prerequisite(courseId, requiresCourseId)`

## Enseñanza
`Course(id, tenantId, title, slug, summary, description, level, language, categoryId?, credits?, hours?, coverAssetId, status DRAFT|IN_REVIEW|PUBLISHED|ARCHIVED, authorUserId)`
`Offering(id, tenantId, courseId, mode COHORT|SELF_PACED, termId?, groupId?, name, startsAt?, endsAt?, capacity?, completionRule, settings Json, priceCents?, currency?, visibility)`
`OfferingStaff(offeringId, userId, role TEACHER|ASSISTANT)`
`Enrollment(id, tenantId, offeringId, studentId, status ACTIVE|COMPLETED|WITHDRAWN|FAILED|WAITLISTED, source, progressPercent, finalGrade?, accessExpiresAt?, orderItemId?, @@unique([offeringId,studentId]))`
`Section(courseId, title, order)` · `Lesson(sectionId, title, type, body, durationSec, isPreview, publishAt?, requiresLessonId?, status)` · `LessonProgress(enrollmentId, lessonId, completedAt, lastPositionSec, watchedSec)`
`Asset(id, tenantId, kind, provider, providerRef, objectPath, mime, bytes, status, visibility, ownerRefs…)`
`ScheduleSlot(offeringId, weekday, start, end, roomId)` · `LiveSession(offeringId, startsAt, joinUrl, recordingAssetId?)`

## Evaluación
`Rubric` · `RubricCriterion` · `RubricLevel`
`Assignment(offeringId, title, instructions, dueAt, maxScore, submissionTypes, maxAttempts, latePolicy Json, rubricId?, categoryId?, status)`
`Submission(assignmentId, enrollmentId, attemptNumber, content, status, submittedAt, isLate, score?, feedback, gradedById, @@unique([assignmentId,enrollmentId,attemptNumber]))`
`QuestionBankItem(courseId, type, prompt, options Json, answerKey Json, points, tags[])`
`Exam(offeringId, title, opensAt, closesAt, durationMin, maxAttempts, gradingPolicy, shuffle, showResults, selection Json, categoryId?, status)`
`ExamAttempt(examId, enrollmentId, attemptNumber, status, startedAt, expiresAt, submittedAt, questionOrder Json, score, maxScore)` · `ExamAnswer(attemptId, bankItemId, response Json, score, feedback)`
`GradeCategory(offeringId, termId, name, weight, dropLowest)` · `GradeItem(offeringId, termId, categoryId, title, maxScore, sourceType, sourceId, publishedAt)` · `GradeEntry(gradeItemId, enrollmentId, score, excused, comment, gradedById)`
`TermGrade(enrollmentId, termId, value, lockedAt)` · `ReportCard(studentId, termId, assetId, issuedAt)`
`AttendanceSession(offeringId|groupId, date, takenById)` · `AttendanceRecord(sessionId, enrollmentId|studentId, status, note, justification Json)`
`BehaviorRecord(studentId, type, severity, note, visibleToFamily, recordedById)` · `CounselingNote(studentId, authorId, bodyEncrypted)`

## Comunicación
`Announcement(audience Json, title, body, publishAt, pinned, authorId)` · `Conversation` · `ConversationParticipant` · `Message`
`ForumThread(offeringId, lessonId?, title, authorId, status)` · `ForumPost`
`Notification(userId, type, payload, readAt)` · `NotificationPreference` · `OutboundMessage(channel, to, template, status, attempts, error)` · `MessageTemplate`
`CalendarEvent(audience Json, title, startsAt, endsAt, kind)`

## Admisiones
`AdmissionForm(fields Json)` · `Application(stage, applicant Json, guardians Json, programId, documents, assignedToId, consentAt)` · `ApplicationEvent`

## Dinero
`FeePlan` · `FeePlanItem(concept, amountCents, schedule)` · `Discount(kind, value, rules)` · `StudentDiscount`
`Charge(studentId, concept, amountCents, currency, dueDate, status, feePlanItemId?, termId?)`
`Payment(amountCents, currency, method, provider, providerRef @unique, status, paidAt, receiptNumber, fiscalNumber?, recordedById)` · `PaymentAllocation(paymentId, chargeId, amountCents)`
`Category` · `Coupon(code, kind, value, maxUses, validFrom, validTo, courseIds)` · `Order(buyerUserId, status, subtotalCents, discountCents, totalCents, currency)` · `OrderItem(orderId, offeringId, priceCents, instructorSharePct)`
`Review(enrollmentId @unique, rating, body, status)` · `InstructorEarning(orderItemId, instructorId, amountCents, status)` · `Payout(instructorId, period, amountCents, status, reference)`
`Certificate(enrollmentId, code @unique, hmac, issuedAt, revokedAt, assetId)`

## Sistema
`AuditLog(tenantId?, actorId, impersonatorId?, action, entityType, entityId, before Json, after Json, ip, at)` · `Job(type, payload, runAt, attempts, status, lastError)` · `WebhookEvent(provider, externalId @unique, payload, processedAt)` · `Consent(userId, tenantId, textVersion, acceptedAt, ip)`
