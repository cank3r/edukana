# 07 · Tareas y exámenes — Diseño
**Datos:** ver `data-model.md` (Submission con `attemptNumber`, `ExamAttempt` con `expiresAt`, `Accommodation(enrollmentId, targetType, targetId, extraMinutes, extraAttempts, dueAtOverride)`).
**Política de nota:** `resolveScore(attempts, policy)` única; se invoca en la misma transacción que escribe `GradeEntry`.
**Examen:**
- `startAttempt`: transacción + índice único `(examId, enrollmentId, attemptNumber)` + bloqueo consultivo por `(examId, enrollmentId)`; devuelve el intento en curso si existe.
- `saveAnswer`: upsert por pregunta; rechaza si `now > expiresAt + gracia`.
- `submitAttempt`: califica automáticas, calcula, escribe nota.
- Job cada minuto cierra intentos vencidos.
- El cliente recibe preguntas sin `answerKey`; el temporizador se calcula con `expiresAt` del servidor.
**Calificador:** ruta `/ensenar/[offeringId]/tareas/[id]/calificar?e=enrollmentId` con navegación por teclado; visor de PDF/imagen con URL firmada.
**Pruebas:** concurrencia de inicio; envío fuera de tiempo; reentrega tras calificación; penalización por tardanza; adecuación; fuga de clave de respuesta (inspeccionar payload RSC).
