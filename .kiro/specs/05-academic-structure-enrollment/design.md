# 05 · Estructura y matrícula — Diseño
**Migración:** `Course` actual → `Course` + `Offering(COHORT)`; `AcademicPeriod` → `AcademicYear` + `Term`; `teacherId` → `OfferingStaff`; mover `Enrollment`, `Assignment`, `Exam`, `GradingPeriod`, `AttendanceSession`, `ScheduleSlot` a `offeringId`. Eliminar `CourseModule` migrando su contenido a `Section`/`Lesson`.
**Presets de estructura** en `presets/{type}.structure.ts`.
**Matrícula:** `enroll(ctx, {offeringId, studentId, source})` única puerta: transacción con `SELECT … FOR UPDATE` sobre la oferta para cupo; valida reglas vía `enrollmentRules[type]`; emite evento `enrollment.created` (notificación, cargo si aplica).
**Inscripción universitaria:** pantalla "Inscribir materias" con oferta filtrada por plan de estudios, carrito de secciones, validación en vivo, envío a asesor.
**Finalización:** job nocturno + disparo al cerrar período o completar lección evalúa `completionRule`.
**UI:** `/academico/estructura`, `/academico/cursos`, `/academico/secciones`, `/academico/matricula`, `/academico/horario`, `/aprender/inscripcion`.
**Pruebas:** cupo con 20 inscripciones concurrentes; prerrequisito; choque de horario; promoción de año; contenido compartido entre dos ofertas con notas separadas.
