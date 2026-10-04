# 10 · Comunicación, notificaciones, calendario y clases en vivo — Requisitos

### Requisito 1 — Notificaciones
1. Eventos: invitación, tarea publicada, entrega por vencer, nota publicada, ausencia, aviso nuevo, mensaje nuevo, cargo por vencer/vencido, pago recibido, matrícula, certificado emitido, sesión en vivo por comenzar.
2. Canales: en la aplicación, correo, WhatsApp, push; el espacio define cuáles; el usuario ajusta por tipo.
3. El envío SHALL ser en segundo plano, con reintentos, respetando horas de silencio y límites del plan.
4. Las plantillas SHALL ser editables por espacio con variables y vista previa, y llevar su marca.
5. SHALL existir registro de envíos con estado y error.

### Requisito 2 — Avisos
1. Audiencias: todo el espacio, rol, sede, nivel, grado/grupo, programa, oferta, combinadas.
2. Antes de publicar SHALL mostrarse cuántas personas lo recibirán.
3. Programar, fijar, adjuntar, exigir acuse de lectura.
4. IF `comm.announcementApprovalRequired` THEN los avisos de docentes SHALL pasar por aprobación.
5. Conteos y listas SHALL usar la misma función de visibilidad.

### Requisito 3 — Mensajes
1. Conversaciones entre personal, docente–estudiante y docente–tutor según parámetros.
2. Estudiante–estudiante SHALL estar apagado por defecto.
3. Reportar mensaje y moderación con `message.moderate`.

### Requisito 4 — Foros
1. Hilos por oferta y por lección; fijar, cerrar, marcar respuesta del docente; en marketplace funcionan como preguntas y respuestas.

### Requisito 5 — Calendario
1. Vista mensual, semanal y agenda combinando horario, entregas, exámenes, sesiones en vivo y eventos, filtrada por rol y por hijo.
2. CRUD de eventos con audiencia; feriados del espacio.
3. Suscripción iCal con token personal revocable.

### Requisito 6 — Clases en vivo
1. Sesión con fecha, enlace externo y grabación adjunta posterior.
2. IF hay integración (Zoom, Meet) THEN SHALL crearse la reunión automáticamente e importarse asistencia.
