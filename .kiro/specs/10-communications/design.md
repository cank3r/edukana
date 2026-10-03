# 10 · Comunicación — Diseño
**Bus de eventos de dominio:** `emit(ctx, 'grade.published', payload)` → suscriptores resuelven destinatarios, preferencias y canales → `Notification` + `OutboundMessage` → jobs por canal.
**Interfaces:** `EmailProvider`, `WhatsAppProvider`, `PushProvider`, `MeetingProvider` con credenciales del espacio (o de plataforma como respaldo, contando contra el límite).
**Audiencia:** `resolveAudience(ctx, audienceJson) → userIds` y `visibleAnnouncementsWhere(ctx)` únicos para lista, conteo y envío.
**Plantillas:** MJML/React Email con tema; variables validadas.
**iCal:** `/api/ical/[token].ics`.
**UI:** `/comunicacion/avisos`, `/comunicacion/mensajes`, `/comunicacion/plantillas`, `/comunicacion/envios`, `/calendario`, campana en la barra superior.
**Pruebas:** preferencias; horas de silencio; audiencia combinada; reintentos; aviso por oferta no visible fuera de ella.
