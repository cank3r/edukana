# 06 · Contenido y video — Diseño
**Editor:** Markdown con barra de herramientas (o TipTap con esquema restringido) → render saneado en servidor.
**Reordenar:** campo `order` con valores espaciados (clave fraccionaria) para evitar colisiones; normalización periódica.
**Video:** interfaz `VideoProvider { createUpload(), getPlaybackToken(assetRef, ttl), deleteAsset() }` con implementación para Mux, Cloudflare Stream o Bunny (credenciales de plataforma, uso medido por espacio). Flujo: `createUpload` → carga directa desde el navegador → webhook `asset.ready` (`WebhookEvent` idempotente) → `Asset.status=READY`. Reproductor HLS (`hls.js`) con token de 2 h ligado al usuario.
**Progreso:** `POST /api/progress` con `sendBeacon`; `LessonProgress` actualiza `Enrollment.progressPercent` (solo progreso).
**Liberación:** `isLessonAvailable(lesson, enrollment, now)` usado por DAL y UI.
**UI:** `/academico/cursos/[id]/contenido` (dos paneles), `/aprender/[offeringId]/leccion/[lessonId]`.
**Pruebas:** no matriculado no obtiene token; vista previa pública sí; lección futura bloqueada; webhook duplicado; XSS en contenido.
